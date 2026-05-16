import {DEFAULTS, SUPPORTED_VERSIONS} from '../constants.js'
import {Activation} from '../core/types.js'
import {WorkerError, WorkerErrorCode} from '../types/error.types.js'
import {ContractVersion, TransportResult, WorkerResult} from '../types/result.types.js'
import {Signal} from '../types/signal.types.js'

export function normaliseKeys(value: any): any {
  if (Array.isArray(value)) {
    return value.map(normaliseKeys)
  }

  if (value && typeof value === 'object' && value.constructor === Object) {
    const sorted: Record<string, any> = {}

    for (const key of Object.keys(value).sort()) {
      sorted[key] = normaliseKeys(value[key])
    }

    return sorted
  }

  return value
}

export function formatWrappedTransportResult(res: TransportResult<'wrapped'>): TransportResult<'wrapped'> {
  const {version, result, error, duration} = res

  const ok = !error

  if (version === 'v1.1') {
    const {activationId} = res

    return {activationId, version, ok, result, error, duration} as TransportResult<'wrapped'>
  }

  return {version, ok, result, error, duration} as TransportResult<'wrapped'>
}

export function formatWorkerResult(opts: {result?: any; error?: any; duration: number}): WorkerResult<any> {
  return {
    version: 'v1',
    ok: !opts.error,
    result: opts.result ?? null,
    error: opts.error ?? null,
    duration: opts.duration,
  }
}

export function normaliseSignal<T extends Record<string, unknown>>(signal: Signal<T>): Signal<T> {
  return {
    ctx: signal.ctx,
    act: signal.act,
    pid: signal.pid,
    type: signal.type,
    message: signal.message,
    meta: signal.meta,
    timestamp: signal.timestamp,
  }
}

type WorkerErrorOpts = {
  code?: WorkerErrorCode
  name?: string
  type?: 'user' | 'system' | 'unknown'
  hint?: string
  stack?: string
}

export function normaliseWorkerError(err: WorkerError): WorkerError {
  return {
    code: err.code,
    type: err.type,
    name: err.name,
    message: err.message,
    isWorkerError: err.isWorkerError,
    stack: err.stack,
    hint: err.hint,
  }
}

export function workerError(message: string, opts: WorkerErrorOpts = {}) {
  const errorData = {...DEFAULTS.error, ...opts, message, isWorkerError: true}
  return normaliseWorkerError(errorData)
}

export function normaliseActivation<T>(input: T | Activation<T>): Activation<T> {
  if (isActivation(input)) {
    return input as Activation<T>
  }

  return {
    data: input as T,
  }
}

export function isActivation<T = unknown>(input: unknown): input is Activation<T> {
  if (input === null || typeof input !== 'object') {
    return false
  }

  return 'data' in input || 'env' in input || 'id' in input || 'cwd' in input
}

export function isSupportedVersion(version: unknown) {
  if (typeof version !== 'string') {
    return false
  }

  let contractVersion = version.trim().toLowerCase()

  if (!contractVersion.startsWith('v')) {
    contractVersion = 'v' + contractVersion
  }

  return SUPPORTED_VERSIONS.includes(contractVersion)
}
