// benchmarks/concurrency.js

import {createWriteStream, mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {performance} from 'node:perf_hooks'
import {runWithConcurrency} from '@xgsd/engine'
import {createTransport, version} from '@xgsd/workers'

console.log(`@xgsd/workers version is ${version}`)

const ACTIVATIONS = Number(process.env.ACTIVATIONS ?? 10000)
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 8)

function formatMB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`
}

const stream = createWriteStream('signals.jsonl')

const handler = createTransport({
  entry: join(process.cwd(), 'benchmarks', 'worker.js'),
  stream,
})

// warmup
let warmed = 0
const WARM_UPS = Number(process.env.WARM_UPS ?? Math.floor(ACTIVATIONS / 100))

console.log(`warming up with ${WARM_UPS} activations (sequential)`)
while (warmed < WARM_UPS) {
  try {
    await handler()
  } catch {
    console.log(`[warm up] count ${warmed} failed`)
  }

  warmed++
}

console.log('finished warming up')

const items = Array.from({length: ACTIVATIONS})

let successful = 0
let failed = 0
let totalActivationDuration = 0

const startedAt = performance.now()

console.log('benchmark starting')
console.log('--------------------')
console.log(`activations: ${ACTIVATIONS}`)
console.log(`concurrency: ${CONCURRENCY}`)
console.log('')

let dataSize = 0

const RETURNED_OBJECTS = Number(process.env.ITEMS ?? 256)

await runWithConcurrency(items, CONCURRENCY, async (_, __, idx) => {
  const started = performance.now()

  try {
    const len = Buffer.from(
      JSON.stringify(
        await handler({
          data: {
            items: RETURNED_OBJECTS,
          },
        }),
      ),
    ).byteLength

    dataSize = dataSize + len

    successful++
  } catch (error) {
    failed++

    console.error(`activation failed idx=${idx}`)
    console.error(error)
  }

  totalActivationDuration += performance.now() - started
})

const benchmarkDuration = performance.now() - startedAt

const averageActivation = totalActivationDuration / ACTIVATIONS

const throughput = ACTIVATIONS / (benchmarkDuration / 1000)

const memory = process.memoryUsage()

console.log('')
console.log('benchmark completed')
console.log('-------------------')
console.log(`activations: ${ACTIVATIONS}`)
console.log(`concurrency: ${CONCURRENCY}`)
console.log(`successful: ${successful}`)
console.log(`failed: ${failed}`)
console.log(`average activation: ${averageActivation.toFixed(2)}ms`)
console.log(`total benchmark: ${(benchmarkDuration / 1000).toFixed(2)}s`)
console.log(`throughput: ${throughput.toFixed(2)} activations/sec`)
console.log(`total serialised data transferred: ${formatMB(dataSize)} (objects: ${RETURNED_OBJECTS})`)

console.log('')
console.log('main process memory')
console.log('-------------------')
console.log(`rss: ${formatMB(memory.rss)}`)
console.log(`heap used: ${formatMB(memory.heapUsed)}`)
console.log(`heap total: ${formatMB(memory.heapTotal)}`)
console.log(`external: ${formatMB(memory.external)}`)

mkdirSync(join('benchmarks', 'results'), {recursive: true})

const result = {
  activations: ACTIVATIONS,
  concurrency: CONCURRENCY,
  successful,
  failed,
  averageActivationMs: Number(averageActivation.toFixed(2)),
  totalBenchmarkSeconds: Number((benchmarkDuration / 1000).toFixed(2)),
  throughput: Number(throughput.toFixed(2)),
  memory: {
    rss: formatMB(memory.rss),
    heapUsed: formatMB(memory.heapUsed),
    heapTotal: formatMB(memory.heapTotal),
    external: formatMB(memory.external),
  },
  dataSize: Number(dataSize.toFixed(2)),
  timestamp: new Date().toISOString(),
}

const output = join('benchmarks', 'results', `benchmark-${ACTIVATIONS}-${CONCURRENCY}-${RETURNED_OBJECTS}.json`)

writeFileSync(output, JSON.stringify(result, null, 2))

console.log('')
console.log(`saved results to ${output}`)
