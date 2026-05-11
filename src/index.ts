import {Writable} from 'stream'
import {WorkerConfig, WorkerErrorCode, ActivationHandler, WorkerResult, Activation} from './core/types.js'
import {runWorker} from './core/worker.js'
import {completeWorkerSetupFromConfig} from './util/setup.js'
import {formatWorkerResult} from './util/format.js'
import {pathExistsSync} from './util/fs.js'
import {WorkerError} from './core/types.js'
import {readFileSync} from 'fs'
import {join} from 'path'

export {runWorker}
export * from './core/types.js'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

export const version = packageJson.version

type CreateHandlerOpts = {
  cwd?: string
  config: WorkerConfig
  stream?: Writable
  validator?: (config?: WorkerConfig) => WorkerConfig
}

export function createHandler(opts?: CreateHandlerOpts): ActivationHandler {
  const {config, stream, validator, cwd} = opts ?? {}

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
      id: activation?.id,
      cwd: activation?.cwd ?? cwd!,
      data: activation?.data!,
      env: activation?.env,
      config: validated,
      stream,
    })

    if (!pathExistsSync(join(ctx.meta.cwd, ctx.meta.entry))) {
      const err: WorkerError = {
        code: WorkerErrorCode.CODE_INVALID_ENTRY_FILE,
        message: `entry file "${ctx.meta.entry}" does not exist`,
        type: 'user',
      }

      throw err
    }

    return runWorker({ctx, signal}) as Promise<WorkerResult<unknown>>
  }
}
