import {WorkerOutputMode} from './core/types.js'

export const DEFAULTS = {
  limits: {
    ttl: 5000,
    memory: 64,
  },
  bundler: {
    enabled: false,
  },
  output: {
    mode: 'wrapped' as WorkerOutputMode,
  },
  signalPathRelative: 'signals.jsonl',
  distPathRelative: '.xgsd',
  entryFileRelative: 'worker.js',
} as const
