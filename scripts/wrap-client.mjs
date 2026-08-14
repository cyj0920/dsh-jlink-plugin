// Wrap the tsdown-built client bundle (CJS) into the DSH web shell module-loader format.
// The shell registers client bundles via window.__ModuleLoader__.load({ id, factory(require) }).
import { readFile, writeFile, rename } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const id = '@can/dsh-jlink'
const rawPath = resolve(root, 'lib/client.raw.cjs')
const outPath = resolve(root, 'lib/client.js')
const rawDts = resolve(root, 'lib/client.raw.d.mts')
const rawDtsCts = resolve(root, 'lib/client.raw.d.cts')
const outDts = resolve(root, 'lib/client.d.mts')
const outDtsCts = resolve(root, 'lib/client.d.cts')

let raw = await readFile(rawPath, 'utf8')
raw = raw.replace(/\n?\/\/# sourceMappingURL=.*$/, '')

const wrapped = `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(id)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${raw}
\t\treturn module.exports;
\t}
});
`

await writeFile(outPath, wrapped)
try { await rename(rawDts, outDts) } catch { /* try cts */ }
try { await rename(rawDtsCts, outDtsCts) } catch { /* no cts dts */ }
console.log('wrapped client bundle ->', outPath, wrapped.length, 'bytes')
