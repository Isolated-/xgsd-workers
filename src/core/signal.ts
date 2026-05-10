import {ActivationSignal, Context, ErrorSignal, LogSignal, Signal, SystemSignal} from './types.js'
import {Writable} from 'stream'

type EmitOpts<T extends Record<string, unknown>> =
  | {type: 'generic'; message: string; meta?: T}
  | {type: 'activation'; message: string; meta: ActivationSignal}
  | {type: 'log'; message: string; meta?: LogSignal}
  | {type: 'system'; message: string; meta?: SystemSignal}
  | {type: 'error'; message: string; meta?: ErrorSignal}

export const DEFAULT_SIGNAL_FILE_NAME = 'signals.jsonl' as const

// keep this off public API
export type SignalContext = {
  emit: <T extends Record<string, unknown>>(signal: EmitOpts<T>) => void
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
