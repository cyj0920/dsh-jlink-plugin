// Flash trio hardware test (standalone RPC, no DSH needed).
//
// Modes:
//   node scripts/hw-flash-test.mjs            -> --check  (READ-ONLY, safe)
//   node scripts/hw-flash-test.mjs --wipe     -> destructive round trip:
//        backup full flash -> chip erase -> blank check -> program pattern
//        -> verify -> restore original image -> verify restore
//
// Target default: STM32F103ZE (512K flash @0x08000000) over SWD.
// Close J-Link Commander / J-Flash first — one host process per probe.
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const PY = 'C:\\1.Projects\\Can\\jlink_mcp\\.venv\\Scripts\\python.exe'
const DRIVER = fileURLToPath(new URL('../python/driver.py', import.meta.url))
const SERIAL = process.env.JLINK_SERIAL ?? '941000024'
const FLASH_BASE = 0x08000000
const FLASH_SIZE = 512 * 1024 // STM32F103ZE high-density
const WIPE = process.argv.includes('--wipe')

const child = spawn(PY, ['-u', DRIVER], { stdio: ['pipe', 'pipe', 'pipe'] })
const pending = new Map()
let seq = 0

const rl = createInterface({ input: child.stdout })
rl.on('line', (line) => {
  if (!line.trim()) return
  let frame
  try { frame = JSON.parse(line) } catch { console.log('[bad frame]', line.slice(0, 120)); return }
  if (frame.event === 'flash_progress') {
    console.log('  [progress]', JSON.stringify(frame.data))
    return
  }
  if (typeof frame.id === 'number' && pending.has(frame.id)) {
    pending.get(frame.id)(frame)
    pending.delete(frame.id)
  }
})
child.stderr.on('data', (d) => process.stderr.write('[py:err] ' + d))

function rpc(method, params = {}, timeoutMs = 120000) {
  const id = ++seq
  return new Promise((resolve) => {
    const t = setTimeout(() => { pending.delete(id); resolve({ id, error: { code: 'TIMEOUT', message: method + ' timed out' } }) }, timeoutMs)
    pending.set(id, (frame) => { clearTimeout(t); resolve(frame) })
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n')
  })
}

let failed = 0
async function step(label, method, params = {}, { expectFail = false } = {}) {
  const r = await rpc(method, params)
  const ok = expectFail ? r.error != null : r.error == null
  if (!ok) failed++
  const brief = r.error != null ? JSON.stringify(r.error) : JSON.stringify(r.result).slice(0, 200)
  console.log((ok ? '  OK  ' : ' FAIL ') + label + ' -> ' + brief)
  return r
}

console.log('spawning:', PY, '(S/N ' + SERIAL + ', mode: ' + (WIPE ? 'WIPE round trip' : 'read-only check') + ')')
await new Promise((r) => setTimeout(r, 1500))

await step('connect', 'connect', { interfaceKind: 'SWD', chip: 'STM32F103ZE', serial: SERIAL })
await step('halt', 'halt')

if (!WIPE) {
  // --check: read-only. Read 16 bytes, then verify_flash must accept them and reject tampered ones.
  const rd = await rpc('read_memory', { address: FLASH_BASE, length: 16 })
  if (rd.error != null) { console.log(' FAIL read_memory -> ' + JSON.stringify(rd.error)); process.exit(1) }
  const hex = rd.result.bytes
  console.log('  read 16B @0x08000000 -> ' + hex)
  await step('verify_flash exact bytes (expect pass)', 'verify_flash', { address: FLASH_BASE, data: hex })
  const bad = (hex === '00'.repeat(16)) ? 'ff'.repeat(16) : '00'.repeat(16)
  await step('verify_flash tampered bytes (expect JLINK_VERIFY_FAILED)', 'verify_flash', { address: FLASH_BASE, data: bad }, { expectFail: true })
} else {
  // --wipe: destructive round trip with backup + restore.
  console.log('  backing up ' + FLASH_SIZE / 1024 + ' KB in 64K chunks ...')
  const t0 = Date.now()
  let image = ''
  const CHUNK = 64 * 1024 // driver read_memory cap
  for (let off = 0; off < FLASH_SIZE; off += CHUNK) {
    const bak = await rpc('read_memory', { address: FLASH_BASE + off, length: CHUNK }, 300000)
    if (bak.error != null) { console.log(' FAIL backup @+' + off + ' -> ' + JSON.stringify(bak.error)); process.exit(1) }
    image += bak.result.bytes
    console.log('  backup chunk @0x' + (FLASH_BASE + off).toString(16) + ' done (' + image.length / 2 + ' bytes)')
  }
  console.log('  backup done: ' + (image.length / 2) + ' bytes in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's')

  await step('erase_flash (FULL CHIP)', 'erase_flash', { start: FLASH_BASE, end: FLASH_BASE + FLASH_SIZE })
  await step('blank check after erase', 'verify_flash', { address: FLASH_BASE, data: 'ff'.repeat(256) })

  // Program an identifiable pattern into the LAST 256 bytes (least likely to matter if restore fails).
  const patAddr = FLASH_BASE + FLASH_SIZE - 256
  const pattern = Array.from({ length: 256 }, (_, i) => ((i * 7 + 0x5a) & 0xff).toString(16).padStart(2, '0')).join('')
  await step('program_flash pattern @last 256B (verify on)', 'program_flash', { address: patAddr, data: pattern, verify: true })
  await step('verify_flash pattern', 'verify_flash', { address: patAddr, data: pattern })
  await step('program_flash pattern again with verify OFF', 'program_flash', { address: patAddr, data: pattern, verify: false })

  console.log('  restoring original image ...')
  const t1 = Date.now()
  await step('program_flash restore full image (verify on)', 'program_flash', { address: FLASH_BASE, data: image, verify: true })
  console.log('  restore done in ' + ((Date.now() - t1) / 1000).toFixed(1) + 's')
  await step('verify_flash restored first 4KB', 'verify_flash', { address: FLASH_BASE, data: image.slice(0, 8192) })
}

await step('reset (halts after reset)', 'reset')
await step('run', 'run')
await step('disconnect', 'disconnect')
child.stdin.end()
setTimeout(() => { child.kill(); process.exit(failed ? 1 : 0) }, 1500)
