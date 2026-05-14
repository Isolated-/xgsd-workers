import {fork} from 'child_process'
import {Context, WorkerGuardOpts, WorkerResult} from './types.js'
import {WorkerError, WorkerErrorCode} from '../types/error.types.js'
import {createSignalLogger, SignalContext} from './signal.js'
import {formatWorkerResult} from '../util/format.js'
import {fileURLToPath} from 'url'
import {DEFAULTS} from '../constants.js'
import {numberFixed2} from '../process/workers.runtime.js'

type ChildMessage<T = unknown> =
  | {type: 'ALIVE'; error: undefined; result: undefined}
  | {type: 'DONE'; result: WorkerResult<T>; error: undefined | null; memoryUsage: number}
  | {type: 'ERROR'; result: undefined | null; error: WorkerError}

function isCoreSignal(object: Record<string, any>) {
  return object.__sys || (object.type && object.message && object.meta)
}

function collector(signal: SignalContext, type: 'stdout' | 'stderr') {
  return (chunk: any) => {
    const lines = chunk.toString().split('\n').filter(Boolean)

    for (const line of lines) {
      try {
        const json = JSON.parse(line)

        // core signals = __sys or structured logs
        // sent by usercode/child process
        if (isCoreSignal(json)) {
          signal.emit(json)
        } else {
          // unstructured json logs are wrapped as generic
          // allowing users to define their own structure
          signal.emit({
            type: 'generic',
            message: json.message ?? 'generic',
            meta: json,
          })
        }
      } catch {
        // fallback
        signal.emit({
          type: type === 'stderr' ? 'error' : 'log',
          message: line,
        })
      }
    }
  }
}

function containerManager<T>(opts: {child: any; signal: SignalContext; ctx: Context<T>; start: number}) {
  const {child, signal, ctx, start} = opts

  return new Promise((resolve, reject) => {
    const logger = createSignalLogger(signal)

    let completed = false
    let killed = false

    const cleanup = (sig: NodeJS.Signals = 'SIGINT') => {
      if (sig === 'SIGKILL' && !killed) {
        logger.system(`force killing container (pid: ${child.pid ?? 'unknown'})`)

        killed = true
        child.kill(sig)
        return
      }

      if (child.connected) {
        logger.system(`disconnecting container (pid: ${child.pid ?? 'unknown'})`)

        child.removeAllListeners('message')

        child.disconnect(sig)
      }
    }

    // collect stdout/err logs -> Signals
    child.stdout?.on('data', collector(signal, 'stdout'))
    child.stderr?.on('data', collector(signal, 'stderr'))

    const throttler = (mem: {rss: number; heap: number}) => {
      const {memory} = ctx.meta.limits
      const limitMB = typeof memory === 'number' ? memory : memory.limitMB
      if (typeof memory === 'number' || memory.strategy === 'heap') {
        const heapMB = mem.heap / 1024 / 1024
        return heapMB > limitMB
      }

      if (memory.strategy !== 'rss') {
        logger.warn(`"${memory.strategy}" is not a valid strategy, "rss" will be used.`)
      }

      const rssMB = mem.rss / 1024 / 1024
      return rssMB > limitMB
    }

    const startGuard = () => {
      const opts = {child, limits: ctx.meta.limits, signal, throttler}
      logger.system('worker guard started')

      startWorkerGuard(opts, (reason) => {
        if (completed) return

        const duration = Number((performance.now() - start).toFixed(2))
        logger.activation('worker guard suspended activation', {
          version: ctx.meta.version,
          ok: false,
          error: reason.message,
          duration,
        })

        cleanup()

        if (ctx.meta.limits.onError === 'throw') {
          return reject({...reason, stack: null})
        }

        resolve(formatWorkerResult({error: reason, duration}))
      })
    }

    startGuard()

    function fatal(msg: ChildMessage) {
      logger.activation('fatal', {
        version: ctx.meta.version,
        ok: false,
        error: msg.error?.code ?? msg.error?.message ?? 'unknown',
        duration: performance.now() - start,
      })

      // centralise error logging here
      // vs in child process
      logger.error(`${msg.error?.message ?? 'unknown'} (${msg.error?.code ?? 'unknown'})`, msg.error ?? undefined)

      cleanup()
      reject(msg.error)
    }

    let signalCount = 0

    // this should become part of WorkerGuard
    // eventually
    function termination() {
      if (killed) return

      const error = {
        code: WorkerErrorCode.CODE_WORKER_ABORTED,
        message: `worker has been aborted`,
        type: 'user',
      }

      cleanup('SIGKILL')
      reject(error)
    }

    let timeout: NodeJS.Timeout
    function handleSignal(sig: NodeJS.Signals) {
      signalCount++

      if (signalCount === 1) {
        logger.warn(
          `${sig} received, process will shutdown in ${numberFixed2(DEFAULTS.defaultTerminationTime / 1000)}s. Use CTRL+C to force shutdown.`,
        )

        cleanup('SIGTERM')

        timeout = setTimeout(termination, DEFAULTS.defaultTerminationTime)
        return
      }

      if (signalCount === 2) {
        logger.warn(`final ${sig} received, forcing process to exit`)

        clearTimeout(timeout)
        termination()
      }
    }

    function finish(msg: ChildMessage) {
      const {result, memoryUsage} = msg as any
      const duration = performance.now() - start

      // TODO: this should always be the final signal sent
      // move it outside of this function eventually
      logger.activation(`activation completed in ${duration.toFixed(2)} ms`, {
        version: ctx.meta.version,
        ok: true,
        error: null,
        duration,
      })

      logger.metric({
        version: ctx.meta.version,
        duration,
        memoryUsage,
        ok: true,
      })

      result.duration = Number(duration.toFixed(2))

      cleanup()

      // normal errors are wrapped inside the process
      if (ctx.meta.output.mode === 'raw') {
        resolve(result?.result)
      } else {
        resolve(result)
      }
    }

    child.on('message', (msg: ChildMessage) => {
      if (msg.type === 'ALIVE') return
      if (msg.type === 'DONE') return finish(msg)
      if (msg.type === 'ERROR') return fatal(msg)

      logger.warn(`unknown message type ${(msg as any).type}`)
    })

    process.on('SIGINT', handleSignal)
  })
}

