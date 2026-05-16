import {
  Activation,
  Context,
  ContextMetadata,
  WorkerOutputMode,
  MemoryType,
  ErrorBehaviour,
  GuardErrorBehaviour,
  ActivationHandler,
} from './core/types.js'
import {runWorker} from './core/worker.js'
import {compact, completeWorkerSetupFromConfig} from './util/setup.js'
import {readFileSync} from 'fs'
import {StreamLike} from './types/stream-like.type.js'
import {WorkerErrorCode, WorkerError, WorkerException} from './types/error.types.js'
import {Next, Middleware} from './core/compose.js'
import {
  Signal,
  ActivationSignal,
  LogSignal,
  ErrorSignal,
  GenericSignal,
  SystemSignal,
  SignalType,
} from './types/signal.types.js'
import {createHash, randomBytes, randomUUID} from 'crypto'
import {createSignalContext, createSignalLogger} from './core/signal.js'
import {formatWrappedTransportResult} from './util/format.js'
import {SchemaVersion, TransportResult, WorkerResult} from './types/result.types.js'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
export const version = packageJson.version

// public types
export {
  // misc
  Activation,
  ActivationHandler,
  StreamLike,

  // middleware
  Next,
  Middleware,

  // context
  Context,
  ContextMetadata,

  // worker types
  WorkerError,
  WorkerErrorCode,
  WorkerResult,
  WorkerOutputMode,

  // signals
  Signal,
  ActivationSignal,
  LogSignal,
  ErrorSignal,
  GenericSignal,
  SystemSignal,
  SignalType,
}

/**
 * Configuration options for `createTransport()`.
 *
 * `CreateTransportOpts` controls how Workers.js loads, executes,
 * and manages worker activations.
 *
 * ---
 *
 * ## Entry
 *
 * `entry` is the path to the worker entry file.
 *
 * Workers should export a default async function:
 *
 * ```js
 * export default async function worker(data) {
 *   return data
 * }
 * ```
 *
 * Entry paths are resolved before worker execution begins.
 *
 * ---
 *
 * ## Streams
 *
 * `stream` is used to receive runtime signals emitted by Workers.js.
 *
 * Signals may include:
 *
 * - lifecycle events
 * - logs
 * - runtime/system messages
 * - structured errors
 *
 * Streams only need to implement:
 *
 * ```ts
 * {
 *   write(chunk): boolean
 * }
 * ```
 *
 * Example:
 *
 * ```ts
 * createTransport({
 *   entry: './worker.js',
 *   stream: process.stdout,
 * })
 * ```
 *
 * ---
 *
 * ## Environment variables
 *
 * `env` provides default activation environment variables.
 *
 * These values override any activation values.
 *
 * Example:
 *
 * ```ts
 * createTransport({
 *   entry: './worker.js',
 *   env: {
 *     region: 'eu-west-1',
 *   },
 * })
 * ```
 *
 * ---
 *
 * ## Limits
 *
 * `limits` configures runtime resource constraints.
 *
 * Limits are enforced per worker activation.
 *
 * Supported limits:
 *
 * - `ttl` → maximum activation runtime in milliseconds
 * - `memory` → maximum worker memory usage
 *
 * Example:
 *
 * ```ts
 * createTransport({
 *   entry: './worker.js',
 *   limits: {
 *     ttl: 5000,
 *     memory: 128,
 *   },
 * })
 * ```
 *
 * ---
 *
 * ## Output modes
 *
 * Workers.js supports two output modes:
 *
 * ### Wrapped mode (default)
 *
 * Returns a structured `WorkerResult` response:
 *
 * ```json
 * {
 *   "version": "v1",
 *   "ok": true,
 *   "result": {},
 *   "error": null
 * }
 * ```
 *
 * ### Raw mode
 *
 * Returns the worker result directly:
 *
 * ```ts
 * createTransport({
 *   output: {
 *     mode: 'raw',
 *   },
 * })
 * ```
 *
 * Raw mode is useful when Workers.js is being integrated into
 * existing transports, queues, or RPC systems.
 *
 * ---
 *
 * @since v1
 */
export type CreateTransportOpts<Mode extends WorkerOutputMode = 'wrapped'> = {
  /**
   * Path to the worker entry file.
   */
  entry: string

  /**
   * Refers to the API version — not the same as @xgsd/workers version
   *
   * Will affect what features are available to maintain backward compatibility.
   */
  schemaVersion?: SchemaVersion

  /**
   * Writable stream used for runtime signals/logs.
   *
   * When undefined, process.stdout is used
   * Use "none" to override this
   */
  stream?: 'none' | StreamLike

  /**
   * Default activation environment variables.
   */
  env?: Record<string, unknown>

  /**
   * Runtime execution limits.
   */
  limits?: {
    /**
     * Maximum activation runtime in milliseconds.
     */
    ttl?: number

    /**
     * Maximum worker memory usage.
     */
    memory?: MemoryType

    /**
     *  added in v1.0.3
     *  when worker guard is triggered promise will be rejected vs resolved
     */
    onError?: GuardErrorBehaviour

    [key: string]: unknown
  }

  console?:
    | 'debug'
    | {
        mode: 'debug'
      }

  /**
   * Worker output configuration.
   */
  output?:
    | Mode
    | {
        /**
         * Output mode.
         *
         * - `wrapped` → structured WorkerResult response
         * - `raw` → returns worker result/error directly
         */
        mode?: Mode

        /**
         *  added in v1.0.3
         *  determines what to when data can't be serialised
         */
        onError?: ErrorBehaviour

        [key: string]: unknown
      }
}

