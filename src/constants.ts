import {WorkerOutputMode} from './core/types.js'
import {WorkerErrorCode} from './types/error.types.js'

export const DEFAULTS = {
  limits: {
    ttl: 5000,
    memory: 64,
  },
  output: {
    mode: 'wrapped' as WorkerOutputMode,
  },
  signalPathRelative: 'signals.jsonl',
  distPathRelative: '.xgsd',
  entryFileRelative: 'worker.js',
  // amount of milliseconds before a process
  // is killed vs disconnected (child.kill())
  defaultTerminationTime: 1000,
  defaultErrorCode: WorkerErrorCode.CODE_FATAL_ERROR,

  error: {
    code: WorkerErrorCode.CODE_FATAL_ERROR,
    name: 'WorkerError',
    stack: undefined,
    hint: 'check logs/signals for more info',
    type: 'unknown' as const,
  },
}
