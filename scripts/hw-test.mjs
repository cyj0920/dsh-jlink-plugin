// Hardware smoke test: drive python/driver.py over ndjson RPC (standalone, no DSH needed).
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const PY = 'C:\\1.Projects\\Can\\jlink_mcp\\.venv\\Scripts\\python.exe'
const DRIVER = fileURLToPath(new URL('../python/driver.py', import.meta.url))

const child = spawn(PY, ['-u', DRIVER], { stdio: ['pipe', 'pipe', 'pipe'] })
const pending = new Map()
let seq = 0

const rl = createInterface({ input: child.stdout })
rl.on('line', (line) => {
  if (!line.trim()) return
  let frame
  try { frame = JSON.parse(line) } catch { console.log('[bad frame]', line.slice(0, 120)); return }
  if (frame.event) { console.log('[event]', JSON.stringify(frame)); return }
  if (typeof frame.id === 'number' && pending.has(frame.id)) {
    pending.get(frame.id)(frame)
    pending.delete(frame.id)
  }
})
child.stderr.on('data', (d) => process.stderr.write('[py:err] ' + d))

function rpc(method, params = {}, timeoutMs = 25000) {
  const id = ++seq
  return new Promise((resolve) => {
    const t = setTimeout(() => { pending.delete(id); resolve({ id, error: { code: 'TIMEOUT', message: method + ' timed out' } }) }, timeoutMs)
    pending.set(id, (frame) => { clearTimeout(t); resolve(frame) })
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n')
  })
}

async function step(label, method, params = {}) {
  const r = await rpc(method, params)
  const ok = r.error == null
  const brief = ok ? JSON.stringify(r.result).slice(0, 260) : JSON.stringify(r.error)
  console.log((ok ? '  OK  ' : ' FAIL ') + label + ' -> ' + brief)
  return r
}

console.log('spawning:', PY)
await new Promise((r) => setTimeout(r, 1500))
await step('list_devices', 'list_devices')
await step('connect (JTAG + FC7300F4MDDxXxxxT1C, driver falls back to Cortex-M4)', 'connect', { interfaceKind: 'JTAG', chip: 'FC7300F4MDDxXxxxT1C' })
await step('get_cpu_state', 'get_cpu_state')
await step('halt', 'halt')
await step('get_cpu_state after halt', 'get_cpu_state')
await step('read_registers', 'read_registers', { names: ['R0', 'R1', 'R12', 'SP', 'LR', 'PC', 'XPSR'] })
await step('read_memory 32B @0x20000000', 'read_memory', { address: 0x20000000, length: 32 })
await step('write_memory 4B', 'write_memory', { address: 0x20000000, data: 'aabbccdd' })
await step('read_memory back 4B', 'read_memory', { address: 0x20000000, length: 4 })
await step('set_breakpoint @0x08000000', 'set_breakpoint', { address: 0x08000000 })
await step('clear_breakpoint', 'clear_breakpoint', { address: 0x08000000 })
await step('rtt_start', 'rtt_start', { bufSize: 1024 })
await step('rtt_read', 'rtt_read', { since: 0 })
await step('rtt_stop', 'rtt_stop')
await step('run', 'run')
await step('get_cpu_state after run', 'get_cpu_state')
await step('disconnect', 'disconnect')
child.stdin.end()
setTimeout(() => { child.kill(); process.exit(0) }, 1500)
