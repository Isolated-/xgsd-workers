import {WorkerResult, WorkerConfig} from './types.js'
import {runWorker} from './worker.js'

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

export function createHandler(config: WorkerConfig): ActivationHandler {
  return async function handler(activation) {
    return runWorker({
      ...config,
      limits: {
        ttl: 1000,
        memory: 64,
        ...config.limits,
      },
      id: activation.id,
      cwd: activation.cwd,
      data: activation.data,
      env: activation.env,
    })
  }
}
