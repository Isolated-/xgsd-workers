import {DEFAULTS} from '../constants.js'

/**
 * Error codes used across the worker/runtime boundary.
 *
 * These codes are **serialisable** and are used to classify failures
 * in a consistent way across processes, streams, and transport layers.
 *
 * They are intended for:
 * - Cross-process error handling
 * - Structured logging / observability
 * - Debugging runtime failures
 */
export enum WorkerErrorCode {
  /**
   * ## Worker aborted
   *
   * Thrown when user forces process to exit (CTRL+C)
   */
  CODE_WORKER_ABORTED = 'CODE_WORKER_ABORTED',

  /**
   * ## Guard Violation
   *
   * Thrown when execution safety limits are exceeded.
   *
   * ### Typical causes:
   * - TTL (time-to-live) exceeded
   * - Memory limit breached
   * - Runtime guard rails triggered
   */
  CODE_WORKER_GUARD = 'CODE_WORKER_GUARD',

  /**
   * ## Fatal Error
   *
   * A **non-recoverable** internal runtime error.
   *
   * Execution cannot safely continue after this is thrown.
   */
  CODE_FATAL_ERROR = 'CODE_FATAL_ERROR',

  /**
   * ## Invalid Entry File
   *
   * The entry file cannot be resolved, loaded, or parsed.
   *
   * ### Common causes:
   * - File does not exist (pre-v1.1)
   * - Syntax error in module
   * - Unsupported module format (CJS/ESM mismatch)
   */
  CODE_INVALID_ENTRY_FILE = 'CODE_INVALID_ENTRY_FILE',

  /**
   * ## Missing Entry File
   *
   * The entry file path does not exist.
   *
   * This is checked before the container starts (since **v1.1**).
   *
   * ### Common causes:
   * - File does not exist (post-v1.1)
   */
  CODE_NO_ENTRY_FILE = 'CODE_NO_ENTRY_FILE',

  /**
   * ## Invalid Default Export
   *
   * The module `default` export is not a function.
   *
   * ### Expected:
   * ```ts
   * export default async (data) => {}
   * ```
   *
   * ### Invalid examples:
   * - Object export
   * - `null` or `undefined`
   * - Primitive values
   */
  CODE_INVALID_DEFAULT_FUNCTION = 'CODE_INVALID_DEFAULT_FUNCTION',

  /**
   * ## Invalid Middleware Function
   *
   * Middleware provided is not a valid function.
   *
   * ### Causes:
   * - Non-callable middleware
   * - Incorrect plugin shape
   */
  CODE_INVALID_MIDDLEWARE_FUNCTION = 'CODE_INVALID_MIDDLEWARE_FUNCTION',

  /**
   * ## Invalid Data
   *
   * Data cannot be safely serialised for transport.
   *
   * ### Common causes:
   * - Circular references
   * - Non-serialisable values (e.g. `BigInt`, functions)
   * - Structured clone incompatibility
   */
  CODE_INVALID_DATA = 'CODE_INVALID_DATA',

  CODE_UNSUPPORTED_VERSION = 'CODE_UNSUPPORTED_VERSION',
}

export type WorkerErrorType = 'user' | 'system' | 'unknown'
export type WorkerError = {
  code?: WorkerErrorCode
  name?: string
  message: string
  hint?: string
  stack?: string
  type?: WorkerErrorType
  isWorkerError?: boolean
}

export function isWorkerError(input: unknown): input is WorkerError {
  if (!input || typeof input !== 'object') {
    return false
  }

  return 'isWorkerError' in input && input.isWorkerError === true
}

export class WorkerException extends Error {
  private static fromWorkerError(input: WorkerError) {
    return new WorkerException(input)
  }

  private static fromError(input: Error) {
    return new WorkerException({
      code: WorkerErrorCode.CODE_FATAL_ERROR,
      name: input.name ?? 'unknown',
      message: input.message ?? 'unknown',
      stack: input.stack,
      hint: 'not a WorkerError, check logs/stack',
      isWorkerError: false,
    })
  }

  static from(input: unknown) {
    if (isWorkerError(input)) {
      return WorkerException.fromWorkerError(input)
    }

    if (input instanceof Error) {
      return WorkerException.fromError(input)
    }

    throw new Error('unsupported error type')
  }

  public code: string
  public type: 'user' | 'system' | 'unknown'
  public hint?: string
  public isWorkerError: boolean

  constructor(error: WorkerError) {
    super(error.message)

    this.code = error.code!
    this.type = error.type!
    this.name = 'WorkerException'
    this.stack = error.stack
    this.hint = error.hint
    this.isWorkerError = isWorkerError(error)
  }
}
