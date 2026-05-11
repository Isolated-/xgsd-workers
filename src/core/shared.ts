export function createLogger() {
  return {
    log: (message: string, meta?: Record<string, unknown>) => {
      console.log(
        JSON.stringify({
          __sys: true,
          type: 'system',
          message: message,
          meta,
        }),
      )
    },
    metric: (meta: Record<string, unknown>) => {
      console.log(JSON.stringify({__sys: true, type: 'metric', message: 'metric', meta}))
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      console.log(
        JSON.stringify({
          __sys: true,
          type: 'warn',
          message: message,
          meta,
        }),
      )
    },
  }
}
