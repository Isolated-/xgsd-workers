import {Signal, WorkerResult} from '../core/types'

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
    type: signal.type,
    message: signal.message,
    meta: signal.meta,
    timestamp: signal.timestamp,
  }
}
