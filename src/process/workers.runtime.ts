// execute() was introduced for xGSD
// and could be extracted to Workers.js
// as WrappedError is redundant
import {execute} from '@xgsd/engine'
import {Middleware, Next} from '../core/compose.js'
import {Context, ErrorBehaviour, RunFn} from '../core/types.js'
import {WorkerError, WorkerErrorCode} from '../types/error.types.js'
import {pathExists} from '../util/fs.js'
import {workerError} from '../util/format.js'

export async function importUserModule(entry: string) {
  if (!(await pathExists(entry))) {
    throw workerError(`entry file "${entry}" not found`, {
      code: WorkerErrorCode.CODE_INVALID_ENTRY_FILE,
      type: 'user',
    })
  }

  try {
    return await import(entry)
  } catch (error: any) {
    const message = `"${entry}" cannot be loaded. Error: ${error?.message ?? 'unknown - check logs'}`
    throw workerError(message, {
      code: WorkerErrorCode.CODE_INVALID_ENTRY_FILE,
      type: 'user',
      stack: error?.stack,
    })
  }
}

/**
 *  this takes a xGSD-compatible RunFn
 *  and adapts it for Workers.js
 *
 *  @param fn
 *  @returns
 *
 *  @since v0.1.0
 */
export function usercodeMiddlewareWrapper(fn: RunFn<unknown>) {
  return async (ctx: Context<any>, next: Next) => {
    if (ctx.execute) {
      const result = await ctx.execute(fn)

      ctx.result = result?.data ?? null
      ctx.error = result?.error ?? null
    } else {
      // dont send context into worker
      // middleware can be used for that
      const {data, error} = await execute<any>(ctx.data, fn)

      ctx.result = data
      ctx.error = error
    }

    await next()
  }
}

export function isSerialisable(data: unknown): boolean {
  try {
    return isSerialisableThrows(data)
  } catch {
    return false
  }
}

export function isSerialisableThrows(data: unknown): boolean {
  return JSON.stringify(data) !== undefined
}

export function numberFixed2(num: number) {
  return Number(num.toFixed(2))
}

export function validateUserModule(mod: any): boolean {
  if (mod.default && typeof mod.default === 'function') {
    return true
  }

  throw workerError(`"default" must be a function (received: ${typeof mod.default})`, {
    code: WorkerErrorCode.CODE_INVALID_DEFAULT_FUNCTION,
    type: 'user',
  })
}

export function validateUserMiddleware(middleware: Middleware[]): boolean {
  const nonFns = middleware.filter((m) => typeof m !== 'function').map((_, idx) => idx)

  if (Array.isArray(middleware) && nonFns.length === 0) {
    return true
  }

  throw workerError(`Some or all of your middleware functions are invalid. Indexes: ${nonFns.join(',')}.`, {
    code: WorkerErrorCode.CODE_INVALID_MIDDLEWARE_FUNCTION,
    type: 'user',
  })
}

export function memorySnapshot() {
  const {heapUsed, heapTotal, rss, external} = process.memoryUsage()

  function toMB(bytes: number) {
    return numberFixed2(bytes / 1024 / 1024)
  }

  return {
    heapUsed: toMB(heapUsed),
    heapTotal: toMB(heapTotal),
    rss: toMB(rss),
    external: toMB(external),
  }
}

export const isCommonJS = typeof module !== 'undefined' && typeof module.exports !== 'undefined'

export function completePreChecks(version: string, stdout: any, stderr: any) {
  const before = memorySnapshot()

  stdout.log(`container started (pid: ${process.pid})`, {tag: 'info'})
  stdout.log(`container memory usage at start ${before.rss} MB (heap: ${before.heapUsed}MB/${before.heapTotal}MB)`, {
    workers: version,
    heapUsed: before.heapUsed,
    heapTotal: before.heapTotal,
    rss: before.rss,
    tag: 'debug',
  })

  stdout.log(`@xgsd/workers v${version}`, {tag: 'debug', workers: version})
  stdout.log(`Node.js ${process.version} (${process.platform} ${process.arch})`, {
    tag: 'debug',
    node: process.version,
    arch: process.arch,
    platform: process.platform,
  })

  if (version === 'unknown') {
    stderr.warn(`no @xgsd/workers version could be obtained - this could lead to unpredictable behaviour.`)
  }

  if (isCommonJS) {
    stderr.warn('CommonJS runtime detected. ESM is recommended.')
  }
}

type CheckSerialisationOpts<T> = {
  data?: T | null
  onError?: ErrorBehaviour
  stderr: any
  property: string
}

export function completeSerialisationCheck<T>(opts: CheckSerialisationOpts<T>): T | undefined | null {
  const {data, onError, stderr, property} = opts
  try {
    if (data === undefined || data === null) {
      return null
    }

    isSerialisableThrows(data)

    return data
  } catch (err: any) {
    const error = workerError(`"ctx.${property}" is not serialisable`, {
      code: WorkerErrorCode.CODE_INVALID_DATA,
      stack: err?.stack,
      hint: `check middleware/worker return values + ensure no circular returns.`,
    })

    if (onError === 'drop') {
      stderr.warn(`"ctx.${property}" has been set to null as "ctx.${property}" is not serialisable`, error)
      return null
    }

    throw error
  }
}