/**
 * Creates a reusable worker transport.
 *
 * `createTransport()` is the primary public API exposed by
 * `@xgsd/workers`.
 *
 * A transport is responsible for:
 *
 * - loading a worker entry file
 * - creating activation contexts
 * - executing middleware + worker pipelines
 * - producing WorkerResult responses
 * - dispatching runtime signals/logs
 *
 * The returned handler can be invoked multiple times with different
 * activation payloads.
 *
 * ---
 *
 * ## Worker model
 *
 * Workers are designed for ESM environments and should export a
 * default function.
 *
 * Example:
 *
 * ```js
 * export default async function (data) {
 *   return {
 *     hello: data.name,
 *   }
 * }
 * ```
 *
 * ---
 *
 * ## Activation lifecycle
 *
 * Each call to the returned handler creates a fresh activation context.
 *
 * The activation context contains:
 *
 * - activation data
 * - environment variables
 * - middleware state
 * - execution metadata
 * - worker result/error state
 *
 * Middleware may freely mutate the activation context during execution.
 *
 * Only `ctx.result` and `ctx.error` are considered transport output.
 *
 * ---
 *
 * ## Serialisation
 *
 * Worker results should contain serialisable data.
 *
 * Complex objects may lose prototype information during transport.
 *
 * Non-serialisable values (such as circular references, functions,
 * streams, sockets, etc.) may cause the activation to fail with
 * `CODE_INVALID_DATA`.
 *
 * ---
 *
 * ## Signals
 *
 * Workers emit runtime signals during execution.
 *
 * Signals may include:
 *
 * - activation lifecycle events
 * - logs
 * - errors
 * - system/runtime messages
 *
 * Signals are written to the configured stream.
 *
 * ---
 *
 * ## Example
 *
 * ```ts
 * import {createTransport} from '@xgsd/workers'
 *
 * const transport = createTransport({
 *   entry: './worker.js',
 * })
 *
 * const result = await transport({
 *   data: {
 *     name: 'world',
 *   },
 * })
 *
 * console.log(result)
 * ```
 *
 * ---
 *
 * ## Output modes
 *
 * Wrapped mode (default):
 *
 * ```json
 * {
 *   "version": "v1",
 *   "ok": true,
 *   "result": {},
 *   "error": null
 * }
 * ```
 *
 * Raw mode:
 *
 * ```ts
 * createTransport({
 *   output: {
 *     mode: 'raw'
 *   }
 * })
 * ```
 *
 * Returns the worker result directly.
 *
 * ---
 *
 * @since v1
 */
export function createTransport<
  const Mode extends WorkerOutputMode = 'wrapped',
  const Version extends SchemaVersion = 'v1',
>(opts: CreateTransportOpts<Mode>): ActivationHandler<Mode> {
  const {limits, entry, output} = opts
  let stream = (opts.stream ?? process.stdout) as StreamLike

  if (opts.stream === 'none') {
    stream = {
      write: (chunk: string) => {},
    }
  }

  const schemaVersion = opts.schemaVersion ?? 'v1'
  const config = {
    entry,
    limits,
    output,
    schemaVersion,
  } as CreateTransportOpts

  const {ctx, signal} = completeWorkerSetupFromConfig({stream, config})

  let logger = createSignalLogger(signal)
  logger.system(`new context started (ctx: ${ctx.id})`)

  const handle: ActivationHandler<Mode> = async (activation) => {
    const id = compact('act')

    const normalised = normaliseActivation(activation)

    const activationCtx = {
      ...ctx,
      ...normalised,
      activationId: normalised?.id ?? id,
    }

    logger.system(`activation started (act: ${activationCtx.activationId}, ctx: ${ctx.id})`)

    signal.setId(activationCtx.activationId)

    const record = activationRecord({
      logger,
      version,
    })

    const consoleMode = typeof opts.console === 'string' ? opts.console : opts.console?.mode
    const start = performance.now()
    try {
      const result = (await runWorker({
        ctx: activationCtx,
        signal,
        mode: consoleMode,
      })) as any

      // activation record
      record.success(result.duration)

      if (ctx.meta.output.mode === 'raw') {
        return result.ok ? result.result : result.error
      }

      let formatSubject: TransportResult<'wrapped'> = {
        version: 'v1',
        ok: true,
        result: result.result,
        error: result.error,
        duration: result.duration,
      }

      if (schemaVersion === 'v1.1') {
        formatSubject = {...formatSubject, version: 'v1.1', activationId: activationCtx.activationId}
      }

      return formatWrappedTransportResult(formatSubject)
    } catch (error: any) {
      record.error(error?.code ?? error?.message ?? 'unknown', performance.now() - start)

      if (schemaVersion === 'v1') {
        throw error
      }

      throw WorkerException.from(error)
    }
  }

  return handle
}

// these need to relocated
function isActivation<T = unknown>(input: unknown): input is Activation<T> {
  if (input === null || typeof input !== 'object') {
    return false
  }

  return 'data' in input || 'env' in input || 'id' in input || 'cwd' in input
}

function normaliseActivation<T>(input: T | Activation<T>): Activation<T> {
  if (isActivation(input)) {
    return input as Activation<T>
  }

  return {
    data: input as T,
  }
}

type ActivationRecordOpts = {
  logger: any
  version: string
}

// move these
const activationRecord = (opts: ActivationRecordOpts) => {
  const {logger, version} = opts

  return {
    success: (duration: number, message?: string) => {
      let msg = message ?? `activation completed in ${duration} ms`

      logger.activation(msg, {
        version,
        ok: true,
        error: null,
        duration,
      })
    },

    error: (error: string, duration: number, message?: string) => {
      let msg = message ?? `activation failed with ${error}`

      logger.activation(msg, {
        version,
        ok: false,
        error,
        duration,
      })
    },
  }
}
