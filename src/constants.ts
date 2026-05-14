import {WorkerOutputMode} from './core/types.js'

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
}
