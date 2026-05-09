import {join} from 'path'
import {createBundle, resolveDependency} from '../bundler'
import {compose, Next} from '../compose'
import {WorkerContext, WorkerError, WorkerErrorCode} from '../types'
import {pathExists} from '../util/fs'
import {getPackageVersion} from '../util/package'

export type RunFn<T> = (data: T) => Promise<any>

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
  const {execute} = resolveDependency('@xgsd/engine', ctx.cwd!)

  return async (ctx: WorkerContext, next: Next) => {
    const res = await execute(ctx.data as any, fn)

    ctx.result = res.data
    ctx.error = res.error

    await next()
  }
}

async function main(ctx: WorkerContext) {
  const heartbeat = startHeartbeat()

  const {entry, cwd} = ctx
  let entryFile = join(cwd ?? '', entry)

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
    if (ctx.bundler?.enabled) {
      entryFile = await createBundle({
        project: cwd!,
        dist: ctx.dist,
        entry,
        cacheStrategy: ctx.bundler?.cache?.strategy ?? 'never',
      })
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
      console.log(`[middleware] ${middleware.length} functions registered in ${dt} ms`)
    }

    // runtime
    const runtime = compose([...middleware, wrapper(mod.default)])
    const version = process.env.XGSD_WORKER_VERSION ?? 'unknown'

    console.log(`[runtime] started running worker (version: ${version})`)

    const start = performance.now()

    const result = await runtime(ctx)

    const ms = performance.now() - start
    console.log(`[runtime] finished running worker took ${ms.toFixed(2)} ms`)

    if (result.error) {
      console.warn(`[runtime] finished with errors (error: ${ctx.error?.message ?? 'unknown'})`)
    }

    dispatch('DONE', {result})
  } finally {
    clearInterval(heartbeat)
  }
}

const ctx = JSON.parse(process.env.XGSD_CTX!) as WorkerContext
main(ctx)
