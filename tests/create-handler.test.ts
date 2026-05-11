import {createHandler} from '../src/index.js'
import {join} from 'path'
import {describe, expect, test} from 'vitest'

const wrapper = () => {
  const logs: any[] = []

  return {
    write: (chunk: any) => {
      logs.push(JSON.parse(chunk))
    },
    end: () => logs,
  }
}
describe('workers', () => {
  test('runs worker successfully', async () => {
    const stream = wrapper() as any

    const handler = createHandler({
      cwd: join(process.cwd(), 'fixtures/benchmark'),
      config: {
        entry: 'worker.js',
        bundler: {
          enabled: false,
        },
      },
      stream,
    })

    const result = await handler()
    const logs = stream.end()

    expect(result.version).toBe('v1')
    expect(result.ok).toBe(true)
    expect(result.result).toBe(null)
    expect(result.error).toBe(null)
    expect(logs.length).toBeGreaterThan(0)
  })

  test('runs a failing worker successfully', async () => {
    const stream = wrapper() as any
    const handler = createHandler({
      cwd: join(process.cwd(), 'fixtures/errors'),
      config: {
        entry: 'worker.js',
      },
      stream,
    })

    const result = await handler()
    expect(result.ok).toBe(false)

    const errors = stream.end().filter((log: any) => log.type === 'error')

    expect(errors.length).toBe(1)
    expect(errors[0].message).toBe('something bad always happens')
  })
})
