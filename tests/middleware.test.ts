import {createHandler, runWorker} from '../src/index.js'
import {describe, test, expect} from 'vitest'
import {join} from 'path'
import {completeWorkerSetupFromConfig} from '../src/util/setup.js'

// these will be made generic and extracted to @xgsd/test
export const createTestEnvironment = (fixture: string, config?: any) => {
  const cwd = config?.cwd ?? join(process.cwd(), 'fixtures', 'combined')
  return completeWorkerSetupFromConfig({
    cwd,
    config: {
      ...config,
      entry: fixture,
    },
    stream: createFakeStream(),
  })
}

export const createFakeStream = () => {
  let messages: any[] = []
  return {
    write: (chunk: string) => {
      messages.push(JSON.parse(chunk))
    },
    getMessages: () => messages,
  } as any
}

describe('middleware tests', () => {
  test('middleware order is predictable + ctx can be mutated', async () => {
    const {ctx, signal} = createTestEnvironment('middleware.js', {output: {mode: 'raw'}})

    ctx.trace = []

    const result = await runWorker({ctx, signal})
    expect(result).toEqual(['A', 'B', 'C', 'C', 'B', 'A'])
  })
})
