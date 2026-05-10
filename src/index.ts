import {Writable} from 'stream'
import {WorkerConfig, WorkerErrorCode, ActivationHandler, WorkerResult} from './core/types.js'
import {runWorker} from './core/worker.js'
import {completeWorkerSetupFromConfig} from './util/setup.js'
import {formatWorkerResult} from './util/format.js'

export {runWorker}
export * from './core/types.js'

type CreateHandlerOpts = {
  config: WorkerConfig
  stream?: Writable
  validator?: (config: WorkerConfig) => WorkerConfig
}

export function createHandler(opts: CreateHandlerOpts): ActivationHandler {
  const {config, stream, validator} = opts

  return async function handler(activation) {
    let validated = undefined
    try {
      validated = validator?.(config) ?? config
    } catch (error: any) {
      return formatWorkerResult({
        error: {
          code: WorkerErrorCode.CODE_INVALID_CONFIG,
          message: error?.message ?? 'unknown',
        },
        duration: 0,
      })
    }

    const {ctx, signal} = completeWorkerSetupFromConfig({
      id: activation.id,
      cwd: activation.cwd,
      data: activation.data!,
      env: activation.env,
      config: validated,
      stream,
    })

    return runWorker({ctx, signal}) as Promise<WorkerResult<unknown>>
  }
}
