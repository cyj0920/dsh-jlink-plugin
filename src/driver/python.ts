/** PythonDriver (Phase 3): ndjson JSON-RPC over stdio to python/driver.py / Python 驱动. */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { ErrorCodes } from '../errors'
import { fail, logger, ok } from '../utils'
import type { ConnectOptions, DriverInterface, FlashProgressCallback } from './interface'
import type { CpuStateKind, Envelope, FlashPhase, JlinkDeviceEntry, RttLine, TargetInfoView } from '../types'

interface RpcFrame {
  id?: number
  result?: unknown
  error?: { code?: string; message?: string } | string | null
  event?: string
  data?: unknown
}

const DEFAULT_TIMEOUT_MS = 30000

/** Spawns python/driver.py and speaks line-delimited JSON / 子进程 RPC 驱动. */
export class PythonDriver implements DriverInterface {
  readonly kind = 'python' as const

  private child: ChildProcessWithoutNullStreams | null = null
  private pending = new Map<number, (frame: RpcFrame) => void>()
  private seq = 0
  private progress: FlashProgressCallback | null = null

  constructor(
    private command: string,
    private scriptPath?: string,
  ) {}

  private defaultScriptPath(): string {
    // Runtime is the built lib/index.mjs at <root>/lib, so ../python/driver.py = <root>/python/driver.py.
    // Source layout falls back to ../../python/driver.py (src/driver/*.ts).
    const built = fileURLToPath(new URL('../python/driver.py', import.meta.url))
    const source = fileURLToPath(new URL('../../python/driver.py', import.meta.url))
    try {
      if (existsSync(built)) return built
    } catch {
      /* fall through */
    }
    return source
  }