function resolveProcessPath() {
  const isTest = process.env.XGSD_NODE_ENV === 'test'

  // this is so brittle
  const path = fileURLToPath(
    new URL(isTest ? '../../dist/process/workers.process.js' : '../dist/process/workers.process.js', import.meta.url),
  )

  return path
}

export async function runWorker<T = any>(opts: {ctx: Context<T>; signal: SignalContext}) {
  const start = performance.now()
  const {ctx, signal} = opts

  signal.emit({type: 'system', message: 'starting container'})

  // TODO: remove hardcoded worker path
  const path = resolveProcessPath()
  const child = fork(path, {
    stdio: ['inherit', 'pipe', 'pipe', 'ipc'],
    // hard limit results in V8 errors
    // so use carefully
    //execArgv: [`--max-old-space-size=512`],
    env: {
      ...ctx.env, // <- this may not be needed as dotenv can be used inside the worker
      XGSD_WORKERS_VERSION: ctx.meta.version,
    },
  })

  child.send({type: 'START', ctx})

  return containerManager<T>({child, signal, ctx, start})
}

type Throttler = (memory: {rss: number; heap: number}) => boolean

type GuardOpts = {
  signal: SignalContext
  child: any
  limits: WorkerGuardOpts
  throttler: Throttler
}

function startWorkerGuard(opts: GuardOpts, suspended?: (reason: WorkerError) => void) {
  const {child, signal} = opts
  const {ttl, memory} = opts.limits

  let ttlTimer: NodeJS.Timeout | null = null
  let killed = false

  const kill = (reason: string) => {
    if (killed) return
    killed = true

    if (ttlTimer) clearTimeout(ttlTimer)

    child.kill('SIGKILL')

    const err: WorkerError = {
      code: WorkerErrorCode.CODE_WORKER_GUARD,
      message: reason,
      type: 'system',
    }

    signal.emit({
      type: 'error',
      message: `process killed ${reason}`,
      meta: {...err, guard: true},
    })

    suspended?.(err)
  }

  // TTL watchdog
  ttlTimer = setTimeout(() => {
    kill(`ttl exceeded limit (limit: ${ttl.toFixed(2)}ms)`)
  }, ttl)

  child.on('message', (msg: any) => {
    if (msg.type !== 'ALIVE') {
      return
    }

    // (v0.1.0) this isn't set in stone
    // may be worth using RSS
    // (v1-beta) let caller decide how to throttle
    const limit = typeof memory === 'number' ? memory : memory.limitMB
    const shouldThrottle = opts.throttler({
      rss: msg.memory?.rss,
      heap: msg.memory?.heapUsed,
    })

    if (shouldThrottle) {
      kill(`memory limit exceeded (limit: ${limit.toFixed(2)}MB)`)
    }
  })

  child.on('exit', () => {
    if (ttlTimer) clearTimeout(ttlTimer)
  })
}
