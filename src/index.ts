import {WorkerResult, WorkerConfig} from './types'
import {runWorker} from './worker'

export type Activation<T = unknown> = {
  id?: string
  data?: T
  env?: Record<string, unknown>
  cwd: string
}

export type ActivationHandler = <T = unknown>(activation: Activation<T>) => Promise<WorkerResult<T>>

export function createHandler(config: WorkerConfig): ActivationHandler {
  return async function handler(activation) {
    return runWorker({
      ...config,
      id: activation.id,
      cwd: activation.cwd,
      data: activation.data,
      env: activation.env,
    })
  }
}
