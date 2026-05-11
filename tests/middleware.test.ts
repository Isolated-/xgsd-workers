import {createHandler, runWorker} from '../src/index.js'
import {describe, test, expect} from 'vitest'
import {join} from 'path'
import {completeWorkerSetupFromConfig} from '../src/util/setup.js'

const wrapper = () => {
  const logs: any[] = []

  return {
    write: (chunk: any) => {
      logs.push(JSON.parse(chunk))
    },
    end: () => logs,
  }
}

const createTestEnvironment = (fixture: string, config?: any) => {
  const cwd = config?.cwd ?? join(process.cwd(), 'fixtures', fixture)
  return completeWorkerSetupFromConfig({
    cwd,
    config,
  })
}

describe('middleware tests', () => {
  test('middleware order is predictable + ctx can be mutated', async () => {
    const {ctx, signal} = createTestEnvironment('middleware', {output: {mode: 'raw'}})

    ctx.trace = []

    const result = await runWorker({ctx, signal})
    expect(result).toEqual(['A', 'B', 'C', 'C', 'B', 'A'])
  })
})
