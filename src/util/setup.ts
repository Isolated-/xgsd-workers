import {DEFAULTS} from '../constants.js'
import {createSignalContext, createSignalLogger} from '../core/signal.js'
import {Activation, Context, WorkerOutputMode, WorkerOutputOpts} from '../core/types.js'
import {randomBytes, randomUUID} from 'crypto'
import {normaliseSignal} from './format.js'
import {CreateTransportOpts, version} from '../index.js'
import {StreamLike} from '../types/stream-like.type.js'
import path from 'path'

type SetupOpts = {
  id?: string
  activationId?: string
  data?: Record<string, any> | null
  env?: Record<string, any>
  stream?: StreamLike
  config?: CreateTransportOpts
}

export const compact = (prefix: string = 'ctx') => `${prefix}_${randomBytes(6).toString('hex')}`

function outputOptionStringToOpts(output?: WorkerOutputMode | WorkerOutputOpts): WorkerOutputOpts {
  if (!output) {
    return {
      mode: DEFAULTS.output.mode,
      onError: undefined,
    }
  }

  const mode = typeof output === 'string' ? output : output.mode
  const onError = typeof output === 'string' ? undefined : output.onError

  return {mode, onError}
}

function createContextForActivation(opts?: CreateTransportOpts, activation?: Activation<any>): Context<any> {
  const contextId = compact('ctx')

  const entry = path.resolve(opts?.entry ?? DEFAULTS.entryFileRelative)
  const cwd = path.dirname(entry)

  const output = outputOptionStringToOpts(opts?.output as WorkerOutputOpts)
  const contractVersion = opts?.contractVersion ?? DEFAULTS.defaultContractVersion

  const ctx = {
    id: contextId,
    contextId,
    activationId: activation?.id ?? 'none',
    contractVersion,
    data: activation?.data ?? null,
    env: opts?.env ?? activation?.env ?? null,
    state: {},
    error: null,
    result: null,
    meta: {
      cwd,
      entry,
      version,
      limits: Object.assign({}, DEFAULTS.limits, opts?.limits),
      output,
    },
  }

  return ctx
}

export function completeWorkerSetup(opts: CreateTransportOpts<any>, stream: StreamLike) {
  const ctx = createContextForActivation(opts)

  const signal = createSignalContext({ctx, stream})
  const logger = createSignalLogger(signal)

  function setActivationId(id: string) {
    ctx.activationId = id
    signal.setId(id)
  }

  return {ctx, setActivationId, logger}
}
