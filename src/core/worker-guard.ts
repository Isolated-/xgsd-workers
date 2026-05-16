import {WorkerError, WorkerErrorCode} from '../types/error.types.js'
import {SignalContext} from './signal.js'
import {Context, WorkerGuardOpts} from './types.js'

type Throttler = (memory: {rss: number; heap: number}) => boolean

type GuardOpts = {
  signal?: SignalContext
  logger: any
  child: any
  limits: WorkerGuardOpts
  throttler: Throttler
}

export function workerGuardThrottler(ctx: Context<any>, logger: any) {
  return (mem: {rss: number; heap: number}) => {
    const {heap, rss} = mem
    const {memory} = ctx.meta.limits
    const limitMB = typeof memory === 'number' ? memory : memory.limitMB

    if (typeof memory === 'number' || memory.strategy === 'heap') {
      const heapMB = heap / 1024 / 1024
      return heapMB > limitMB
    }

    if (memory.strategy !== 'rss') {
      logger.warn(`"${memory.strategy}" is not a valid strategy, "rss" will be used.`)
    }

    const rssMB = rss / 1024 / 1024
    return rssMB > limitMB
  }
}

export function startWorkerGuard(opts: GuardOpts, suspended?: (reason: WorkerError) => void) {
  const {child, logger} = opts
  const {ttl, memory} = opts.limits

  let ttlTimer: NodeJS.Timeout | null = null
  let killed = false

  const kill = (reason: string) => {
    if (killed) return
    killed = true

    if (ttlTimer) clearTimeout(ttlTimer)

    child.kill('SIGKILL')

    const err: WorkerError = {
      code: WorkerErrorCode.CODE_WORKER_GUARD,
      message: reason,
      type: 'system',
    }

    logger.error(`process killed ${reason}`, {...err, guard: true})

    suspended?.(err)
  }

  // TTL watchdog
  ttlTimer = setTimeout(() => {
    kill(`ttl exceeded limit (limit: ${ttl.toFixed(2)}ms)`)
  }, ttl)

  child.on('message', (msg: any) => {
    if (msg.type !== 'ALIVE') {
      return
    }

    // (v0.1.0) this isn't set in stone
    // may be worth using RSS
    // (v1-beta) let caller decide how to throttle
    const limit = typeof memory === 'number' ? memory : memory.limitMB
    const shouldThrottle = opts.throttler({
      rss: msg.memory?.rss,
      heap: msg.memory?.heapUsed,
    })

    if (shouldThrottle) {
      kill(`memory limit exceeded (limit: ${limit.toFixed(2)}MB)`)
    }
  })

  child.on('exit', () => {
    if (ttlTimer) clearTimeout(ttlTimer)
  })
}
