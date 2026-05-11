import {createHandler} from '../src/index.js'
import {join} from 'path'
import {describe, expect, test} from 'vitest'
import {pathExistsSync, readJsonSync} from '../src/util/fs.js'

const wrapper = () => {
  const logs: any[] = []

  return {
    write: (chunk: any) => {
      logs.push(JSON.parse(chunk))
    },
    end: () => logs,
  }
}

const createTestHandler = (fixture: string, config?: any) => {
  const stream = wrapper() as any

  const handler = createHandler({
    cwd: join(process.cwd(), 'fixtures', fixture),
    config: {
      entry: 'worker.js',
      bundler: {
        enabled: false,
      },
      ...config,
    },
    stream,
  })

  return {handler, stream}
}

describe('workers - success', () => {
  test('runs worker successfully', async () => {
    const {handler, stream} = createTestHandler('benchmark')

    const result = await handler()
    const logs = stream.end()

    expect(result.version).toBe('v1')
    expect(result.ok).toBe(true)
    expect(result.result).toBe(null)
    expect(result.error).toBe(null)
    expect(logs.length).toBeGreaterThan(0)
  })

  test('runs TypeScript workers', async () => {
    const {handler, stream} = createTestHandler('typescript', {
      entry: 'worker.ts',
      bundler: {enabled: false},
    })

    const result = await handler()
    expect(result.ok).toBe(true)
  })

  test('runs worker successfully with custom data', async () => {
    const {handler} = createTestHandler('benchmark')

    const result = await handler({
      data: {
        var: true,
      },
    })

    expect(result.ok).toBe(true)
    expect(result.result).toEqual({var: true})
  })

  test('worker returns unwrapped result when output.mode = raw', async () => {
    const {handler} = createTestHandler('benchmark', {output: {mode: 'raw'}})

    const result = await handler({
      data: {var: true},
    })

    expect(result.ok).toBeUndefined()
    expect(result).toEqual({var: true})
  })

  describe('env tests', () => {
    test('runs workers successfully with custom env', async () => {
      const {handler} = createTestHandler('benchmark')

      const result = (await handler({
        data: {show: 'env'},
        env: {
          MY_VAR: 1234,
        },
      })) as any

      expect(result.result.MY_VAR).toBe('1234')
    })

    test('worker version and context available in env', async () => {
      const {handler} = createTestHandler('benchmark')

      const result = (await handler({
        data: {show: 'env'},
      })) as any

      expect(result.result.XGSD_WORKER_VERSION).toBeDefined()
      expect(result.result.XGSD_CTX).toBeDefined()
    })
  })
})

describe('workers - bundler related', () => {
  test('worker code is bundled (JavaScript)', async () => {
    const {handler, stream} = createTestHandler('benchmark', {bundler: {enabled: true}})

    const result = await handler()
    expect(result.ok).toBe(true)

    const path = join(process.cwd(), 'fixtures', 'benchmark', '.xgsd')

    // dist paths exist
    expect(pathExistsSync(join(path, 'bundle.js'))).toBe(true)
    expect(pathExistsSync(join(path, 'package.json'))).toBe(true)

    // package json contains deps + hash
    const json = readJsonSync(join(path, 'package.json'))
    expect(json.hash).toBeDefined()

    expect(json.dependencies).toBeDefined()
    expect(Object.keys(json.dependencies).length).toBeGreaterThanOrEqual(2)

    // stream contains bundler-related logs
    const logs = stream.end().filter((log: any) => log.type === 'system' && log.meta?.stage === 'bundler')
    expect(logs.length).toBeGreaterThan(3)
  })

  test('worker code is bundled (TypeScript)', async () => {
    const {handler, stream} = createTestHandler('typescript', {entry: 'worker.ts', bundler: {enabled: true}})

    const result = await handler()
    expect(result.ok).toBe(true)

    const path = join(process.cwd(), 'fixtures', 'benchmark', '.xgsd')

    // dist paths exist
    expect(pathExistsSync(join(path, 'bundle.js'))).toBe(true)
    expect(pathExistsSync(join(path, 'package.json'))).toBe(true)

    // package json contains deps + hash
    const json = readJsonSync(join(path, 'package.json'))
    expect(json.hash).toBeDefined()

    expect(json.dependencies).toBeDefined()
    expect(Object.keys(json.dependencies).length).toBeGreaterThanOrEqual(2)

    // stream contains bundler-related logs
    const logs = stream.end().filter((log: any) => log.type === 'system' && log.meta?.stage === 'bundler')
    expect(logs.length).toBeGreaterThan(3)
  })

  test('"always" and "change" apply cache', async () => {
    const {handler, stream} = createTestHandler('benchmark', {bundler: {enabled: true, cache: {strategy: 'always'}}})

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

describe('workers - failures/errors/bad stuff', () => {
  test('worker errors are returned correctly', async () => {
    const {handler, stream} = createTestHandler('errors')

    const result = await handler()
    expect(result.ok).toBe(false)

    const errors = stream.end().filter((log: any) => log.type === 'error')

    expect(errors.length).toBe(1)
    expect(errors[0].message).toBe('something bad always happens')
  })

  test('worker guard ttl kills worker correctly', async () => {
    const {handler, stream} = createTestHandler('benchmark', {limits: {ttl: 1}})

    const result = await handler()
    expect(result.ok).toBe(false)

    const errors = stream.end().filter((log: any) => log.type === 'error')
    expect(errors.length).toBe(1)
    expect(errors[0].message).toContain('process killed ttl')
  })

  test('worker guard memory kills worker correctly', async () => {
    const {handler, stream} = createTestHandler('benchmark', {limits: {memory: 0.1}})

    const result = await handler()
    expect(result.ok).toBe(false)

    const errors = stream.end().filter((log: any) => log.type === 'error')
    expect(errors.length).toBe(1)
    expect(errors[0].message).toContain('process killed memory')
  })
})
