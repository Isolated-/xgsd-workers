import {Context, RunFn, WorkerResult} from './types.js'
import {execute} from '@xgsd/engine'

export type Next = () => Promise<void>
export type Middleware = <T>(ctx: Context<T>, next: Next) => Promise<void>
export type UserMiddlewareFn = () => Promise<Middleware[]> | Middleware[]

export type ComposedMiddleware = <T>(ctx: Context<T>) => Promise<WorkerResult<unknown>>

export function compose(middleware: Middleware[]): ComposedMiddleware {
  return async function run<T>(ctx: Context<T>): Promise<WorkerResult<unknown>> {
    let index = -1
    let start = performance.now()

    let res: WorkerResult<unknown>

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

    const {error, data} = result
    const duration = performance.now() - start
    res = createWorkerResult({error, data, duration})

    return res
  }
}

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

function createWorkerResult<T>(opts: {error: any; data: T | null; duration: number}): WorkerResult<T> {
  const {error, data, duration} = opts

  const res = {
    version: 'v1',
    ok: error === null,
    result: data ?? null,
    error: error ?? null,
    duration,
  }

  return res as WorkerResult<T>
}
