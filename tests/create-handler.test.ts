/**
 *  This file e2e tests createHandler()
 *
 *  @since v1
 *  @description this file should aim for 100% coverage of index.ts
 */

import {createHandler} from '../src/index.js'
import {join} from 'path'
import {describe, expect, test} from 'vitest'

const wrapper = () => {
  const logs: any[] = []

  return {
    write: (chunk: any) => {
      logs.push(JSON.parse(chunk))
    },
    end: () => logs,
  }
}

const createTestHandler = (fixture: string, config?: any, validator?: any) => {
  const stream = wrapper() as any

  const handler = createHandler({
    cwd: join(process.cwd(), 'fixtures', 'combined'),
    config: {
      entry: `${fixture}`,
      bundler: {
        enabled: false,
      },
      ...config,
    },
    stream,
    validator,
  })

  return {handler, stream}
}

/**
 *  SUCCESS
 */

describe('workers - success', () => {
  test('runs worker successfully', async () => {
    const {handler, stream} = createTestHandler('benchmark.js')

    const result = await handler()
    const logs = stream.end()

    expect(result.version).toBe('v1')
    expect(result.ok).toBe(true)
    expect(result.result).toBe(null)
    expect(result.error).toBe(null)
    expect(logs.length).toBeGreaterThan(0)
  })
  /*
  test('can be called without opts', async () => {
    const handler = createHandler()

    // instead "cwd" can be provided to handler()
    const result = await handler({cwd: join(process.cwd(), 'fixtures', 'combined', 'benchmark.js')})
    expect(result.ok).toBe(true)
  })*/

  test('users can send custom signals', async () => {
    const {handler, stream} = createTestHandler('benchmark.js')

    await handler()
    const logs = stream.end().filter((l: any) => l.type === 'generic')
    expect(logs[0].message).toBe('generic')
    expect(logs[0].meta).toEqual({customSignal: true})
  })

  test('runs TypeScript workers', async () => {
    const {handler, stream} = createTestHandler('typescript.ts', {
      entry: 'typescript.ts',
      bundler: {enabled: false},
    })

    const result = await handler()
    expect(result.ok).toBe(true)
  })

  test('runs worker successfully with custom data', async () => {
    const {handler} = createTestHandler('benchmark.js')

    const result = await handler({
      data: {
        var: true,
      },
    })

    expect(result.ok).toBe(true)
    expect(result.result).toEqual({var: true})
  })

  test('worker returns unwrapped result when output.mode = raw', async () => {
    const {handler} = createTestHandler('benchmark.js', {output: {mode: 'raw'}})

    const result = await handler({
      data: {var: true},
    })

    expect(result.ok).toBeUndefined()
    expect(result).toEqual({var: true})
  })

  describe('env tests', () => {
    test('runs workers successfully with custom env', async () => {
      const {handler} = createTestHandler('benchmark.js')

      const result = (await handler({
        data: {show: 'env'},
        env: {
          MY_VAR: 1234,
        },
      })) as any

      expect(result.result.MY_VAR).toBe('1234')
    })

    test('worker version and context available in env', async () => {
      const {handler} = createTestHandler('benchmark.js')

      const result = (await handler({
        data: {show: 'env'},
      })) as any

      expect(result.result.XGSD_WORKER_VERSION).toBeDefined()
      expect(result.result.XGSD_CTX).toBeDefined()
    })
  })
})

/**
 *  BUNDLER
 *
 *  @depreciated
 *  @since v1
 *
 *  This has been removed as it resulted in failures
 *  and depended on filesystems.
 */
/*
describe('workers - bundler related', () => {
  async function assertBundler(entry: string, dist: string) {
    const {handler, stream} = createTestHandler(entry, {dist, bundler: {enabled: true}})

    const result = await handler()
    expect(result.ok).toBe(true)

    const path = join(process.cwd(), 'fixtures', 'combined', dist)

    // dist paths exist
    expect(pathExistsSync(join(path, 'bundle.js'))).toBe(true)
    expect(pathExistsSync(join(path, 'package.json'))).toBe(true)

    // package json contains deps + hash
    const json = readJsonSync(join(path, 'package.json'))
    expect(json.hash).toBeDefined()

    // stream contains bundler-related logs
    const logs = stream.end().filter((log: any) => log.type === 'system' && log.meta?.stage === 'bundler')
    expect(logs.length).toBeGreaterThan(3)
  }

  test('worker code is bundled (JavaScript)', async () => {
    await assertBundler('benchmark.js', '.benchmark')
  })

  test('worker code is bundled (TypeScript)', async () => {
    await assertBundler('typescript.ts', '.typescript')
  })

  test('"always" and "change" apply cache', async () => {
    const {handler, stream} = createTestHandler('benchmark.js', {bundler: {enabled: true, cache: {strategy: 'always'}}})

    const result = await handler()
    expect(result.ok).toBe(true)

    // stream contains bundler-related logs
    const log = stream
      .end()
      .filter((log: any) => (log.type === 'system' || log.type === 'warn') && log.meta?.stage === 'bundler')
      .pop()

    expect(log.message).toContain('cache')
    expect(log.meta.strategy).toEqual('always')
  })
})
*/

/**
 *  ERRORS
 */

describe('workers - failures/errors/bad stuff', () => {
  test('worker config validation takes place and rejects bad values', async () => {
    const {handler} = createTestHandler('benchmark.js', {bad: true}, () => {
      throw new Error('validation failed')
    })

    const result = await handler()

    // validation errors don't result in a fatal error
    // so that transporters can decide how to handle failure
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('CODE_INVALID_CONFIG')
  })

  test('throws fatal error when default is not a function', async () => {
    const {handler, stream} = createTestHandler('bad.js', {entry: 'bad.js'})

    await expect(handler()).rejects.toThrow()

    const logs = stream.end().filter((l: any) => l.type === 'activation')
    expect(logs[0].meta.error).toBe('CODE_INVALID_DEFAULT_FUNCTION')
  })

  test('throws error when entry file does not exist', async () => {
    const {handler} = createTestHandler('doesnt-exist.js')

    try {
      await handler()
    } catch (error: any) {
      expect(error?.code).toBe('CODE_INVALID_ENTRY_FILE')
    }
  })

  test('worker errors are returned correctly', async () => {
    const {handler, stream} = createTestHandler('errors.js', {entry: 'errors.js'})

    const result = await handler()
    expect(result.ok).toBe(false)

    const errors = stream.end().filter((log: any) => log.type === 'error')

    expect(errors.length).toBe(1)
    expect(errors[0].message).toBe('something bad always happens')
  })

  test('worker guard ttl kills worker correctly', async () => {
    const {handler, stream} = createTestHandler('benchmark.js', {limits: {ttl: 1}})

    const result = await handler()
    expect(result.ok).toBe(false)

    const errors = stream.end().filter((log: any) => log.type === 'error')
    expect(errors.length).toBe(1)
    expect(errors[0].message).toContain('process killed ttl')
  })

  test('worker guard memory kills worker correctly', async () => {
    const {handler, stream} = createTestHandler('benchmark.js', {limits: {memory: 0.1}})

    const result = await handler()
    expect(result.ok).toBe(false)

    const errors = stream.end().filter((log: any) => log.type === 'error')
    expect(errors.length).toBe(1)
    expect(errors[0].message).toContain('process killed memory')
  })
})
