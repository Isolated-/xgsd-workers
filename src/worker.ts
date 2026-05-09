import {fork} from 'child_process'
import {join} from 'path'
import {WorkerContext, WorkerError, WorkerErrorCode, WorkerResult} from './types.js'
import {createWriteStream, appendFileSync} from 'fs'
import {ensureDir} from './util/fs.js'
import {randomUUID} from 'crypto'
import {getPackageVersion} from './util/package.js'

export function startWorkerGuard(
  child: any,
  opts: {
    ttl?: number
    memory?: number
  },
  suspended?: (reason: string) => void,
) {
  const {ttl = 5000, memory = 128} = opts

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

type ChildMessage<T> =
  | {type: 'ALIVE'; error: undefined; result: undefined}
  | {type: 'DONE'; result: WorkerResult<T>; error: undefined | null}
  | {type: 'ERROR'; result: undefined | null; error: WorkerError}

export function normaliseKeys(value: any): any {
  if (Array.isArray(value)) {
    return value.map(normaliseKeys)
  }

  if (value && typeof value === 'object' && value.constructor === Object) {
    const sorted: Record<string, any> = {}

    for (const key of Object.keys(value).sort()) {
      sorted[key] = normaliseKeys(value[key])
    }

    return sorted
  }

  return value
}

export function formatWorkerResult(opts: {result?: any; error?: any; duration: number}): WorkerResult<any> {
  return {
    version: 'v1',
    ok: !opts.error,
    result: opts.result ?? null,
    error: opts.error ?? null,
    duration: opts.duration,
  }
}

export async function runWorker<T>(context: WorkerContext): Promise<WorkerResult<T>> {
  return new Promise(async (resolve, reject) => {
    const id = randomUUID()

    const ctx = {...context, id}
    const start = performance.now()

    const path = join(ctx.cwd!, ctx.dist ?? '.xgsd')
    await ensureDir(path)

    let started = false
    let completed = false
    let res: WorkerResult<unknown>

    const contextStr = JSON.stringify(ctx)
    const version = getPackageVersion('@xgsd/workers', ctx.cwd)

    // TODO: remove hardcoded worker path
    const child = fork(join(__dirname, 'process', 'workers.process.js'), {
      stdio: ['inherit', 'pipe', 'pipe', 'ipc'],
      //execArgv: [`--max-old-space-size=${ctx.limits?.memory ?? 128}`],
      env: {
        ...ctx.env,
        XGSD_WORKER_VERSION: version,
        XGSD_CTX: contextStr,
      },
    })

    const events = createWriteStream(join(path, 'events.jsonl'), {flags: 'a'})

    const startGuard = () => {
      startWorkerGuard(child, ctx.limits ?? {}, (reason: string) => {
        if (completed) return

        // normalise system/watch dog error
        // then *reject*
        const err: WorkerError = {
          code: WorkerErrorCode.CODE_WORKER_GUARD,
          message: `${reason}`,
          type: 'system',
        }

        console.warn(`[guard] worker suspended (reason: ${reason})`)

        writeEvent({
          type: 'error',
          message: err.message,
          guard: true,
          timestamp: Date.now(),
        })

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

    const writeEvent = (data: any) => {
      const normalised = normaliseKeys(data)
      events.write(JSON.stringify({...normalised, id}) + '\n')
    }

    child.stdout?.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter(Boolean)

      for (const line of lines) {
        // log child process messages (typically from usercode)
        console.log(line.trim())

        try {
          writeEvent(JSON.parse(line))
        } catch {
          // optionally fallback for non-json logs
          writeEvent({
            type: 'log',
            message: line,
            timestamp: Date.now(),
          })
        }
      }
    })

    child.stderr?.on('data', (chunk) => {
      const e = {type: 'error', message: chunk.toString(), timestamp: Date.now()}
      //console.error(e.message)
      writeEvent(e)
    })

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

      // log activation
      appendFileSync(
        join(path, 'activations.jsonl'),
        JSON.stringify({
          id,
          version,
          ...(ctx.limits ?? {}),
          ok: res.ok,
          code: res.code,
          duration: res.duration,
          error: res.error?.code ?? res.error?.message,
          timestamp: new Date().toISOString(),
        }) + '\n',
      )

      completed = true

      if (ctx.output?.mode === 'raw') {
        resolve(res.result ?? (res.error as any))
      } else {
        resolve(res as any)
      }

      cleanup()
    })
  })
}
