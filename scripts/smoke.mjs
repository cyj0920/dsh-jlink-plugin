// Build artifact smoke test: boots apply() from lib/index.mjs with a real cordis Context.
import { Context } from '@deepseek-ai/cordis'
import { apply, Config, FlagchipPatch } from '../lib/index.mjs'

const ctx = new Context()
const registered = []
const typertCalls = []
ctx.tools = { register: (def) => { registered.push(def.name) } }
ctx.typert = { register: (c) => { typertCalls.push(c.package) } }

const config = Config.parse({ driver: 'mock' })
apply(ctx, config)

console.log('tool count:', registered.length)
console.log('tools:', registered.sort().join(', '))
console.log('typert contributions:', typertCalls.join(', '))
console.log('patches service present:', typeof ctx.get('jlink.patches') !== 'undefined')

// match through the built module's patch
const flag = new FlagchipPatch()
console.log('flagchip devices:', flag.deviceNames.length)
console.log('match FC7300F4MDD ->', flag.matchDeviceName('FC7300F4MDD'))
console.log('match FC7300F4MDDS ->', flag.matchDeviceName('FC7300F4MDDS'))

// config defaults
console.log('config defaults:', JSON.stringify(Config.parse({})))
