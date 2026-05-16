import {join} from 'path'
import {createTransport} from '../../src/index.js'

export const wrapper = () => {
  const logs: any[] = []

  return {
    write: (chunk: any) => {
      logs.push(JSON.parse(chunk))
    },
    finish: () => logs,
  }
}

export const createTestTransport = (fixture: string, config?: any) => {
  const stream = wrapper()

  const transport = createTransport({
    entry: join(process.cwd(), 'fixtures', 'combined', fixture),
    output: {
      mode: 'wrapped',
    },
    stream,
    ...config,
  })

  return {transport, stream}
}
