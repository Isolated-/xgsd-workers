import {describe, test, expect} from 'vitest'
import {workerError} from '../format.js'
import {WorkerErrorCode} from '../../types/error.types.js'
import {DEFAULTS} from '../../constants.js'

describe('workerError()', () => {
  test('returns the correct error object (defaults)', () => {
    const err = workerError('something has gone wrong')

    expect(err.name).toBe(DEFAULTS.error.name)
    expect(err.message).toBe('something has gone wrong')
    expect(err.code).toBe(DEFAULTS.error.code)
    expect(err.stack).toBe(DEFAULTS.error.stack)

    expect(err.isWorkerError).toBeTruthy()
  })

  test('returns a normalised error object (no defaults)', () => {
    const error = new Error('something went really wrong')
    const err = workerError('something has gone wrong', {
      type: 'system',
      code: WorkerErrorCode.CODE_INVALID_DATA,
      name: 'WorkerErrorInvalidData',
      stack: error.stack,
      hint: 'do better',
    })

    expect(err).toEqual({
      code: WorkerErrorCode.CODE_INVALID_DATA,
      type: 'system',
      name: 'WorkerErrorInvalidData',
      message: 'something has gone wrong',
      isWorkerError: true,
      stack: error.stack,
      hint: 'do better',
    })
  })

  test('returned errors are always normalised', () => {
    const err = workerError('something has gone wrong')

    // deterministic/exact order (useful for signal storage)
    // and ensuring readability in logs
    expect(Object.keys(err)).toEqual(['code', 'type', 'name', 'message', 'isWorkerError', 'stack', 'hint'])
  })
})
