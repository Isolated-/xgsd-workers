import {parse} from 'valibot'
import {WorkerResult, WorkerConfig, WorkerErrorCode} from './types.js'
import {formatWorkerResult, runWorker} from './worker.js'

export {runWorker}
export * from './types.js'

export {resolveDependency} from './bundler.js'

export type Activation<T = unknown> = {
  id?: string
  data?: T
  env?: Record<string, unknown>
  cwd: string
}

export type ActivationHandler = <T = unknown>(activation: Activation<T>) => Promise<WorkerResult<T>>

export function createHandler(
  config: WorkerConfig,
  validator?: (config: WorkerConfig) => WorkerConfig,
): ActivationHandler {
  return async function handler(activation) {
    let parsed = undefined
    try {
      parsed = validator?.(config) ?? config
    } catch (error: any) {
      return formatWorkerResult({
        error: {
          code: WorkerErrorCode.CODE_INVALID_CONFIG,
          message: error?.message ?? 'unknown',
        },
        duration: 0,
      })
    }

    return runWorker({
      ...parsed,
      id: activation.id,
      cwd: activation.cwd,
      data: activation.data,
      env: activation.env,
    })
  }
}
