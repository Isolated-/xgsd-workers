export enum WorkerErrorCode {
  // thrown when limits exceeded (ttl/memory)
  CODE_WORKER_GUARD = 'CODE_WORKER_GUARD',

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

export type WorkerConfig = {
  entry: string
  dist?: string
  bundler?: {
    enabled?: boolean
    cache?: {
      strategy: 'never'
    }
  }
  http?: {
    enabled?: boolean
  }
  limits?: {
    ttl?: number
    memory?: number
  }
}

export type WorkerContext<T = unknown> = WorkerConfig & {
  id?: string
  data: T
  cwd: string
  result?: any
  error?: any
  code?: number
  env?: Record<string, any>
  pid?: number
}