  private ensureChild(): void {
    if (this.child) return
    const script = this.scriptPath ?? this.defaultScriptPath()
    logger.info('spawning python driver: ' + this.command + ' ' + script)
    const child = spawn(this.command, ['-u', script], { stdio: ['pipe', 'pipe', 'pipe'] })
    this.child = child
    child.on('error', (err) => {
      logger.error('python driver spawn error: ' + err.message)
    })
    child.on('exit', (code) => {
      logger.warn('python driver exited: ' + code)
      this.child = null
      for (const [id, resolve] of this.pending) {
        this.pending.delete(id)
        resolve({ id, error: { code: ErrorCodes.DRIVER, message: 'driver exited (' + code + ')' } })
      }
    })
    const rl = createInterface({ input: child.stdout })
    rl.on('line', (line) => {
      if (!line.trim()) return
      let frame: RpcFrame
      try {
        frame = JSON.parse(line)
      } catch {
        logger.warn('invalid driver frame: ' + line.slice(0, 120))
        return
      }
      if (frame.event === 'flash_progress') {
        const d = (frame.data ?? {}) as { phase?: string; percent?: number; address?: number; length?: number; message?: string }
        this.progress?.(d.phase as FlashPhase, d.percent ?? 0, d.address ?? 0, d.length ?? 0, d.message ?? '')
        return
      }
      if (typeof frame.id === 'number') {
        const resolve = this.pending.get(frame.id)
        if (resolve) {
          this.pending.delete(frame.id)
          resolve(frame)
        }
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      logger.debug('[driver:stderr] ' + chunk.toString().trim().slice(0, 300))
    })
  }

  private rpc<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<Envelope<T>> {
    this.ensureChild()
    const id = ++this.seq
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        resolve(fail('driver rpc timeout: ' + method, ErrorCodes.TIMEOUT))
      }, DEFAULT_TIMEOUT_MS)
      this.pending.set(id, (frame) => {
        clearTimeout(timer)
        if (frame.error != null) {
          const code = typeof frame.error === 'object' && frame.error ? frame.error.code ?? ErrorCodes.DRIVER : ErrorCodes.DRIVER
          const msg = typeof frame.error === 'object' && frame.error ? frame.error.message ?? 'driver error' : String(frame.error)
          resolve(fail(msg, code))
          return
        }
        resolve(ok(frame.result as T))
      })
      this.child?.stdin.write(JSON.stringify({ id, method, params }) + '\n')
    })
  }

  dispose(): void {
    if (this.child) {
      try {
        this.child.stdin.end()
      } catch {
        /* ignore */
      }
      this.child.kill()
      this.child = null
    }
  }

  async listDevices(): Promise<Envelope<JlinkDeviceEntry[]>> {
    return this.rpc('list_devices')
  }

  async connect(opts: ConnectOptions): Promise<Envelope<TargetInfoView>> {
    return this.rpc('connect', {
      interfaceKind: opts.interfaceKind ?? 'JTAG',
      chip: opts.chip,
      serial: opts.serial,
    })
  }

  async disconnect(): Promise<Envelope<null>> {
    return this.rpc<null>('disconnect')
  }

  async halt(): Promise<Envelope<CpuStateKind>> {
    return this.rpc('halt')
  }

  async run(): Promise<Envelope<CpuStateKind>> {
    return this.rpc('run')
  }

  async step(): Promise<Envelope<CpuStateKind>> {
    return this.rpc('step')
  }

  async reset(): Promise<Envelope<null>> {
    return this.rpc<null>('reset')
  }

  async getCpuState(): Promise<Envelope<CpuStateKind>> {
    return this.rpc('get_cpu_state')
  }

  async readMemory(address: number, length: number): Promise<Envelope<Uint8Array>> {
    const res = await this.rpc<{ bytes: string }>('read_memory', { address, length })
    if (!res.success) return { success: false, message: res.message, error: res.error }
    const hex = res.data?.bytes ?? ''
    const bytes = new Uint8Array(Math.floor(hex.length / 2))
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    return ok(bytes)
  }

  async writeMemory(address: number, data: Uint8Array): Promise<Envelope<null>> {
    const hex = Array.from(data, (b) => b.toString(16).padStart(2, '0')).join('')
    return this.rpc<null>('write_memory', { address, data: hex })
  }

  async readRegisters(names?: string[]): Promise<Envelope<Record<string, number>>> {
    return this.rpc('read_registers', { names: names ?? [] })
  }

  async writeRegister(name: string, value: number): Promise<Envelope<null>> {
    return this.rpc<null>('write_register', { name, value })
  }

  async eraseFlash(start: number, end: number): Promise<Envelope<null>> {
    return this.rpc<null>('erase_flash', { start, end })
  }

  async programFlash(address: number, data: Uint8Array, verify: boolean, onProgress?: FlashProgressCallback): Promise<Envelope<null>> {
    this.progress = onProgress ?? null
    const hex = Array.from(data, (b) => b.toString(16).padStart(2, '0')).join('')
    const res = await this.rpc<null>('program_flash', { address, data: hex, verify })
    this.progress = null
    return res
  }

  async verifyFlash(address: number, data: Uint8Array): Promise<Envelope<null>> {
    const hex = Array.from(data, (b) => b.toString(16).padStart(2, '0')).join('')
    return this.rpc<null>('verify_flash', { address, data: hex })
  }

  async setBreakpoint(address: number): Promise<Envelope<null>> {
    return this.rpc<null>('set_breakpoint', { address })
  }

  async clearBreakpoint(address: number): Promise<Envelope<null>> {
    return this.rpc<null>('clear_breakpoint', { address })
  }

  async rttStart(bufSize = 1024): Promise<Envelope<null>> {
    return this.rpc<null>('rtt_start', { bufSize })
  }

  async rttStop(): Promise<Envelope<null>> {
    return this.rpc('rtt_stop')
  }

  async rttRead(since = 0): Promise<Envelope<{ lines: RttLine[] }>> {
    return this.rpc('rtt_read', { since })
  }

  async rttWrite(text: string): Promise<Envelope<null>> {
    return this.rpc<null>('rtt_write', { text })
  }
}
