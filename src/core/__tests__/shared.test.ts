import {describe, test, expect} from 'vitest'
import {createLogger} from '../shared.js'

describe('createLogger', () => {
  test('should return the Logger interface', () => {
    const stream = {
      write: (chunk: any) => void {},
    }

    const logger = createLogger(stream as any)

    expect(logger.log).toBeInstanceOf(Function)
    expect(logger.warn).toBeInstanceOf(Function)
    expect(logger.error).toBeInstanceOf(Function)
    expect(logger.metric).toBeInstanceOf(Function)

    // no errors thrown
    logger.log('hello world')
    logger.warn('hello world')
    logger.error('hello world')
    logger.metric({num: 1})
  })
})
