/** In-memory mock driver: full behavior parity without hardware / 内存 Mock 驱动. */
import { ErrorCodes } from '../errors'
import { logger, sleep } from '../utils'
import type { ConnectOptions, DriverInterface, FlashProgressCallback } from './interface'
import type { CpuStateKind, Envelope, JlinkDeviceEntry, RttLine, TargetInfoView } from '../types'

const MOCK_SERIAL = 'MOCK-0001'

/** Mock driver with RAM/Flash/register maps (no hardware) / 无硬件 Mock. */
export class MockDriver implements DriverInterface {
  readonly kind = 'mock' as const

  private connected = false
  private halted = false
  private chip: string | null = null
  private ram = new Map<number, number>()
  private flash = new Map<number, number>()
  private registers = new Map<string, number>()
  private breakpoints = new Set<number>()
  private voltage = 3.3

  constructor() {
    for (const name of ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11', 'r12', 'sp', 'lr', 'pc', 'xpsr']) {
      this.registers.set(name, 0)
    }
    this.registers.set('sp', 0x20002000)
    this.registers.set('pc', 0x08000000)
  }

  async listDevices(): Promise<Envelope<JlinkDeviceEntry[]>> {
    return { success: true, data: [{ serial: MOCK_SERIAL, description: 'Mock J-Link (dsh-jlink)', mock: true }], message: 'ok', error: null }
  }

  async connect(opts: ConnectOptions): Promise<Envelope<TargetInfoView>> {
    this.connected = true
    this.halted = false
    this.chip = opts.chip ?? 'FC7300F4MDDxXxxxT1C'
    logger.info('[mock] connected chip=' + this.chip + ' interface=' + (opts.interfaceKind ?? 'JTAG'))
    return { success: true, data: this.targetInfo(), message: 'connected', error: null }
  }

  async disconnect(): Promise<Envelope<null>> {
    this.connected = false
    this.halted = false
    this.chip = null
    return { success: true, data: null, message: 'disconnected', error: null }
  }

  private requireConnected(): Envelope<never> | null {
    return this.connected ? null : { success: false, message: 'not connected', error: { code: ErrorCodes.NOT_CONNECTED, message: 'not connected' } }
  }

  private requireHalted(): Envelope<never> | null {
    if (!this.connected) return { success: false, message: 'not connected', error: { code: ErrorCodes.NOT_CONNECTED, message: 'not connected' } }
    return this.halted ? null : { success: false, message: 'CPU not halted; call halt_cpu first', error: { code: ErrorCodes.NOT_HALTED, message: 'CPU not halted' } }
  }

  private targetInfo(): TargetInfoView {
    return {
      chip: this.chip,
      core: 'Cortex-M4',
      flashSize: 0x200000,
      ramSize: 0x40000,
      workRamAddr: 0x20000000,
      workRamSize: 0x10000,
      voltage: this.voltage,
    }
  }

  async halt(): Promise<Envelope<CpuStateKind>> {
    const e = this.requireConnected(); if (e) return e
    this.halted = true
    return { success: true, data: 'halted', message: 'halted', error: null }
  }

  async run(): Promise<Envelope<CpuStateKind>> {
    const e = this.requireConnected(); if (e) return e
    this.halted = false
    return { success: true, data: 'running', message: 'running', error: null }
  }

  async step(): Promise<Envelope<CpuStateKind>> {
    const e = this.requireHalted(); if (e) return e
    this.registers.set('pc', (this.registers.get('pc') ?? 0) + 2)
    return { success: true, data: 'halted', message: 'stepped', error: null }
  }

  async reset(): Promise<Envelope<null>> {
    const e = this.requireConnected(); if (e) return e
    this.halted = true
    this.registers.set('pc', 0x08000000)
    this.registers.set('sp', 0x20002000)
    return { success: true, data: null, message: 'reset', error: null }
  }

  async getCpuState(): Promise<Envelope<CpuStateKind>> {
    const e = this.requireConnected(); if (e) return e
    return { success: true, data: this.halted ? 'halted' : 'running', message: 'ok', error: null }
  }

  async readMemory(address: number, length: number): Promise<Envelope<Uint8Array>> {
    const e = this.requireHalted(); if (e) return e
    if (length < 0 || length > 0x100000) {
      return { success: false, message: 'invalid length', error: { code: ErrorCodes.INVALID_PARAMETER, message: 'invalid length' } }
    }
    const out = new Uint8Array(length)
    for (let i = 0; i < length; i++) out[i] = this.ram.get(address + i) ?? 0
    return { success: true, data: out, message: 'ok', error: null }
  }

