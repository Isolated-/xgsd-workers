import {join} from 'path'
import {createBundle} from '../core/bundler.js'
import {execute, SourceData} from '@xgsd/engine'
import {compose, Next} from '../core/compose.js'
import {Context, WorkerError, WorkerErrorCode} from '../core/types.js'
import {pathExists} from '../util/fs.js'
import {createLogger} from '../core/shared.js'

export type RunFn<T> = (data: T) => Promise<any>

const logger = createLogger()

const ctx = JSON.parse(process.env.XGSD_CTX ?? '') as Context
function dispatch(event: 'ALIVE' | 'DONE' | 'ERROR', payload: any) {
  process.send?.({
    type: event,
    ...payload,
  })
}

process.on('exit', (code: number) => {
  if (code !== 0) {
    logger.warn(`container ${process.pid} exited with non-zero code ${code}.`, {code, pid: process.pid})
    return
  }

  logger.log('container exited gracefully', {pid: process.pid})
})

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

  const {entry, cwd, bundler, dist, limits} = ctx.meta
  let entryFile = join(cwd ?? '', entry)

  logger.log(`container started (pid: ${process.pid})`, {stage: 'runtime', pid: process.pid})

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
        exclude: bundler.exclude,
        include: bundler.include,
        extensions: bundler.extensions,
      })
    } else {
      logger.warn(`bundler is disabled`, {stage: 'bundler', hint: 'enable with bundler.enabled = true'})
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

      const dt = performance.now() - start
      logger.log(`loaded ${middleware.length} middleware functions`, {stage: 'middleware', duration: dt})
    }

    // runtime
    const runtime = compose([...middleware, wrapper(mod.default)])
    const version = process.env.XGSD_WORKER_VERSION ?? 'unknown'
    const {ttl, memory} = limits

    logger.log(`worker running with version ${version} (ttl: ${ttl}, memory: ${memory})`, {
      stage: 'runtime',
      version,
      ttl,
      memory,
    })

    const start = performance.now()

    const result = await runtime(ctx)

    const ms = performance.now() - start

    logger.log(`worker finished in ${ms.toFixed(2)} ms`, {stage: 'runtime', version, duration: ms})

    if (result.error) {
      logger.warn(`worker finished with errors (${ctx.error?.code ?? ctx.error?.message ?? 'unknown'})`, {
        stage: 'runtime',
        error: ctx.error?.message ?? 'unknown',
      })

      logger.error(result?.error?.message ?? ctx.error?.message, result.error)
    }

    dispatch('DONE', {result, memory: process.memoryUsage().heapUsed})
  } finally {
    clearInterval(heartbeat)
  }
}

main(ctx)
