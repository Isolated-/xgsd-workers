import {StreamLike} from '../types/stream-like.type.js'
import {
  ActivationSignal,
  ErrorSignal,
  GenericSignal,
  MetricSignal,
  Signal,
  SystemSignal,
  LogSignal,
} from '../types/signal.types.js'
import {Context} from './types.js'

type EmitOpts<T extends Record<string, unknown>> =
  | {pid?: number; type: 'generic'; message: string; meta?: T}
  | {pid?: number; type: 'activation'; message: string; meta: ActivationSignal}
  | {pid?: number; type: 'log'; message: string; meta?: LogSignal}
  | {pid?: number; type: 'warn'; message: string; meta?: LogSignal}
  | {pid?: number; type: 'system'; message: string; meta?: SystemSignal}
  | {pid?: number; type: 'error'; message: string; meta?: ErrorSignal}
  | {pid?: number; type: 'metric'; message: string; meta?: MetricSignal}

export const DEFAULT_SIGNAL_FILE_NAME = 'signals.jsonl' as const

// keep this off public API
export type SignalContext = {
  setId: (id: string) => void
  emit: <T extends Record<string, unknown>>(signal: EmitOpts<T>) => void
}

export function createSignalLogger(signal: SignalContext) {
  function wrapper(type: any, message: string, meta?: Record<string, unknown>) {
    signal.emit({
      type,
      message,
      meta,
    })
  }
  return {
    log: (message: string, meta?: LogSignal) => {
      wrapper('log', message, meta)
    },
    error: (message: string, meta?: ErrorSignal) => {
      wrapper('error', message, meta)
    },
    warn: (message: string, meta?: LogSignal) => {
      wrapper('warn', message, meta)
    },
    activation: (message: string, meta?: ActivationSignal) => {
      wrapper('activation', message, meta)
    },
    generic: (message: string, meta?: GenericSignal) => {
      wrapper('generic', message, meta)
    },
    system: (message: string, meta?: SystemSignal) => {
      wrapper('system', message, meta)
    },
    metric: (meta: MetricSignal) => {
      wrapper('metric', `metric`, meta)
    },
  }
}

export function createSignalContext(opts: {
  ctx: Context
  stream: StreamLike
  mapper?: (input: Signal<any>) => Signal<any>
}): SignalContext {
  const {ctx, stream, mapper} = opts

  let id = ctx?.activationId ?? 'unknown'

  return {
    setId: (newId: string) => {
      id = newId
    },
    emit<T extends Record<string, unknown>>(signal: EmitOpts<T>) {
      const e: Signal<T> = {
        ctx: ctx?.id ?? 'unknown',
        act: id,
        pid: signal.pid ?? process.pid,
        timestamp: Date.now(),
        type: signal.type,
        message: signal.message,
        meta: (signal.meta as T) ?? null,
      }

      const payload: Signal<T> = mapper?.(e) ?? e
      stream.write(JSON.stringify(payload) + '\n')
    },
  }
}
