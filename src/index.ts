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
import {
  activationRecord,
  assertEntryFile,
  completeWorkerSetup,
  createContextForActivation,
  createStream,
} from './util/setup.js'
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
import {formatWrappedTransportResult, isSupportedVersion, workerError} from './util/format.js'
import {ContractVersion, TransportResult, WorkerResult} from './types/result.types.js'
import {SUPPORTED_VERSIONS} from './constants.js'

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
  WorkerException,

  // transport
  TransportResult,

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
  contractVersion?: ContractVersion

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

  // TODO: remove this
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
export function createTransport<const Mode extends WorkerOutputMode = 'wrapped'>(
  opts: CreateTransportOpts<Mode>,
): ActivationHandler<Mode> {
  const stream = createStream(opts.stream)

  const {ctx, logger, setActivationId} = completeWorkerSetup(opts, stream)
  const {contractVersion} = ctx

  if (!isSupportedVersion(contractVersion)) {
    throw WorkerException.from(
      workerError(`"${contractVersion}" is not supported`, {
        code: WorkerErrorCode.CODE_UNSUPPORTED_VERSION,
        type: 'user',
        hint: `supported versions: ${SUPPORTED_VERSIONS.join(',')}`,
      }),
    )
  }

  if (!assertEntryFile(ctx.meta.entry, contractVersion)) {
    throw WorkerException.from(
      workerError(`"${ctx.meta.entry}" does not exist.`, {
        type: 'user',
        code: WorkerErrorCode.CODE_NO_ENTRY_FILE,
      }),
    )
  }

  logger.system(`new context started (ctx: ${ctx.contextId})`)

  const handle: ActivationHandler<Mode> = async (activation) => {
    const activationCtx = createContextForActivation({ctx, activation, logger})

    setActivationId(activationCtx.activationId!)

    logger.system(`activation started (act: ${activationCtx.activationId}, ctx: ${ctx.id})`)

    const record = activationRecord({
      logger,
      version,
    })

    const consoleMode = typeof opts.console === 'string' ? opts.console : opts.console?.mode
    const start = performance.now()
    try {
      const result = (await runWorker({
        ctx: activationCtx,
        logger,
        mode: consoleMode,
      })) as any

      // activation record
      record.success(result.duration)

      if (ctx.meta.output.mode === 'raw') {
        return result.ok ? result.result : result.error
      }

      return formatWrappedTransportResult({...result, activationId: ctx.activationId, version: contractVersion})
    } catch (error: any) {
      record.error(error?.code ?? error?.message ?? 'unknown', performance.now() - start)

      if (contractVersion === 'v1') {
        throw error
      }

      throw WorkerException.from(error)
    }
  }

  return handle
}
