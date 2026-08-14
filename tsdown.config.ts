import { defineConfig } from 'tsdown'

/** Build plan: host entry + shared types + remote artifact (ESM). */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    types: 'src/types.ts',
    remote: 'src/remote-spec.ts',
  },
  format: ['esm'],
  dts: true,
  outDir: 'lib',
  clean: true,
  platform: 'node',
  deps: {
    neverBundle: [/^@deepseek-ai\//, /^react$/, /^react\/jsx-runtime$/],
  },
})
