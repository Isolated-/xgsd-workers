import {DEFAULTS} from '../constants.js'
import {createSignalContext} from '../core/signal.js'
import {Context, WorkerConfig} from '../core/types.js'
import {randomUUID} from 'crypto'
import {normaliseSignal} from './format.js'
import {version} from '../index.js'
import {StreamLike} from '../types/stream-like.type.js'
import path from 'path'

type SetupOpts = {
  id?: string
  data?: Record<string, any> | null
  env?: Record<string, any>
  stream?: StreamLike
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
      cwd: '',
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

  ctx.meta.entry = path.resolve(ctx.meta.entry)
  ctx.meta.cwd = path.dirname(ctx.meta.entry)

  const stream = opts.stream ?? process.stdout

  const signal = createSignalContext({
    ctx,
    stream,
    mapper: normaliseSignal,
  })

  return {ctx, signal}
}
