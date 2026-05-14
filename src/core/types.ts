import {WorkerError, WorkerErrorCode} from '../types/error.types.js'

export type RunFn<T, R = T> = (data: T) => Promise<T>

export enum ExitCode {
  CODE_DETACHED_PROCESS = 10,
}

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

export type GuardErrorBehaviour = Exclude<ErrorBehaviour, 'warn' | 'drop'>

export type WorkerGuardOpts = {
  ttl: number
  memory: MemoryType | number

  /**
   * Determines what happens when
   * a worker guard suspends a process.
   *
   * @since v1.0.3
   */
  onError?: Exclude<ErrorBehaviour, 'drop'>
}

export type WorkerOutputOpts = {
  mode: WorkerOutputMode

  /**
   * Determines what happens when
   * a returned data is not serialisable.
   *
   * @since v1.0.3
   */
  onError?: ErrorBehaviour
}

export type ErrorBehaviour = undefined | 'throw' | 'drop'

export type ContextMetadata = {
  version: string
  /**
   *  @note every signal should have a pid
   *  this allows for detection of hanging processes
   */
  pid?: number
  entry: string
  cwd: string
  limits: WorkerGuardOpts
  output: WorkerOutputOpts
}

export type Context<T = unknown, E = any> = {
  id: string
  data: T | null
  env: Record<string, any> | null
  // define this
  execute?: (fn: RunFn<T>) => Promise<any>
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

//export type ActivationHandler = <O = unknown, I = unknown>(activation?: Activation<I>) => Promise<WorkerResult<O>>
export type ActivationHandler<Mode extends WorkerOutputMode = 'wrapped'> = <T = any>(
  activation?: Activation<T>,
) => Promise<TransportResult<Mode, T>>

export type TransportResult<Mode extends WorkerOutputMode, T = unknown> = Mode extends 'raw' ? T : WorkerResult<T>

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
