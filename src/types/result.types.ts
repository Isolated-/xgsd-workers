import {WorkerOutputMode} from '../core/types.js'
import {WorkerError} from './error.types.js'

export type BaseResult<T> = {
  duration: number
}

type ResultCore<T> = {ok: true; result: T; error: null} | {ok: false; result: null; error: WorkerError | null}

export type ResultMetaV1 = {
  version: 'v1'
  code?: number
}

export type ResultMetaV11 = {
  activationId: string
  version: 'v1.1'
}

export type ApiVersion = 'v1' | 'v1.1'

export type WorkerResult<T> =
  | (BaseResult<T> & ResultMetaV1 & ResultCore<T>)
  | (BaseResult<T> & ResultMetaV11 & ResultCore<T>)

export type TransportResult<Mode extends WorkerOutputMode, T = unknown> = Mode extends 'raw' ? T : WorkerResult<T>
