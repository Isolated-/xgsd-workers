import {join} from 'path'
import {describe, test, expect} from 'vitest'
import {createTransport} from '../../src/index.js'
import {WorkerErrorCode, WorkerException} from '../../src/types/error.types.js'
import {createTestTransport} from './util.js'

describe('Workers Public API (v1.1)', () => {
  test('contract version must be valid and supported', () => {
    try {
      createTestTransport('does-nothing.js', {contractVersion: 'v2'})

      expect(true).toBeFalsy()
    } catch (error: any) {
      expect(error).toBeInstanceOf(WorkerException)
      expect(error.code).toBe(WorkerErrorCode.CODE_UNSUPPORTED_VERSION)
    }
  })

  test("contract version doesn't need a prefix", () => {
    try {
      const {transport} = createTestTransport('does-nothing.js', {contractVersion: '1'})

      expect(transport).toBeDefined()
    } catch (error: any) {
      expect(error).toBeUndefined()
    }
  })

  test('no excessive/non-meaningful/debug signals by default', async () => {
    const {transport, stream} = createTestTransport('does-nothing.js', {contractVersion: 'v1.1'})

    await transport()

    const signals = stream.finish()
    expect(signals.length).toBeLessThanOrEqual(5)
  })

  test('stream: none is accepted', async () => {
    const transport = createTransport({
      entry: join(process.cwd(), 'fixtures', 'combined', 'does-nothing.js'),
      contractVersion: 'v1.1',
      stream: 'none',
    })

    const res = await transport()
    expect(res.ok).toBeTruthy()
  })

  test('errors are meaningful and easier to use', async () => {
    const {transport, stream} = createTestTransport('unknown.js', {contractVersion: 'v1'})

    try {
      const res = await transport()
      expect(res).toBeUndefined()
    } catch (error: any) {
      expect(error.isWorkerError).toBeTruthy()

      // note: as contractVersion: v1 the error thrown should
      // *not* be CODE_NO_ENTRY_FILE.
      expect(error.code).toBe(WorkerErrorCode.CODE_INVALID_ENTRY_FILE)
    }

    const signal = stream
      .finish()
      .filter((s) => s.type === 'error')
      .pop()

    expect(signal).toBeDefined()

    expect(signal.meta.name).toBe('WorkerError')
    expect(signal.meta.isWorkerError).toBeTruthy()
  })

  // this is gated to prevent breaking v1 contract
  // but should be preferred as it saves workers failing late (e.g. after child process setup)
  test('WorkerException is thrown if entry file is missing - pre-checks', async () => {
    try {
      createTestTransport('unknown.js', {contractVersion: 'v1.1'})
    } catch (error: any) {
      expect(error).toBeInstanceOf(WorkerException)
      expect(error.isWorkerError).toBeTruthy()
      expect(error.name).toBe('WorkerException')

      expect(error.code).toBe(WorkerErrorCode.CODE_NO_ENTRY_FILE)
    }
  })

  /*
  test('WorkerException instances are created from error objects', async () => {
    const {transport} = createTestTransport('unknown.js', {contractVersion: 'v1.1'})

    try {
      const res = await transport()
      expect(res).toBeUndefined()
    } catch (error: any) {
      expect(error).toBeInstanceOf(WorkerException)
      expect(error.isWorkerError).toBeTruthy()
      expect(error.name).toBe('WorkerException')
    }
  })
*/
  test('output: raw|wrapped is accepted (vs output.mode: raw|wrapped)', async () => {
    const {transport} = createTestTransport('benchmark.js', {contractVersion: 'v1.1', output: 'raw'})

    const result = await transport({anything: 'goes'})

    expect(result).toEqual({anything: 'goes'})
  })

  test('transport() is simplified to only require "data"', async () => {
    const {transport} = createTestTransport('benchmark.js', {output: {mode: 'raw'}})

    const result = await transport({anything: 'goes'})

    expect(result).toBeDefined()
  })

  test('transport() accepts more than just objects', async () => {
    const {transport} = createTestTransport('benchmark.js', {contractVersion: 'v1.1'})

    const results = await Promise.all([transport('my string'), transport(2), transport(false)])

    expect(results.every((x) => x.ok)).toBe(true)
  })

  test('"act" is present in signals', async () => {
    const {transport, stream} = createTestTransport('benchmark.js', {contractVersion: 'v1.1'})

    await transport()

    const signals = stream.finish().every((x) => typeof x.act === 'string' && x.act)
    expect(signals).toBe(true)
  })

  test('"pid" is present in signals', async () => {
    const {transport, stream} = createTestTransport('benchmark.js', {contractVersion: 'v1.1'})

    await transport()

    const signals = stream.finish().every((x) => typeof x.pid === 'number' && x.pid)
    expect(signals).toBe(true)
  })

  test('activationId is returned in wrapped results', async () => {
    const transport = createTransport({
      entry: join(process.cwd(), 'fixtures', 'combined', 'benchmark.js'),
      contractVersion: 'v1.1',
      stream: {
        write: () => {},
      },
    })

    const result = await transport()
    expect(result.version).toBe('v1.1')
  })
})
