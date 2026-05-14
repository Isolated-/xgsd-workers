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

    async function executeAdapter<T>(opts: {
      idx: number
      ctx: Context<T>
      dispatch: (idx: number) => Promise<void>
      fn: Middleware
    }) {
      const {dispatch, fn, idx} = opts
      return async (ctx: Context<T>) => {
        await fn(ctx, async () => {
          await dispatch(idx + 1)
        })

        return ctx
      }
    }

    async function dispatch(i: number): Promise<any> {
      if (i <= index) {
        throw new Error('next() called multiple times')
      }

      index = i

      const fn = middleware[i]

      if (!fn) {
        return
      }

      const wrapper = await executeAdapter({idx: i, ctx, dispatch, fn})
      return execute(ctx, wrapper)
    }

    const result = await dispatch(0)
    return createWorkerResult({result, duration: 0})
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
