import {createTransport, createTransportV2} from './dist/index.js'

const transport = createTransportV2({
  entry: './entry.js',
  contractVersion: 'v1.1',
  stream: 'none',
  limits: {
    ttl: 'none',
  },
})

;(async () => {
  await transport.execute({
    data: {
      hello: 'world',
    },
  })
})()

//transport.abort()
