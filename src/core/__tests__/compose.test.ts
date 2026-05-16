import {describe, test, expect, vi} from 'vitest'
import {compose, Middleware} from '../compose.js'

describe('compose()', () => {
  test('always returns a function', () => {
    expect(compose([])).toBeInstanceOf(Function)
  })

  test('always returns a wrapped result (unwrapping happens in main process)', async () => {
    const middleware: Middleware = async (_, next) => {
      await next()
    }

    const result = await compose([middleware])({} as any)
    expect(result.ok).toBe(true)
    expect(result.result).toBeDefined()
    expect(result.error).toBeNull()
  })

  test('throws error when trying to call next() multiple times', async () => {
    const middleware: Middleware = async (_, next) => {
      await next()
      await next()
      await next()
    }

    const result = await compose([middleware])({} as any)

    expect(result.ok).toBe(false)
    expect(result.error!.message).toContain('next() called multiple times')
  })
})
