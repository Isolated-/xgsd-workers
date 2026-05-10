import {DEFAULTS} from '../constants'
import {createSignalContext} from '../core/signal'
import {Context, WorkerConfig} from '../core/types'
import {getPackageVersion} from './package'
import {Writable} from 'stream'
import {join} from 'path'
import {randomUUID} from 'crypto'
import {createWriteStream} from 'fs'
import {normaliseSignal} from './format'

type SetupOpts = {
  id?: string
  cwd: string
  data?: Record<string, any> | null
  env?: Record<string, any>
  stream?: Writable
  config?: WorkerConfig
}

export function completeWorkerSetupFromConfig(opts: SetupOpts) {
  const dist = join(opts.cwd, opts.config?.dist ?? DEFAULTS.distPathRelative)
  const ctx: Context = {
    id: opts.id ?? randomUUID(),
    data: opts.data,
    env: opts.env ?? null,
    meta: {
      cwd: opts.cwd,
      dist,
      version: getPackageVersion('@xgsd/workers', opts.cwd),
      entry: opts.config?.entry ?? DEFAULTS.entryFileRelative,
      limits: {
        ...DEFAULTS.limits,
        ...opts.config?.limits,
      },
      bundler: {
        ...DEFAULTS.bundler,
        ...opts.config?.bundler,
      },
      output: {
        ...DEFAULTS.output,
        ...opts.config?.output,
      },
    },
  }

  const stream = opts.stream ?? createWriteStream(join(dist, DEFAULTS.signalPathRelative), {flags: 'a'})

  const signal = createSignalContext({
    ctx,
    stream,
    mapper: normaliseSignal,
  })

  return {ctx, signal}
}
