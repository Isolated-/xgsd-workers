import {ActivationHandler, WorkerResult, WorkerOutputMode, MemoryType} from './core/types.js'
import {WorkerError, WorkerErrorCode} from './types/error.types.js'
import {runWorker} from './core/worker.js'
import {completeWorkerSetupFromConfig} from './util/setup.js'
import {readFileSync} from 'fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

export const version = packageJson.version

import {StreamLike} from './types/stream-like.type.js'
export {StreamLike}

type CreateTransportOpts<Mode extends WorkerOutputMode = 'wrapped'> = {
  entry: string
  // take WorkerConfig off API
  // as apps can really define what that is
  stream?: StreamLike
  limits?: {
    ttl?: number
    memory?: MemoryType
    [key: string]: undefined | number | MemoryType
  }
  output?: {
    mode?: Mode
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
export function createTransport<Mode extends WorkerOutputMode = 'wrapped'>(
  opts: CreateTransportOpts<Mode>,
): ActivationHandler {
  const {limits, entry, output} = opts
  const stream = opts.stream

  const config = {
    entry,
    limits,
    output,
  }

  const {ctx, signal} = completeWorkerSetupFromConfig({config, stream})

  return async function handle(activation) {
    const activationCtx = {
      ...ctx,
      id: activation?.id ?? ctx.id,
      data: activation?.data,
      env: activation?.env ?? {},
    }

    return runWorker({ctx: activationCtx, signal}) as Promise<WorkerResult<any>>
  }
}

export {WorkerError, WorkerErrorCode}
