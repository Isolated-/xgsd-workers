import {join} from 'path'
import {execute, SourceData} from '@xgsd/engine'
import {compose, Next} from '../core/compose.js'
import {Context, WorkerError, WorkerErrorCode} from '../core/types.js'
import {pathExists} from '../util/fs.js'
import {createLogger} from '../core/shared.js'

export type RunFn<T> = (data: T) => Promise<any>

const stdout = createLogger(process.stdout)
const stderr = createLogger(process.stderr)

const ctx = JSON.parse(process.env.XGSD_CTX ?? '') as Context
function dispatch(event: 'ALIVE' | 'DONE' | 'ERROR', payload: any) {
  process.send?.({
    type: event,
    ...payload,
  })
}

process.on('exit', (code: number) => {
  if (code !== 0) {
    stdout.warn(`container ${process.pid} exited with non-zero code ${code}.`, {code, pid: process.pid})
    return
  }

  stdout.log('container exited gracefully', {pid: process.pid})
})

export const rejectionHandler = () => {
  const handler = (errorOrRejection: any) => {
    const error = errorOrRejection instanceof Error ? errorOrRejection : null

    const wrapped: WorkerError = {
      code: WorkerErrorCode.CODE_FATAL_ERROR,
      message: error?.message ?? 'uncaught exception',
      type: 'unknown',
      stack: error?.stack,
    }

    stderr.error(wrapped.message!, wrapped)

    dispatch('ERROR', {error: wrapped})
  }

  process.on('uncaughtException', handler)
  process.on('unhandledRejection', handler)
}

function startHeartbeat(interval = 50) {
  function pulse(memory: any) {
    dispatch('ALIVE', {
      pid: process.pid,
      uptime: process.uptime(),
      memory: {
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        external: memory.external,
      },
    })
  }

  let memory = process.memoryUsage()
  pulse(memory)

  return setInterval(() => {
    memory = process.memoryUsage()

    pulse(memory)
  }, interval)
}

export function wrapper(fn: RunFn<unknown>) {
  return async (ctx: Context, next: Next) => {
    if (ctx.execute) {
      const result = await ctx.execute(fn)

      ctx.result = result.data
      ctx.error = result.error
    } else {
      // dont send context into worker
      // middleware can be used for that
      const {data, error} = await execute(ctx.data as SourceData, fn)

      ctx.result = data
      ctx.error = error
    }

    await next()
  }
}

async function main(ctx: Context) {
  const heartbeat = startHeartbeat()

  rejectionHandler()

  const {entry, limits} = ctx.meta

  stdout.log(`container started (pid: ${process.pid})`, {stage: 'runtime', pid: process.pid})

  try {
    if (!(await pathExists(entry))) {
      const error: WorkerError = {
        code: WorkerErrorCode.CODE_INVALID_ENTRY_FILE,
        message: `entry file "${entry}" not found`,
        type: 'user',
      }

      stderr.error(error.message!, error)

      dispatch('ERROR', {error})
      return
    }

    let mod = undefined
    try {
      mod = await import(entry)
    } catch (error: any) {
      const err: WorkerError = {
        code: WorkerErrorCode.CODE_INVALID_ENTRY_FILE,
        message: `${entry} cannot be loaded, this could mean there's an error in your code.`,
        type: 'user',
      }

      stderr.error(error?.message ?? 'unknown', {
        stack: error?.stack ?? 'unknown',
      })

      dispatch('ERROR', {error: err, original: JSON.stringify(error)})
      return
    }

    if (!mod.default || typeof mod.default !== 'function') {
      const error: WorkerError = {
        code: WorkerErrorCode.CODE_INVALID_DEFAULT_FUNCTION,
        message: `default must be a function (received: ${typeof mod.default})`,
        type: 'user',
      }

      dispatch('ERROR', {error})
      return
    }

    // load middleware
    let middleware = []
    if (mod.middleware && typeof mod.middleware === 'function') {
      const start = performance.now()
      middleware = mod.middleware() ?? []

      if (!Array.isArray(middleware) || middleware.filter((m) => typeof m !== 'function').length > 0) {
        const error: WorkerError = {
          code: WorkerErrorCode.CODE_INVALID_MIDDLEWARE_FUNCTION,
          message: 'middleware not configured correctly',
          type: 'user',
        }

        dispatch('ERROR', {error})
        return
      }

      const dt = performance.now() - start
      stdout.log(`loaded ${middleware.length} middleware functions`, {stage: 'middleware', duration: dt})
    }

    // runtime
    const runtime = compose([...middleware, wrapper(mod.default)])
    const version = process.env.XGSD_WORKER_VERSION ?? 'unknown'
    const {ttl, memory} = limits

    stdout.log(`worker running with version ${version} (ttl: ${ttl}, memory: ${memory})`, {
      stage: 'runtime',
      version,
      ttl,
      memory,
    })

    const start = performance.now()

    const result = await runtime(ctx)

    const ms = performance.now() - start

    stdout.log(`worker finished in ${ms.toFixed(2)} ms`, {stage: 'runtime', version, duration: ms})

    // test for bad serialisation
    try {
      JSON.stringify({result: ctx.result, error: ctx.error})
    } catch (e: any) {
      const error: WorkerError = {
        code: WorkerErrorCode.CODE_INVALID_DATA,
        message: `"ctx" is not serialisable, check middleware/worker return values.`,
        stack: e?.stack,
      }

      stderr.error(error.message!, error)
      dispatch('ERROR', {error})
      return
    }

    if (result.error) {
      stdout.warn(`worker finished with errors (${ctx.error?.code ?? ctx.error?.message ?? 'unknown'})`, {
        stage: 'runtime',
        error: ctx.error?.message ?? 'unknown',
      })

      stderr.error(result?.error?.message ?? ctx.error?.message, result.error)
    }

    dispatch('DONE', {result, memory: process.memoryUsage().heapUsed})
  } finally {
    clearInterval(heartbeat)
  }
}

main(ctx)
