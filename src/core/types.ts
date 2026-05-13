import {WorkerError, WorkerErrorCode} from '../types/error.types.js'

/**
 *  WORKER RESULT TYPES
 */

export type WorkerResult<T> =
  | {
      version: 'v1'
      ok: true
      code?: number
      result: T
      error: null
      duration: number
    }
  | {
      version: 'v1'
      ok: false
      code?: number
      result: null
      error: WorkerError
      duration: number
    }

/**
 *  WORKER CONFIG TYPES
 */
export type MemoryType =
  | number
  | {
      limitMB: number
      strategy: 'rss' | 'heap'
    }

export type WorkerOutputMode = 'raw' | 'wrapped' | 'auto'

/**
 *  CONTEXT TYPES
 */

export type WorkerGuardOpts = {
  ttl: number
  memory: MemoryType | number

  /**
   *  @since v1.0.3
   *  throws fatal error vs resolving
   */
  on?: 'throw' | undefined
}

export type ContextMetadata = {
  version: string
  pid?: number
  entry: string
  cwd: string
  limits: WorkerGuardOpts
  output: {
    mode: WorkerOutputMode
  }
}

export type Context<T = unknown, E = any> = {
  id: string
  data: T | null
  env: Record<string, any> | null
  // define this
  execute?: any
  result?: T | null
  error?: E | null
  state?: Record<string, any>
  meta: ContextMetadata
}

/**
 *  ACTIVATION TYPES
 */

export type Activation<T = unknown> = {
  id?: string
  data?: T
  env?: Record<string, unknown>
  cwd?: string
}

export type ActivationHandler = <O = unknown, I = unknown>(activation?: Activation<I>) => Promise<WorkerResult<O>>

/**
 *  SIGNAL TYPES
 */

/**
 *  A **Signal** is used to communicate internal worker state or to provide traces.
 */
export type SignalType = 'log' | 'error' | 'activation' | 'system' | 'generic' | 'warn' | 'metric'

export type Signal<T extends Record<string, unknown>> = {
  ctx: string
  type: SignalType
  message: string
  timestamp: number
  meta?: T | null
}

export type GenericSignal = {
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
