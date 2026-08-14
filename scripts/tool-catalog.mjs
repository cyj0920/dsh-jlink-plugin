// Final tool-catalog verification: boot apply() from the BUILT artifact and print the 23 tools.
import { Context } from '@deepseek-ai/cordis'
import { apply, Config } from '../lib/index.mjs'

const ctx = new Context()
const registered = []
ctx.tools = { register: (def) => { registered.push(def) } }
ctx.typert = { register: (c) => {} }
apply(ctx, Config.parse({ driver: 'mock' }))

console.log('tool count:', registered.length)
console.log('')
for (const t of registered) {
  const params = t.parameters?.properties ? Object.keys(t.parameters.properties).join(', ') : '(无参数)'
  const required = t.parameters?.required?.length ? ' [必填: ' + t.parameters.required.join(', ') + ']' : ''
  const timeout = t.timeoutMs ? ' · timeout=' + t.timeoutMs + 'ms' : ''
  const out = t.output?.schema?.properties ? Object.keys(t.output.schema.properties).join('/') : '(无输出声明)'
  console.log('  ' + t.name + '  <' + params + '>' + required + timeout + ' · output: ' + out)
}
