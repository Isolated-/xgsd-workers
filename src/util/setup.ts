import {DEFAULTS} from '../constants.js'
import {createSignalContext, createSignalLogger} from '../core/signal.js'
import {Activation, Context, WorkerOutputMode, WorkerOutputOpts} from '../core/types.js'
import {randomBytes, randomUUID} from 'crypto'
import {normaliseActivation, normaliseSignal} from './format.js'
import {CreateTransportOpts, version} from '../index.js'
import {StreamLike} from '../types/stream-like.type.js'
import path from 'path'
import {ContractVersion} from '../types/result.types.js'
import {pathExistsSync} from './fs.js'

export const compactId = (prefix: string = 'ctx') => `${prefix}_${randomBytes(6).toString('hex')}`

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

function createContextFromOpts(opts?: CreateTransportOpts, activation?: Activation<any>): Context<any> {
  const contextId = compactId('ctx')

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

export function createContextForActivation<T>(opts: {
  ctx: Context<T>
  activation: T | Activation<any>
  logger: any
}): Context<T> {
  const {ctx, activation, logger} = opts
  const normalised = normaliseActivation(activation)
  normalised.id = createActivationId({contractVersion: ctx.contractVersion, id: normalised.id, logger})

  return {
    ...ctx,
    data: normalised.data ?? ctx.data,
    env: normalised.env ?? ctx.env,
    activationId: normalised.id,
    meta: {
      ...ctx.meta,
      cwd: normalised.cwd ?? ctx.meta.cwd,
    },
  }
}

export function completeWorkerSetup(opts: CreateTransportOpts<any>, stream: StreamLike) {
  const ctx = createContextFromOpts(opts)

  const signal = createSignalContext({ctx, stream})
  const logger = createSignalLogger(signal)

  function setActivationId(id: string) {
    ctx.activationId = id
    signal.setId(id)
  }

  return {ctx, setActivationId, logger}
}

export function createStream(stream?: 'none' | StreamLike) {
  if (!stream) {
    return process.stdout
  }

  const noop = {
    write: () => {},
  }

  return stream === 'none' ? noop : stream
}

export function createActivationId(opts: {contractVersion: ContractVersion; id?: string; logger: any}): string {
  const {contractVersion, id, logger} = opts
  if (contractVersion === 'v1') {
    return id ?? compactId('act')
  }

  const actId = compactId('act')
  if (contractVersion === 'v1.1' && id) {
    // produce warning
    logger.warn(`providing an id at activation is unsupported by v1.1`, {tag: 'depreciation'})
    return actId
  }

  return actId
}

type ActivationRecordOpts = {
  logger: any
  version: string
}

// move these
export const activationRecord = (opts: ActivationRecordOpts) => {
  const {logger, version} = opts

  return {
    success: (duration: number, message?: string) => {
      let msg = message ?? `activation completed in ${duration} ms`

      logger.activation(msg, {
        version,
        ok: true,
        error: null,
        duration,
      })
    },

    error: (error: string, duration: number, message?: string) => {
      let msg = message ?? `activation failed with ${error}`

      logger.activation(msg, {
        version,
        ok: false,
        error,
        duration,
      })
    },
  }
}

export function assertEntryFile(entryFile: string, contractVersion?: ContractVersion): boolean {
  // in v1 entry file is asserted inside the process
  // this is very in-efficient but provides perfect isolation
  if (contractVersion === 'v1') {
    return true
  }

  // v1.1 introduces a check *before* run starts
  return pathExistsSync(entryFile)
}
