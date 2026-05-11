import {fork} from 'child_process'
import {Context, WorkerError, WorkerErrorCode, WorkerResult} from './types.js'
import {createSignalLogger, SignalContext} from './signal.js'
import {formatWorkerResult} from '../util/format.js'
import {ensureDirSync} from '../util/fs.js'
import {fileURLToPath} from 'url'

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

function containerManager(opts: {child: any; signal: SignalContext; ctx: Context; start: number}) {
  const {child, signal, ctx, start} = opts

  return new Promise((resolve, reject) => {
    const logger = createSignalLogger(signal)
    logger.system('container manager started')

    ensureDirSync(ctx.meta.dist)
    logger.system(`found dist`, {dist: ctx.meta.dist})

    let completed = false

    const cleanup = () => {
      if (child.connected) {
        logger.system('disconnecting container')

        child.removeAllListeners('message')

        child.disconnect()
      }
    }

    // collect stdout/err logs -> Signals
    child.stdout?.on('data', collector(signal, 'stdout'))
    child.stderr?.on('data', collector(signal, 'stderr'))

    const startGuard = () => {
      const opts = {child, limits: ctx.meta.limits, signal}
      logger.system('worker guard started')

      startWorkerGuard(opts, (reason) => {
        if (completed) return

        const duration = performance.now() - start
        logger.activation('worker guard suspended activation', {
          version: ctx.meta.version,
          ok: false,
          error: reason.message,
          duration,
        })

        cleanup()
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

      reject(msg.error)
      cleanup()
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

      // normal errors are wrapped inside the process
      if (ctx.meta.output.mode === 'raw') {
        resolve(result?.result)
      } else {
        resolve(result)
      }

      cleanup()
    }

    child.on('message', (msg: ChildMessage) => {
      if (msg.type === 'ALIVE') return
      if (msg.type === 'DONE') return finish(msg)
      if (msg.type === 'ERROR') return fatal(msg)

      logger.warn(`unknown message type ${(msg as any).type}0`)
    })
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

export async function runWorker<T>(opts: {ctx: Context<T>; signal: SignalContext}) {
  const start = performance.now()
  const {ctx, signal} = opts

  signal.emit({type: 'system', message: 'starting container'})

  // TODO: remove hardcoded worker path
  const path = resolveProcessPath()
  const child = fork(path, {
    stdio: ['inherit', 'pipe', 'pipe', 'ipc'],
    // hard limit results in V8 errors
    // so use carefully
    execArgv: [`--max-old-space-size=512`],
    env: {
      ...ctx.env,
      XGSD_WORKER_VERSION: ctx.meta.version,
      XGSD_CTX: JSON.stringify(ctx),
    },
  })

  return containerManager({child, signal, ctx, start})
}

type WorkerGuardOpts = {
  signal: SignalContext
  child: any
  limits: {ttl: number; memory: number}
}

function startWorkerGuard(opts: WorkerGuardOpts, suspended?: (reason: WorkerError) => void) {
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
    const heapUsed = msg.memory?.heapUsed ?? 0
    const memMB = heapUsed / 1024 / 1024

    if (memMB > memory) {
      kill(`memory limit exceeded: ${memMB.toFixed(2)}MB/${memory.toFixed(2)}MB`)
    }
  })

  child.on('exit', () => {
    if (ttlTimer) clearTimeout(ttlTimer)
  })
}
