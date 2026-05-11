import {ActivationSignal, Context, ErrorSignal, GenericSignal, LogSignal, Signal, SystemSignal} from './types.js'
import {Writable} from 'stream'

type EmitOpts<T extends Record<string, unknown>> =
  | {type: 'generic'; message: string; meta?: T}
  | {type: 'activation'; message: string; meta: ActivationSignal}
  | {type: 'log'; message: string; meta?: LogSignal}
  | {type: 'warn'; message: string; meta?: LogSignal}
  | {type: 'system'; message: string; meta?: SystemSignal}
  | {type: 'error'; message: string; meta?: ErrorSignal}

export const DEFAULT_SIGNAL_FILE_NAME = 'signals.jsonl' as const

// keep this off public API
export type SignalContext = {
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
  }
}

export function createSignalContext(opts: {
  ctx: Context
  stream: Writable
  mapper?: (input: Signal<any>) => Signal<any>
}): SignalContext {
  const {ctx, stream, mapper} = opts

  return {
    emit<T extends Record<string, unknown>>(signal: EmitOpts<T>) {
      const e: Signal<T> = {
        ctx: ctx.id ?? 'unknown',
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
