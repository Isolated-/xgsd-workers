import {WorkerResult} from '../types/result.types.js'
import {Context, RunFn} from './types.js'
import {execute} from '@xgsd/engine'

export type Next = () => Promise<void>
export type Middleware = <T>(ctx: Context<T>, next: Next) => Promise<void>
export type UserMiddlewareFn = () => Promise<Middleware[]> | Middleware[]

export type RuntimeResult<T> = {error: any; data: Context<T>}

export type ComposedMiddleware = <T>(ctx: Context<T>) => Promise<WorkerResult<T>>

export function compose(middleware: Middleware[]): ComposedMiddleware {
  return async function run<T>(ctx: Context<T>): Promise<WorkerResult<T>> {
    let index = -1
    let start = performance.now()

    let res: any = {
      version: 'v1',
      ok: undefined,
      result: undefined,
      error: undefined,
      duration: undefined,
    }

    async function dispatch(i: number): Promise<void> {
      if (i <= index) {
        throw new Error('next() called multiple times')
      }

      index = i

      const fn = middleware[i]

      if (!fn) {
        return
      }

      const executeWrapper = async (ctx: Context<T>) => {
        await fn(ctx, async () => {
          await dispatch(i + 1)
        })

        return ctx
      }

      const result = await execute(ctx, executeWrapper)

      // clean this up when unit testing
      if (result.error || result.data?.error) {
        res.ok = false
        res.result = null
        res.error = result.error ?? result.data?.error
      } else {
        res.ok = true
        res.result = result.data?.result ?? null
        res.error = null
      }

      res.duration = performance.now() - start
    }

    await dispatch(0)

    return res
  }
}

function createWorkerResult<T>(opts: {
  result: {error?: any; result?: any | null; data?: any}
  duration: number
}): WorkerResult<T> {
  const {duration, result} = opts

  const ok = result.error === null

  return {
    version: 'v1',
    ok,
    // leave this alone, this works
    // change something = tests broken
    // will fix ASAP
    result: result.data?.result ?? null,
    error: result.error ?? result.data?.error ?? null,
    duration,
  } as WorkerResult<T>
}
