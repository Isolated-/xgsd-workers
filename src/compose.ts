import {resolveDependency} from './bundler'
import {WorkerContext, WorkerResult} from './types'

export type Next = () => Promise<void>

export type Middleware = (ctx: WorkerContext, next: Next) => Promise<void>

export type ComposedMiddleware = (ctx: WorkerContext) => Promise<WorkerResult<unknown>>

export function compose(middleware: Middleware[]): ComposedMiddleware {
  return async function run(ctx: WorkerContext): Promise<WorkerResult<unknown>> {
    let index = -1

    let res: any = {
      version: 'v1',
      ok: undefined,
      result: undefined,
      error: undefined,
      duration: undefined,
    }

    const {execute} = resolveDependency('@xgsd/engine', ctx.cwd!)

    async function dispatch(i: number): Promise<void> {
      if (i <= index) {
        throw new Error('next() called multiple times')
      }

      index = i

      const fn = middleware[i]

      if (!fn) {
        return
      }

      const executeWrapper = async (ctx: WorkerContext) => {
        await fn(ctx, async () => {
          await dispatch(i + 1)
        })

        return ctx
      }

      const result = await execute(ctx, executeWrapper)

      if (result.error || result.data?.error) {
        res.ok = false
        res.code = ctx.code
        res.result = null
        res.error = result.error ?? result.data?.error
      } else {
        res.ok = true
        res.code = ctx.code
        res.result = result.data?.result ?? null
        res.error = null
      }
    }

    await dispatch(0)

    return res
  }
}
