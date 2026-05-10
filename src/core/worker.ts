import {fork} from 'child_process'
import {join} from 'path'
import {Context, WorkerError, WorkerErrorCode, WorkerResult} from './types.js'
import {SignalContext} from './signal.js'
import {formatWorkerResult} from '../util/format.js'

type ChildMessage<T> =
  | {type: 'ALIVE'; error: undefined; result: undefined}
  | {type: 'DONE'; result: WorkerResult<T>; error: undefined | null}
  | {type: 'ERROR'; result: undefined | null; error: WorkerError}

export async function runWorker<T>(opts: {ctx: Context; signal: SignalContext}): Promise<WorkerResult<T>> {
  const start = performance.now()
  const {ctx, signal} = opts

  return new Promise(async (resolve) => {
    signal.emit({
      type: 'generic',
      message: 'system test',
      meta: {
        someKey: true,
      },
    })

    let started = false
    let completed = false
    let res: WorkerResult<unknown>

    const contextStr = JSON.stringify(ctx)

    // dont do this - ensure defaults are already set
    // by this point
    /*    const {ttl = 1000, memory = 64} = ctx.limits ?? {}

    ctx.limits = {
      ttl: ctx.limits?.ttl ?? ttl,
      memory: ctx.limits?.memory ?? memory,
    }*/

    // TODO: remove hardcoded worker path
    const child = fork(join(__dirname, 'process', 'workers.process.js'), {
      stdio: ['inherit', 'pipe', 'pipe', 'ipc'],
      // hard limit results in V8 errors
      // so use carefully
      execArgv: [`--max-old-space-size=512`],
      env: {
        ...ctx.env,
        XGSD_WORKER_VERSION: ctx.meta.version,
        XGSD_CTX: contextStr,
      },
    })

    const startGuard = () => {
      startWorkerGuard(child, {ttl: 1000, memory: 64}, (reason: string) => {
        if (completed) return

        // normalise system/watch dog error
        // then *reject*
        const err: WorkerError = {
          code: WorkerErrorCode.CODE_WORKER_GUARD,
          message: `${reason}`,
          type: 'system',
        }

        console.warn(`[guard] worker suspended (reason: ${reason})`)

        /*signal.emit({
          type: 'log',
          stage: 'guard',
          message: `worker suspended, reason: ${reason}`,
        })*/

        /*signal.emit({
          type: 'error',
          guard: true,
          code: WorkerErrorCode.CODE_WORKER_GUARD,
          message: err.message!,
        })*/

        //activationCollector.emit({ok: false, error: err.message!, version, duration: ttl})
        //activationWrapper.emit({ok: false, error: err.message!, version, duration: ttl})

        cleanup()

        resolve(formatWorkerResult({error: err, duration: performance.now() - start}))
      })
    }

    const cleanup = () => {
      if (child.connected) {
        child.removeAllListeners('message')

        child.disconnect()
      }
    }

    function collector(type: 'stdout' | 'stderr') {
      return (chunk: any) => {
        const lines = chunk.toString().split('\n').filter(Boolean)

        for (const line of lines) {
          try {
            signal.emit(JSON.parse(line))
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

    // collect stdout/err logs -> Signals
    child.stdout?.on('data', collector('stdout'))
    child.stderr?.on('data', collector('stderr'))

    child.on('message', (msg: ChildMessage<unknown>) => {
      if (msg.type !== 'ALIVE' && msg.type !== 'DONE' && msg.type !== 'ERROR') return

      if (msg.type === 'ALIVE') {
        if (!started) {
          started = true
          startGuard()
        }
        return
      }

      if (msg.type === 'ERROR') {
        const {error} = msg

        res = formatWorkerResult({error, duration: performance.now() - start})
      }

      if (msg.type === 'DONE') {
        // do something with result
        res = msg.result
      }

      res.duration = performance.now() - start

      /*      activationWrapper.emit({
        version,
        limits: {ttl, memory},
        ok: res.ok,
        duration: res.duration,
        error: res.error?.code ?? res.error?.message,
      })*/

      signal.emit({
        type: 'activation',
        message: 'activation',
        meta: {
          version: ctx.meta.version,
          ok: res.ok,
          //limits: {ttl, memory},
          duration: res.duration,
          error: res.error?.code ?? res.error?.message ?? null,
        },
      })

      completed = true

      /*if (ctx.output?.mode === 'raw') {
        resolve(res.result ?? (res.error as any))
      } else {
        resolve(res as any)
      }*/

      resolve(res as WorkerResult<any>)

      cleanup()
    })
  })
}

function startWorkerGuard(
  child: any,
  opts: {
    ttl: number
    memory: number
  },
  suspended?: (reason: string) => void,
) {
  const {ttl, memory} = opts

  let ttlTimer: NodeJS.Timeout | null = null
  let killed = false

  const kill = (reason: string) => {
    if (killed) return
    killed = true

    if (ttlTimer) clearTimeout(ttlTimer)

    child.kill('SIGKILL')
    suspended?.(reason)
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
