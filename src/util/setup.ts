import {DEFAULTS} from '../constants.js'
import {createSignalContext} from '../core/signal.js'
import {Context, WorkerConfig} from '../core/types.js'
import {Writable} from 'stream'
import {join} from 'path'
import {randomUUID} from 'crypto'
import {createWriteStream} from 'fs'
import {normaliseSignal} from './format.js'
import {version} from '../index.js'

type SetupOpts = {
  id?: string
  cwd: string
  data?: Record<string, any> | null
  env?: Record<string, any>
  stream?: Writable
  config?: WorkerConfig
}

export function completeWorkerSetupFromConfig(opts: SetupOpts) {
  const ctx: Context = {
    id: opts.id ?? randomUUID(),
    data: opts.data,
    env: opts.env ?? null,
    state: {},
    error: null,
    result: null,
    meta: {
      cwd: opts.cwd,
      version: version,
      entry: opts.config?.entry ?? DEFAULTS.entryFileRelative,
      limits: {
        ...DEFAULTS.limits,
        ...opts.config?.limits,
      },
      output: {
        ...DEFAULTS.output,
        ...opts.config?.output,
      },
    },
  }

  const stream = opts.stream ?? process.stdout

  const signal = createSignalContext({
    ctx,
    stream,
    mapper: normaliseSignal,
  })

  return {ctx, signal}
}
