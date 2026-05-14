import {compose, Middleware, UserMiddlewareFn} from '../core/compose.js'
import {Context} from '../core/types.js'
import {WorkerError, WorkerErrorCode} from '../types/error.types.js'
import {createLogger} from '../core/shared.js'
import {
  completePreChecks,
  completeSerialisationCheck,
  importUserModule,
  memorySnapshot,
  numberFixed2,
  usercodeMiddlewareWrapper,
  validateUserMiddleware,
  validateUserModule,
} from './workers.runtime.js'

setup()

type RuntimeOpts<T> = {
  ctx: Context<T>
  done: (result: any) => void
  err: (error: any) => void
  stdout: any
  stderr: any
  pulse?: boolean
}

async function runtime<T>(opts: RuntimeOpts<T>) {
  const heartbeat = opts.pulse ? startHeartbeat() : undefined

  try {
    const {ctx, done, err, stdout, stderr} = opts

    const version = process.env.XGSD_WORKERS_VERSION ?? 'unknown'

    completePreChecks(version, stdout, stderr)

    // load user mod
    let mod
    try {
      mod = await importUserModule(ctx.meta.entry)
    } catch (error: any) {
      return err(error)
    }

    // validate default function
    try {
      validateUserModule(mod)
    } catch (error: any) {
      return err(error)
    }

    // load user middleware
    let middleware: Middleware[] = []
    if (mod.middleware && typeof mod.middleware === 'function') {
      const middlewareFn = mod.middleware as UserMiddlewareFn
      const start = performance.now()
      middleware = (await middlewareFn()) ?? []

      try {
        validateUserMiddleware(middleware)
      } catch (error: any) {
        return err(error)
      }

      const duration = performance.now() - start
      stdout.log(`loaded ${middleware.length} middleware functions in ${numberFixed2(duration)} ms`, {
        duration,
        tag: 'info',
      })
    }

    // if middleware() (register function) is exported but invalid just warn the user
    // future versions may change this
    if (mod.middleware && typeof mod.middleware !== 'function') {
      stderr.warn(`middleware() is type ${typeof mod.middleware} - expected "function". It will not be used.`)
    }

    const serialisationCheck: Middleware = async (ctx, next) => {
      async function wrapper(property: 'result' | 'error') {
        try {
          ctx[property] = completeSerialisationCheck({
            data: ctx[property],
            onError: ctx.meta.output.onError,
            stderr,
            property,
          })
        } catch (error) {
          ctx.error = error
        }
      }

      await wrapper('error')
      await wrapper('result')
    }

    const bootstrap = compose([...middleware, usercodeMiddlewareWrapper(mod.default), serialisationCheck])
    const {limits} = ctx.meta
    const {ttl, memory} = limits

    stdout.log(`running worker + ${middleware.length} middleware (ttl: ${ttl} ms, memory: ${memory} MB)`, {
      tag: 'info',
      version,
    })

    const start = performance.now()
    const result = await bootstrap(ctx)
    const duration = performance.now() - start

    stdout.log(`worker finished in ${duration.toFixed(2)} ms`, {duration, tag: 'debug'})

    // note: this could resolve vs reject
    // that covers passthrough use cases where the user
    // may not be responsible for the circular/unserialisable data
    if (result.error?.code === WorkerErrorCode.CODE_INVALID_DATA) {
      return err(result.error)
    }

    const after = memorySnapshot()
    stdout.log(`memory usage at end ${after.rss} MB (heap: ${after.heapUsed}MB/${after.heapTotal}MB)`, {
      workers: version,
      heapUsed: after.heapUsed,
      heapTotal: after.heapTotal,
      rss: after.rss,
      tag: 'debug',
    })

    return done(result)
  } finally {
    clearInterval(heartbeat)
  }
}

/**
 *  SETUP
 */
function setup() {
  const stdout = createLogger(process.stdout)
  const stderr = createLogger(process.stderr)

  rejectionHandler(stderr)

  const sigHandler = handleSignalFactory({stdout, stderr})
  const messageHandler = handleMessageFactory({stdout, stderr})

  // cleanup/exits
  process.on('SIGTERM', sigHandler)
  //process.on('SIGINT', sigHandler)

  // start message
  process.on('message', messageHandler)
}

/**
 *  HEARTBEAT
 */
function startHeartbeat(interval = 50) {
  function pulse(memory: any) {
    dispatch('ALIVE', {
      pid: process.pid,
      uptime: process.uptime(),
      memory: {
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        external: memory.external,
      },
    })
  }

  let memory = process.memoryUsage()
  pulse(memory)

  return setInterval(() => {
    memory = process.memoryUsage()

    pulse(memory)
  }, interval)
}

/**
 *  EXCEPTION/REJECTIONS
 */
function rejectionHandler(stderr: any) {
  const handler = (errorOrRejection: any) => {
    const error = errorOrRejection instanceof Error ? errorOrRejection : null

    const wrapped: WorkerError = {
      code: WorkerErrorCode.CODE_FATAL_ERROR,
      message: error?.message ?? 'uncaught exception',
      type: 'unknown',
      stack: error?.stack,
    }

    stderr.error(wrapped.message!, wrapped)
    const done = dispatch('ERROR', {error: wrapped})

    // NOTE: this failsafe was added
    // to protect against dangling processes
    if (!done) {
      process.exit(10)
    }
  }

  process.on('uncaughtException', handler)
  process.on('unhandledRejection', handler)
}

/**
 *  EXIT HANDLER
 */

function handleSignalFactory(opts: {stdout: any; stderr: any}) {
  const {stderr} = opts

  return async function (sig: NodeJS.Signals) {
    if (sig !== 'SIGTERM') return

    stderr.warn(`container received ${sig} - shutting down`)

    // handle clean up
    process.exit(0)
  }
}

/**
 *  MESSAGE HANDLER
 */
function handleMessageFactory(opts: {stdout: any; stderr: any}) {
  const {stdout, stderr} = opts

  return async function (msg: any) {
    if (msg.type !== 'START') return

    const done = (result: any) => {
      handleResult(result)
    }

    const err = (error: any) => {
      handleError(error)
    }

    await runtime({
      ctx: msg.ctx,
      done,
      err,
      stdout,
      stderr,
      pulse: true,
    })
  }
}

/**
 *  MISC HANDLERS
 */
function handleError(error: Record<string, any>) {
  dispatch('ERROR', {error})
}

function handleResult(result: Record<string, any>) {
  dispatch('DONE', {result})
}

function dispatch(event: 'ALIVE' | 'DONE' | 'ERROR', payload: any) {
  if (!process.connected || !process.send) {
    return false
  }

  process.send({
    type: event,
    ...payload,
  })

  return true
}
