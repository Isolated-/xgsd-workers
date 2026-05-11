import {Context, WorkerResult} from './types.js'
import {execute} from '@xgsd/engine'

export type Next = () => Promise<void>
export type Middleware = (ctx: Context, next: Next) => Promise<void>
export type ComposedMiddleware = (ctx: Context) => Promise<WorkerResult<unknown>>

export function compose(middleware: Middleware[]): ComposedMiddleware {
  return async function run(ctx: Context): Promise<WorkerResult<unknown>> {
    let index = -1

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

      const executeWrapper = async (ctx: Context) => {
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
    }

    await dispatch(0)

    return res
  }
}
