import {describe, test, expect} from 'vitest'
import {createTransport} from '../src/index.js'
import {createWriteStream, readFileSync, rmSync} from 'fs'
import {join} from 'path'

describe('doc example tests', () => {
  test('doc example: Options', async () => {
    // override default stream
    const stream = createWriteStream('output.jsonl')

    const transport = createTransport({
      // entry is the absolute path to your worker.js
      entry: join(process.cwd(), 'fixtures', 'combined', 'worker.js'),
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
