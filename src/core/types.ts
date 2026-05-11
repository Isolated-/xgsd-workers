/**
 *  WORKER ERROR TYPES
 */

export enum WorkerErrorCode {
  // thrown when limits exceeded (ttl/memory)
  CODE_WORKER_GUARD = 'CODE_WORKER_GUARD',

  CODE_INVALID_CONFIG = 'CODE_INVALID_CONFIG',

  // thrown when entry file is invalid/cannot be parsed
  CODE_INVALID_ENTRY_FILE = 'CODE_INVALID_ENTRY_FILE',

  // thrown when default is not a function
  CODE_INVALID_DEFAULT_FUNCTION = 'CODE_INVALID_DEFAULT_FUNCTION',

  CODE_INVALID_MIDDLEWARE_FUNCTION = 'CODE_INVALID_MIDDLEWARE_FUNCTION',

  // thrown when bundling fails
  CODE_BUNDLE_ERROR = 'CODE_BUNDLE_ERROR',
}

export type WorkerErrorType = 'user' | 'system' | 'unknown'
export type WorkerError = {
  code?: WorkerErrorCode
  message?: string
  type?: WorkerErrorType
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

export type WorkerConfig = {
  entry: string
  dist?: string
  bundler?: {
    enabled?: boolean
    cache?: WorkerConfigCache
  }
  http?: {
    cache?: WorkerConfigCache
  }
  limits?: {
    ttl?: number
    memory?: number
  }
  output?: {
    mode?: 'raw' | 'wrapped' | 'auto' // support more types
  }
}

export type WorkerConfigCacheStrategy = 'always' | 'change' | 'never'
export type WorkerConfigCache = {
  strategy?: WorkerConfigCacheStrategy
}

export type WorkerOutputMode = 'raw' | 'wrapped' | 'auto'

/**
 *  CONTEXT TYPES
 */

export type ContextMetadata = {
  version: string
  pid?: number
  entry: string
  dist: string
  cwd: string
  limits: {
    ttl: number
    memory: number
  }
  bundler: {
    enabled: boolean
    cache?: WorkerConfigCache
  }
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
  meta: ContextMetadata
}

/**
 *  ACTIVATION TYPES
 */

export type Activation<T = unknown> = {
  id?: string
  data?: T
  env?: Record<string, unknown>
  cwd: string
}

export type ActivationHandler = <T = unknown>(activation: Activation<T>) => Promise<WorkerResult<T>>

/**
 *  SIGNAL TYPES
 */

/**
 *  A **Signal** is used to communicate internal worker state or to provide traces.
 */
export type SignalType = 'log' | 'error' | 'activation' | 'system' | 'generic' | 'warn'

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

export type LogSignal = GenericSignal
export type SystemSignal = GenericSignal

export type ActivationSignal = GenericSignal & {
  message?: string
  ok: boolean
  error?: string | null
  version: string
  duration: number
}
