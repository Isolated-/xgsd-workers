import {join} from 'path'
import {createBundle, resolveDependency} from '../core/bundler'
import {compose, Next} from '../core/compose'
import {Context, WorkerError, WorkerErrorCode} from '../core/types'
import {pathExists} from '../util/fs'

export type RunFn<T> = (data: T) => Promise<any>

const ctx = JSON.parse(process.env.XGSD_CTX ?? '') as Context
const {execute} = resolveDependency('@xgsd/engine', ctx.meta.cwd)

function dispatch(event: 'ALIVE' | 'DONE' | 'ERROR', payload: any) {
  process.send?.({
    type: event,
    ...payload,
  })
}

function startHeartbeat(interval = 50) {
  return setInterval(() => {
    const memory = process.memoryUsage()

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
  }, interval)
}

export function wrapper(fn: RunFn<unknown>) {
  return async (ctx: Context, next: Next) => {
    if (ctx.execute) {
      const result = await ctx.execute(fn)

      ctx.result = result.data
      ctx.error = result.error
    } else {
      const {data, error} = await execute(ctx as any, fn)

      ctx.result = data
      ctx.error = error
    }

    await next()
  }
}

function createLogger(ctx: Context) {
  return {
    log: (message: Record<string, any>) => {
      console.log(
        JSON.stringify({
          type: 'log',
          ...message,
        }),
      )
    },
  }
}

async function main(ctx: Context) {
  const heartbeat = startHeartbeat()

  const {entry, cwd, bundler, dist, limits} = ctx.meta
  let entryFile = join(cwd ?? '', entry)

  const logger = createLogger(ctx)

  try {
    if (!(await pathExists(entryFile))) {
      const error: WorkerError = {
        code: WorkerErrorCode.CODE_INVALID_ENTRY_FILE,
        message: 'entry file not found',
        type: 'user',
      }

      dispatch('ERROR', {error})
      return
    }

    // bundler
    if (bundler.enabled) {
      entryFile = await createBundle({
        project: cwd,
        dist,
        entry,
        cacheStrategy: bundler.cache?.strategy ?? 'never',
      })
    } else {
      //console.log(`[runtime] bundle stage skipped - disabled by config`)
      logger.log({stage: 'bundle', message: 'bundler is disabled, enabled it with `bundler.enabled` = true'})
    }

    let mod = undefined
    try {
      mod = await import(entryFile)
    } catch (error) {}

    if (!mod || !mod.default || typeof mod.default !== 'function') {
      const error: WorkerError = {
        code: WorkerErrorCode.CODE_INVALID_DEFAULT_FUNCTION,
        message: 'default must be a function',
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

      const dt = (performance.now() - start).toFixed(2)
      logger.log({stage: 'middleware', message: `loaded ${middleware.length} middleware functions`, dt})
    }

    // runtime
    const runtime = compose([...middleware, wrapper(mod.default)])
    const version = process.env.XGSD_WORKER_VERSION ?? 'unknown'
    const {ttl, memory} = limits

    //console.log(`[runtime] started (version: ${version}, ttl: ${ttl?.toFixed(2)} ms, memory: ${memory}MB)`)

    logger.log({stage: 'runtime', status: 'start', version, ttl, memory, ctx: ctx.id})

    const start = performance.now()

    const result = await runtime(ctx)

    const ms = performance.now() - start

    logger.log({stage: 'runtime', status: 'end', message: 'finished', ms, version, ttl, memory, ctx: ctx.id})

    if (result.error) {
      logger.log({
        type: 'warn',
        stage: 'runtime',
        message: `finished with errors`,
        error: ctx.error?.message ?? 'unknown',
      })
    }

    dispatch('DONE', {result})
  } finally {
    clearInterval(heartbeat)
  }
}

main(ctx)
