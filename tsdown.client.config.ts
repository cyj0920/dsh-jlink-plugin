import { defineConfig } from 'tsdown'

/** Client-only build: CJS so the web-shell wrapper can inject the factory(require) shape. */
export default defineConfig({
  entry: {
    'client.raw': 'src/client/index.ts',
  },
  format: ['cjs'],
  dts: true,
  outDir: 'lib',
  clean: false,
  platform: 'node',
  deps: {
    neverBundle: [/^@deepseek-ai\//, /^react$/, /^react\/jsx-runtime$/],
    alwaysBundle: ['zod'],
  },
})
