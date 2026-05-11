export function createLogger(stream?: Writable) {
  return {
    log: (message: string, meta?: Record<string, unknown>) => {
      stream.write(JSON.stringify({__sys: true, type: 'system', message, meta}) + '\n')
    },
    metric: (meta: Record<string, unknown>) => {
      stream.write(JSON.stringify({__sys: true, type: 'metric', message: 'metric', meta}) + '\n')
    },
    error: (message: string, meta?: Record<string, unknown>) => {
      stream.write(
        JSON.stringify({
          __sys: true,
          type: 'error',
          message: message,
          meta,
        }) + '\n',
      )
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      stream.write(
        JSON.stringify({
          __sys: true,
          type: 'warn',
          message: message,
          meta,
        }) + '\n',
      )
    },
  }
}
