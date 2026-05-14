import {describe, test, expect, vi} from 'vitest'
import {isSerialisable, usercodeMiddlewareWrapper} from '../workers.runtime.js'
import {execute} from '@xgsd/engine'

vi.mock('@xgsd/engine', async () => ({
  execute: vi.fn(async (data, fn) => {
    const res = await fn(data)

    return {result: res, error: null}
  }),
}))

describe('isSerialisable', () => {
  test.each([true, false, 'string', 123, null, [], {}])('returns true for serialisable value: %s', (value) => {
    expect(isSerialisable(value)).toBe(true)
  })

  test.each([Symbol('test'), BigInt(1), () => {}])('returns false for non-serialisable value: %s', (value) => {
    expect(isSerialisable(value)).toBe(false)
  })
})

/**
 *  usercode middleware wrapper
 *  responsible for making xGSD run fn work with Workers.js
 *  by wrapping it in Workers.js middleware format
 */
describe('usercodeMiddlewareWrapper', () => {
  test('returns a middleware function', async () => {
    const fn = async () => {}
    const wrapper = usercodeMiddlewareWrapper(fn)

    expect(wrapper).toBeInstanceOf(Function)
  })

  test('calls ctx.execute when defined', async () => {
    const fn = vi.fn(async () => ({
      data: null,
      error: null,
    }))
    const wrapper = usercodeMiddlewareWrapper(fn)

    let ctx = {
      execute: async (func: any) => {
        expect(func).toBeInstanceOf(Function)
        const res = await func()

        expect(fn).toHaveBeenCalled()
        return res
      },
    }

    await wrapper(ctx as any, async () => {})
  })

  test("doesn't throw any weird errors if ctx.execute returns nothing", async () => {
    const fn = async () => {}

    const wrapper = usercodeMiddlewareWrapper(fn)
    let ctx = {
      execute: async (func: any) => {},
    } as any

    await expect(wrapper(ctx, async () => {})).resolves.toBeUndefined()
  })

  test('calls execute when ctx.execute is not defined', async () => {
    const fn = vi.fn(async () => {})
    const wrapper = usercodeMiddlewareWrapper(fn)

    const data = {
      hello: 'world',
    }
    await wrapper(
      {
        data,
      } as any,
      async () => {},
    )

    expect(fn).toHaveBeenCalled()
    expect(execute).toHaveBeenCalledWith(data, fn)
  })

  test('calls next after execution', async () => {
    const fn = vi.fn(async (data) => {})
    const wrapper = usercodeMiddlewareWrapper(fn)

    const next = vi.fn(async () => {})
    const data = {
      data: {hello: 'world'},
    }

    await wrapper(
      {
        data,
      } as any,
      next,
    )

    expect(fn).toHaveBeenCalledExactlyOnceWith(data)
    expect(next).toHaveBeenCalledExactlyOnceWith()
  })
})