  async writeMemory(address: number, data: Uint8Array): Promise<Envelope<null>> {
    const e = this.requireHalted(); if (e) return e
    for (let i = 0; i < data.length; i++) this.ram.set(address + i, data[i])
    return { success: true, data: null, message: 'ok', error: null }
  }

  async readRegisters(names?: string[]): Promise<Envelope<Record<string, number>>> {
    const e = this.requireHalted(); if (e) return e
    const keys = names && names.length ? names : [...this.registers.keys()]
    const out: Record<string, number> = {}
    for (const n of keys) out[n] = this.registers.get(n) ?? 0
    return { success: true, data: out, message: 'ok', error: null }
  }

  async writeRegister(name: string, value: number): Promise<Envelope<null>> {
    const e = this.requireHalted(); if (e) return e
    if (!this.registers.has(name)) {
      return { success: false, message: 'unknown register: ' + name, error: { code: ErrorCodes.INVALID_PARAMETER, message: 'unknown register' } }
    }
    this.registers.set(name, value)
    return { success: true, data: null, message: 'ok', error: null }
  }

  async setBreakpoint(address: number): Promise<Envelope<null>> {
    const e = this.requireConnected(); if (e) return e
    if (this.breakpoints.has(address)) {
      return { success: true, data: null, message: 'breakpoint already exists', error: null }
    }
    this.breakpoints.add(address)
    return { success: true, data: null, message: 'breakpoint set', error: null }
  }

  async clearBreakpoint(address: number): Promise<Envelope<null>> {
    const e = this.requireConnected(); if (e) return e
    if (!this.breakpoints.delete(address)) {
      return { success: false, message: 'breakpoint not found: 0x' + address.toString(16), error: { code: ErrorCodes.NOT_FOUND, message: 'breakpoint not found' } }
    }
    return { success: true, data: null, message: 'breakpoint cleared', error: null }
  }

  async eraseFlash(start: number, end: number): Promise<Envelope<null>> {
    const e = this.requireConnected(); if (e) return e
    if (start >= end) {
      return { success: false, message: 'invalid range', error: { code: ErrorCodes.INVALID_PARAMETER, message: 'invalid range' } }
    }
    for (let a = start; a < end; a++) this.flash.delete(a)
    return { success: true, data: null, message: 'flash erased', error: null }
  }

  async programFlash(address: number, data: Uint8Array, verify: boolean, onProgress?: FlashProgressCallback): Promise<Envelope<null>> {
    const e = this.requireConnected(); if (e) return e
    const steps = [0.25, 0.5, 0.75, 1]
    for (const p of steps) {
      const n = Math.floor(data.length * p)
      for (let i = 0; i < n; i++) this.flash.set(address + i, data[i])
      onProgress?.('programming', Math.round(p * 100), address, data.length, 'programming')
      await sleep(5)
    }
    if (verify) {
      const v = await this.verifyFlash(address, data)
      if (!v.success) return v as Envelope<never>
    }
    return { success: true, data: null, message: 'programmed', error: null }
  }

  async verifyFlash(address: number, data: Uint8Array): Promise<Envelope<null>> {
    const e = this.requireConnected(); if (e) return e
    for (let i = 0; i < data.length; i++) {
      if ((this.flash.get(address + i) ?? 0) !== data[i]) {
        return { success: false, message: 'verify failed at 0x' + (address + i).toString(16), error: { code: ErrorCodes.DRIVER, message: 'verify mismatch' } }
      }
    }
    return { success: true, data: null, message: 'verify ok', error: null }
  }

  private rttSeq = 0

  async rttStart(bufSize = 1024): Promise<Envelope<null>> {
    const e = this.requireConnected(); if (e) return e
    void bufSize
    return { success: true, data: null, message: 'rtt started (mock)', error: null }
  }

  async rttStop(): Promise<Envelope<null>> {
    const e = this.requireConnected(); if (e) return e
    return { success: true, data: null, message: 'rtt stopped (mock)', error: null }
  }

  async rttRead(since = 0): Promise<Envelope<{ lines: RttLine[] }>> {
    const e = this.requireConnected(); if (e) return e
    this.rttSeq += 1
    const lines: RttLine[] = []
    if (this.rttSeq > since) {
      lines.push({ seq: this.rttSeq, text: 'mock rtt line #' + this.rttSeq, at: Date.now() })
    }
    return { success: true, data: { lines }, message: 'ok', error: null }
  }

  async rttWrite(text: string): Promise<Envelope<null>> {
    const e = this.requireConnected(); if (e) return e
    void text
    return { success: true, data: null, message: 'rtt write ok (mock)', error: null }
  }
}
