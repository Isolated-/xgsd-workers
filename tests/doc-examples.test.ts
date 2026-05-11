/**
 *  *Most* of the examples included in docs live here
 *  this ensures breaking changes don't creep into docs
 */
import {describe, test, expect} from 'vitest'
import {createHandler, WorkerConfigCacheStrategy, WorkerOutputMode} from '../src/index'
import {join} from 'path'

const stream = {write: (chunk: any) => {}} as any
const cwd = join(process.cwd(), 'fixtures', 'benchmark')

describe('docs: quickstart code example', () => {
  test('runs the basic handler example', async () => {
    const handler = createHandler({
      cwd,
      stream,
    })

    const data = {hello: 'world'}
    const output = await handler({data})
    expect(output).toBeDefined()
  })
})

describe('docs: config example', () => {
  test('doesnt throw any errors', async () => {
    const config = {
      entry: 'worker.js',
      dist: '.xgsd',
      bundler: {
        enabled: true,
        include: ['worker.js'],
        cache: {
          strategy: 'change' as WorkerConfigCacheStrategy,
        },
      },
      limits: {
        ttl: 10000,
        memory: 64,
      },
      output: {
        mode: 'wrapped' as WorkerOutputMode,
      },
    }

    const handler = createHandler({cwd, config, stream})
    await expect(handler()).resolves.toBeDefined()
  })
})
