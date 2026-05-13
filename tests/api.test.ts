/**
 *  createTransport is the Public API for Workers.
 *
 *  These test cases define the interface that applications will use.
 *
 *  If any of these tests fail post-v1 then we've introduced breaking changes into user apps.
 *
 *  @since v1
 *
 */

import {describe, expect, test} from 'vitest'
import {createTransport, version, WorkerErrorCode} from '../src/index.js'
import {join} from 'path'

describe('exports', () => {
  test('API exports', () => {
    expect(createTransport).toBeDefined()
    expect(version).toBeDefined()
    expect(WorkerErrorCode).toBeDefined()
  })
})

const wrapper = () => {
  const logs: any[] = []

  return {
    write: (chunk: any) => {
      logs.push(JSON.parse(chunk))
    },
    finish: () => logs,
  }
}

const createTestTransport = (fixture: string, config?: any) => {
  const stream = wrapper()

  const transport = createTransport({
    entry: join(process.cwd(), 'fixtures', 'combined', fixture),
    output: {
      mode: 'wrapped',
    },
    stream,
    ...config,
  })

  return {transport, stream}
}

describe('Workers Public API', () => {
  test('produces a predictable output', async () => {
    const {transport} = createTestTransport('benchmark.js')

    const res = await transport()

    // assertions
    // wrapped format:
    expect(res.version).toBe('v1')
    expect(res.ok).toBe(true)
    expect(res.error).toBe(null)
    expect(res.result).toBe(null)
    expect(res.duration).toBeGreaterThan(0)
  })

  test('"duration" is the end-to-end activation time', async () => {
    const {transport} = createTestTransport('benchmark.js')

    const res = await transport()
    expect(res.duration).toBeGreaterThanOrEqual(30)
  })

  test('entry path must be absolute', async () => {
    const transport = createTransport({
      entry: join(process.cwd(), 'fixtures', 'combined', 'worker.js'),
      // stream isnt require but stops
      // logs going to stdout
      stream: wrapper() as any,
    })

    const res = await transport()
    expect(res.ok).toBe(true)
  })

  test('can return raw values when mode === raw', async () => {
    const {transport, stream} = createTestTransport('benchmark.js', {output: {mode: 'raw' as const}})

    const res = await transport({data: {custom: true}})

    // assertions
    expect(res).toEqual({custom: true})
  })

  test('wraps errors thrown inside usercode', async () => {
    const {transport, stream} = createTestTransport('errors.js')

    // no rejection for most errors
    const res = await transport()

    // assertions
    expect(res.error).toBeDefined()
  })

  test('middleware can be used for composition and the order is predictable', async () => {
    const {transport, stream} = createTestTransport('middleware.js')

    const res = await transport()
    expect(res.result).toEqual(['A', 'B', 'C', 'C', 'B', 'A'])
  })

  test('typescript can be used', async () => {
    const {transport} = createTestTransport('typescript.ts')

    const res = await transport()

    expect(res.ok).toBe(true)
  })

  test('env vars can be provided to a container', async () => {
    const {transport} = createTestTransport('worker.js')

    const res = await transport<any>({data: {show: 'env'}, env: {MY_VAR: 1234}})
    expect(res.ok).toBe(true)
    expect(res.result.MY_VAR).toBe('1234')
  })

  test('activation data can be provided', async () => {
    const {transport} = createTestTransport('worker.js')

    const res = await transport<any>({
      data: {
        hello: 'world',
      },
    })

    expect(res.ok).toBe(true)
    expect(res.result.hello).toBe('world')
  })

  test('third party dependencies can be imported', async () => {
    const {transport} = createTestTransport('axios.js')

    const res = await transport()
    expect(res.ok).toBe(true)
    expect(res.result).toBe('function')
  })

  test('multiple activations can run concurrently', async () => {
    const {transport} = createTestTransport('benchmark.js')

    const results = await Promise.all([transport({data: 1}), transport({data: 2}), transport({data: 3})])

    expect(results.every((x) => x.ok)).toBe(true)
  })

  /**
   *  serialisation/return values
   */
  describe('Serialisation/Returns', () => {
    test('class instances degrade into serializable objects', async () => {
      const {transport} = createTestTransport('unsupported.js')

      const res = await transport<any>()

      expect(res.ok).toBe(true)
      expect(res.result).toEqual({name: 'MyInstance', description: 'something about MyInstance'})
      expect(res.result.someFunc).not.toBeDefined()
    })

    test('large activation payloads are handled', async () => {
      const {transport} = createTestTransport('large.js')

      const res = await transport<any>()
      expect(res.ok).toBe(true)
      expect(res.error).toBeNull()
      expect(res.result.items.length).toBeGreaterThan(9999)
    })

    test('functions degrade into undefined values', async () => {
      const {transport} = createTestTransport('function.js')

      const res = await transport<any>()
      expect(res.ok).toBe(true)
      expect(res.result).toEqual(undefined)
    })
  })

  /**
   *  Errors/failure handling
   */
  describe('Errors/Failures', () => {
    test('entry files must be valid and exist', async () => {
      const {transport, stream} = createTestTransport('unknown.js')

      // note that this won't be rejected until
      // the container has started
      await expect(transport()).rejects.toThrow()

      // that's so signals are created:
      const signals = stream.finish().filter((signal: any) => signal.type === 'error')
      expect(signals.length).toBeGreaterThan(0)
    })

    test('entry file errors (from parsing) reveal debug info', async () => {
      const {transport, stream} = createTestTransport('invalid-code.js')

      try {
        await transport()
      } catch (error: any) {
        const {code, message, type, stack} = error

        expect(code).toBe(WorkerErrorCode.CODE_INVALID_ENTRY_FILE)
        expect(type).toBe('user')
        expect(message).toContain('Unexpected reserved word')
        expect(stack).toContain('Unexpected reserved word')

        // signals should contain a trace too
        const signal = stream
          .finish()
          .filter((signal) => signal.type === 'error')
          .pop()

        expect(signal.message).toContain('Unexpected reserved word')
        expect(signal.meta.stack).toEqual(stack)
      }
    })

    test('exported default must be a function', async () => {
      const {transport} = createTestTransport('bad.js')

      try {
        await transport()
      } catch (error: any) {
        expect(error.code).toBe(WorkerErrorCode.CODE_INVALID_DEFAULT_FUNCTION)
      }
    })

    test('circular payloads are handled predictably', async () => {
      const {transport} = createTestTransport('large-circular.js')

      try {
        await transport()
      } catch (error: any) {
        expect(error.code).toBe(WorkerErrorCode.CODE_INVALID_DATA)
      }
    })
  })

  /**
   *  Worker Guard
   *
   *  @note these should really result in a rejection vs resolved value
   *  so that all fatal errors are handled the same way
   *  but that can wait till v1.1+
   */
  describe('Worker Guard', () => {
    test('worker guard suspends processes (ttl)', async () => {
      const {transport} = createTestTransport('worker.js', {
        limits: {ttl: 1},
      })

      const res = await transport()
      expect(res.ok).toBe(false)
      expect(res.error?.code).toBe(WorkerErrorCode.CODE_WORKER_GUARD)
    })

    test('worker guard suspends processes (memory)', async () => {
      const {transport} = createTestTransport('worker.js', {limits: {memory: 0}})

      const res = await transport()
      expect(res.ok).toBe(false)
      expect(res.error?.code).toBe(WorkerErrorCode.CODE_WORKER_GUARD)
    })

    test('worker guard memory limits can be rss/heap', async () => {
      const {transport} = createTestTransport('worker.js', {
        limits: {
          memory: {
            limitMB: 10,
            strategy: 'rss',
          },
        },
      })

      const res = await transport()
      expect(res.ok).toBe(false)
      expect(res.error?.code).toBe(WorkerErrorCode.CODE_WORKER_GUARD)
    })

    test('worker guard memory limits are closer to user code memory usage', async () => {
      const {transport} = createTestTransport('large.js', {
        limits: {
          memory: {
            limitMB: 2,
            strategy: 'heap',
          },
        },
      })

      const res = await transport()
      expect(res.ok).toBe(false)
      expect(res.error?.code).toBe(WorkerErrorCode.CODE_WORKER_GUARD)
    })
  })

  describe('Signals', () => {
    test('workers produce Signals as they work (logs/errors/system messages)', async () => {
      const {transport, stream} = createTestTransport('benchmark.js')

      await transport()

      // assertions
      const signals = stream.finish()
      expect(signals.length).toBeGreaterThan(0)
    })

    test('workers always produce an "activation" signal', async () => {
      const {transport, stream} = createTestTransport('benchmark.js')

      const res = await transport()
      expect(res.ok).toBe(true)

      // assertions

      const signals = stream.finish().filter((signal: any) => signal.type === 'activation')
      expect(signals.length).toBe(1)

      // it will always contain:
      const signal = signals.pop()
      expect(signal.meta.ok).toBe(true)

      // @xgsd/workers version
      expect(signal.meta.version).toBeDefined()

      // this is just the error message
      // full details will be logged as "errors"
      expect(signal.meta.error).toBeNull()

      // result data is never stored
      expect(signal.meta.result).toBeUndefined()
    })
  })
})
