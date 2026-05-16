import {WorkerErrorCode} from './error.types.js'

/**
 *  A **Signal** is used to communicate internal worker state or to provide traces.
 */
export type SignalType = 'log' | 'error' | 'activation' | 'system' | 'generic' | 'warn' | 'metric'

export type Signal<T extends Record<string, unknown>> = {
  ctx: string
  act: string
  pid?: number
  type: SignalType
  message: string
  timestamp: number
  meta?: T | null
}

export type GenericSignal = {
  tag?: string
  [key: string]: unknown
}

export type ErrorSignal = GenericSignal & {
  guard?: boolean
  code?: WorkerErrorCode
}

export type MetricSignal = GenericSignal
export type LogSignal = GenericSignal
export type SystemSignal = GenericSignal

export type ActivationSignal = GenericSignal & {
  message?: string
  ok: boolean
  error?: string | null
  version: string
  duration: number
}
