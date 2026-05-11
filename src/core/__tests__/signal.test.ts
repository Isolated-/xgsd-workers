import {describe, test, expect} from 'vitest'
import {createSignalContext, createSignalLogger} from '../signal.js'
import {completeWorkerSetupFromConfig} from '../../util/setup.js'

const mockStream = () => {
  let messages: any[] = []

  return {
    write: (message: any) => {
      messages.push(message)
    },
    end: () => messages,
  }
}

describe('createSignalContext', () => {
  test('returns a signal context (from cwd/stream)', () => {
    const stream = mockStream()
    const opts = {
      mapper: () => {},
      stream,
    } as any

    const signalContext = createSignalContext(opts)
    expect(signalContext).toBeDefined()

    signalContext.emit({type: 'generic', message: 'generic'})

    const messages = stream.end()
    expect(messages).toHaveLength(1)
  })
})

describe('createSignalLogger', () => {
  test('returns a signal logger', () => {
    let messages = []
    const {signal} = completeWorkerSetupFromConfig({
      cwd: '',
      stream: {
        write: (message: any) => {
          messages.push(message)
          return true
        },
      } as any,
    })

    const logger = createSignalLogger(signal)

    expect(logger.log).toBeInstanceOf(Function)
    expect(logger.warn).toBeInstanceOf(Function)
    expect(logger.error).toBeInstanceOf(Function)
    expect(logger.activation).toBeInstanceOf(Function)
    expect(logger.metric).toBeInstanceOf(Function)
    expect(logger.system).toBeInstanceOf(Function)
    expect(logger.generic).toBeInstanceOf(Function)

    logger.log('hello world')
    logger.warn('hello world')
    logger.error('hello world')
    logger.activation('hello world')
    logger.metric({true: true})
    logger.system('hello world')
    logger.generic('hello world')

    expect(messages.length).toEqual(7)
  })
})
