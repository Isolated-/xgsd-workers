import {describe, test, expect} from 'vitest'
import {createTransport} from '../src/index.js'
import {createWriteStream, readFileSync, rmSync} from 'fs'
import {join} from 'path'

const workerPath = join(process.cwd(), 'fixtures', 'combined', 'worker.js')
describe('doc example tests', () => {
  test('doc example: Quickstart', async () => {
    // you'd usually do this during app bootstrap
    const transport = createTransport({
      entry: workerPath,

      stream: {
        write: (chunk: any) => {},
      },
    })

    // this would usually be inside a callback
    // like Express/Koa/etc, really whatever you need
    // inside a script works perfectly too!
    const result = await transport({
      data: {
        hello: 'world',
      },
    })

    expect(result.ok).toBe(true)
  })

  test('doc example: Options', async () => {
    // override default stream
    const stream = createWriteStream('output.jsonl')

    const transport = createTransport({
      // entry is the absolute path to your worker.js
      entry: workerPath,
      limits: {
        // time to live in ms
        ttl: 15000,
        // memory heap usage in mb
        memory: {
          limitMB: 100,
          strategy: 'heap',
        },
      },
      output: {
        // this can be wrapped or raw
        mode: 'raw',
      },
      stream,
    })

    // assertions
    await transport()

    const file = readFileSync('output.jsonl')
    expect(file).toBeDefined()
    rmSync('output.jsonl')
  })
})
