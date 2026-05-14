import {fork} from 'child_process'
import {Context, WorkerGuardOpts} from './types.js'
import {WorkerError, WorkerErrorCode} from '../types/error.types.js'
import {createSignalLogger, SignalContext} from './signal.js'
import {formatWorkerResult} from '../util/format.js'
import {fileURLToPath} from 'url'
import {DEFAULTS} from '../constants.js'
import {numberFixed2} from '../process/workers.runtime.js'
import {startWorkerGuard, workerGuardThrottler} from './worker-guard.js'
import {WorkerResult} from '../types/result.types.js'

type ChildMessage<T = unknown> =
  | {type: 'ALIVE'; error: undefined; result: undefined}
  | {type: 'DONE'; result: WorkerResult<T>; error: undefined | null; memoryUsage: number}
  | {type: 'ERROR'; result: undefined | null; error: WorkerError}

export async function runWorker<T = any>(opts: {ctx: Context<T>; signal: SignalContext; mode?: 'default' | 'debug'}) {
  const start = performance.now()
  const {ctx, signal, mode} = opts

  // TODO: remove hardcoded worker path
  const path = resolveProcessPath()
  const child = fork(path, {
    stdio: mode === 'debug' ? 'inherit' : ['inherit', 'pipe', 'pipe', 'ipc'],
    serialization: 'json',
    // hard limit results in V8 errors
    // so use carefully
    //execArgv: [`--max-old-space-size=512`],
    env: {
      ...ctx.env, // <- this may not be needed as dotenv can be used inside the worker
      XGSD_WORKERS_VERSION: ctx.meta.version,
    },
  })

  const pid = child.pid!
  if (!processes.has(pid)) {
    processes.set(pid, {
      pid,
      start: Date.now(),
      status: 'running',
    })
  }

  child.once('exit', () => {
    processes.delete(pid)
  })

  child.send({type: 'START', ctx})

  return containerManager<T>({child, signal, ctx, start})
}

function containerManager<T>(opts: {child: any; signal: SignalContext; ctx: Context<T>; start: number}) {
  const {child, signal, ctx, start} = opts
  let completed = false
  let killed = false

  const logger = createSignalLogger(signal)

  return new Promise((resolve, reject) => {
    // collect stdout/err logs -> Signals
    child.stdout?.on('data', collector(signal, 'stdout'))
    child.stderr?.on('data', collector(signal, 'stderr'))

    let timeout: NodeJS.Timeout
    let cleaningUp = false

    // move this
    const cleanup = async (sig: NodeJS.Signals = 'SIGINT') => {
      if (cleaningUp) return
      cleaningUp = true

      const meta = processes.get(child.pid)

      if (meta) {
        meta.status = 'stopping'
      }

      process.off('SIGINT', sigintHandler)

      child.once('exit', () => {
        clearTimeout(timeout)
      })

      if (sig === 'SIGKILL') {
        logger.warn(`force killing container (${child.pid})`)

        child.kill('SIGKILL')
        return
      }

      logger.system(`gracefully stopping container (${child.pid})`)

      child.kill('SIGTERM')

      timeout = setTimeout(() => {
        if (child.exitCode === null) {
          logger.warn(`escalating to SIGKILL (${child.pid})`)

          child.disconnect()
          child.kill('SIGKILL')
        }
      }, DEFAULTS.defaultTerminationTime)
    }

    const sigintHandler = handleSignalFactory({logger, cleanup, reject, killed})

    if (!started) {
      process.on('exit', registerProcessGuard(createSignalLogger(signal), ctx.contextId, ctx.activationId!))
      process.on('SIGINT', sigintHandler)
      started = true
    }

    const throttler = workerGuardThrottler(ctx, logger)
    const startGuard = () => {
      const opts = {child, limits: ctx.meta.limits, signal, throttler}
      logger.system('worker guard started')

      startWorkerGuard(opts, async (reason) => {
        if (completed) return

        const duration = Number((performance.now() - start).toFixed(2))

        await cleanup()

        if (ctx.meta.limits.onError === 'throw') {
          return reject({...reason, stack: null})
        }

        resolve(formatWorkerResult({error: reason, duration}))
      })
    }

    startGuard()

    child.on('message', (msg: ChildMessage) => {
      if (msg.type === 'ALIVE') return
      if (msg.type === 'DONE') return finish(msg)
      if (msg.type === 'ERROR') return fatal(msg)

      logger.warn(`unknown message type ${(msg as any).type}`)
    })

    async function fatal(msg: ChildMessage) {
      // centralise error logging here
      // vs in child process
      logger.error(`${msg.error?.message ?? 'unknown'} (${msg.error?.code ?? 'unknown'})`, msg.error ?? undefined)

      await cleanup()
      reject(msg.error)
    }

    async function finish(msg: ChildMessage) {
      const {result} = msg as any
      const duration = performance.now() - start

      logger.metric(
        {
          version: ctx.meta.version,
          duration,
          activationTime: duration,
          ok: true,
        },
        `duration=${duration.toFixed(2)}ms (metric)`,
      )

      result.duration = Number(duration.toFixed(2))

      await cleanup()

      // normal errors are wrapped inside the process
      resolve(result)
    }
  })
}

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

// this should become part of WorkerGuard
// eventually
async function termination(killed: boolean, cleanup: any, reject: any) {
  if (killed) return

  const error = {
    code: WorkerErrorCode.CODE_WORKER_ABORTED,
    message: `worker has been aborted`,
    type: 'user',
  }

  await cleanup('SIGKILL')
  reject(error)
}

let started = false

function handleSignalFactory(opts: {logger: any; killed: boolean; cleanup: any; reject: any}) {
  let signalCount = 0
  const {logger, killed, cleanup, reject} = opts

  let timeout: NodeJS.Timeout
  return async function handleSignal(sig: NodeJS.Signals) {
    signalCount++

    if (signalCount === 1) {
      logger.warn(
        `${sig} received, process will shutdown in ${numberFixed2(DEFAULTS.defaultTerminationTime / 1000)}s. Use CTRL+C to force shutdown.`,
      )

      await cleanup('SIGTERM')

      timeout = setTimeout(async () => {
        await termination(killed, cleanup, reject)
      }, DEFAULTS.defaultTerminationTime)

      return
    }

    if (signalCount === 2) {
      logger.warn(`final ${sig} received, forcing process to exit`)

      clearTimeout(timeout)
      await termination(killed, cleanup, reject)
    }
  }
}

function resolveProcessPath() {
  const isTest = process.env.XGSD_NODE_ENV === 'test'

  // this is so brittle
  const path = fileURLToPath(
    new URL(isTest ? '../../dist/process/workers.process.js' : '../dist/process/workers.process.js', import.meta.url),
  )

  return path
}

type Process = {
  pid: number
  start: number
  status: 'running' | 'stopping'
}

const processes = new Map<number, Process>()

function registerProcessGuard(logger: any, id: string, act: string) {
  return function handle(code: number) {
    if (processes.size === 0) return

    logger.warn(`there are currently ${processes.size} processes in an unknown state.`)

    for (const [pid, process] of processes) {
      logger.warn(
        `process ${pid} is ${process.status} (act: ${act}) - check your process manager to ensure it's not hanging`,
        {pid, status: process.status, tag: 'worker_guard'},
      )
    }
  }
}
