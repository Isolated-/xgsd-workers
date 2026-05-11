import {defineConfig} from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'process/workers.process': 'src/process/workers.process.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  external: ['jest', '@xgsd/runtime/process/workers.process'],
})
