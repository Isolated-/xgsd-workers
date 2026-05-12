import {promises as fs, writeFileSync} from 'fs'
import path, {join} from 'path'

const CWD = process.cwd()
const BENCHMARKS = path.join(CWD, 'benchmarks')
const RESULTS_DIR = path.join(BENCHMARKS, 'results')

function parseMemory(value) {
  if (typeof value === 'number') return value

  return Number.parseFloat(String(value).replace('MB', '').trim())
}

function mean(values) {
  return values.reduce((acc, value) => acc + value, 0) / values.length
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }

  return sorted[middle]
}

function stats(values) {
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    mean: mean(values),
    median: median(values),
  }
}

async function collectFiles(dir) {
  const entries = await fs.readdir(dir, {withFileTypes: true})

  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        return collectFiles(fullPath)
      }

      return fullPath
    }),
  )

  return files.flat()
}

async function main() {
  const files = await collectFiles(RESULTS_DIR)

  const jsonFiles = files.filter((file) => file.endsWith('.json'))

  const results = await Promise.all(
    jsonFiles.map(async (file) => {
      const content = await fs.readFile(file, 'utf8')
      return JSON.parse(content)
    }),
  )

  const flattened = results.map((result) => ({
    activations: result.activations,
    concurrency: result.concurrency,
    successful: result.successful,
    failed: result.failed,
    averageActivationMs: result.averageActivationMs,
    totalBenchmarkSeconds: result.totalBenchmarkSeconds,
    throughput: result.throughput,
    dataSize: result.dataSize,
    rss: parseMemory(result.memory?.rss),
    heapUsed: parseMemory(result.memory?.heapUsed),
  }))

  const numericKeys = Object.keys(flattened[0]).filter((key) => flattened.every((row) => typeof row[key] === 'number'))

  const analysis = {}

  analysis.totalResultsTested = results.length
  analysis.generatedAt = new Date().toISOString()

  for (const key of numericKeys) {
    const values = flattened.map((row) => row[key])

    analysis[key] = stats(values)
  }

  const json = JSON.stringify(analysis, null, 2)
  writeFileSync(join(RESULTS_DIR, 'analysis.json'), json)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
