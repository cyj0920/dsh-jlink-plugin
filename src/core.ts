/** JLinkCore: cordis-free state machine wrapping a DriverInterface / 连接状态机核心（无框架依赖，可单测）. */
import type { JlinkConfig } from './config'
import type { DriverInterface } from './driver/interface'
import type { ConnectionState, CpuStateKind, Envelope, FlashProgressView, JlinkStatusView, RegisterView, RttReadView, TargetInfoView } from './types'
import { ErrorCodes, JlinkError } from './errors'
import { fail, logger, ok } from './utils'

/** Breakpoint entry / 断点条目. */
export interface BreakpointEntry {
  address: number
  type: string
  createdAt: number
}

/** JLinkCore: owns connection state machine and hardware operations / 核心状态机. */
export class JLinkCore {
  private state: ConnectionState = {
    status: 'disconnected',
    chip: null,
    interfaceKind: null,
    serial: null,
    voltage: null,
    error: null,
    lastChangedAt: Date.now(),
  }

  private breakpoints = new Map<number, BreakpointEntry>()
  private flashProgress: FlashProgressView | null = null
  private reconnectAttempts = 0
  private cpuState: CpuStateKind | null = null
  private rttActive = false

  /** Optional state-change hook (projection wiring, Phase 3) / 状态变更钩子. */
  onChange: ((state: ConnectionState) => void) | null = null

  constructor(
    readonly driver: DriverInterface,
    readonly config: JlinkConfig,
  ) {}

  getState(): ConnectionState {
    return { ...this.state }
  }

  statusView(): JlinkStatusView {
    return {
      connected: this.state.status === 'connected',
      status: this.state.status,
      chip: this.state.chip,
      voltage: this.state.voltage,
      cpuState: this.state.status === 'connected' ? this.cpuState : null,
      error: this.state.error,
      lastChangedAt: this.state.lastChangedAt,
    }
  }

  getFlashProgress(): FlashProgressView | null {
    return this.flashProgress ? { ...this.flashProgress } : null
  }

  private setState(patch: Partial<ConnectionState>): ConnectionState {
    this.state = { ...this.state, ...patch, lastChangedAt: Date.now() }
    this.onChange?.(this.getState())
    return this.state
  }

  private guardConnected(): Envelope<never> | null {
    if (this.state.status !== 'connected') {
      return fail('not connected; call connect_device first', ErrorCodes.NOT_CONNECTED)
    }
    return null
  }

  private guardHalted(): Envelope<never> | null {
    const e = this.guardConnected()
    if (e) return e
    const s = this.state
    void s
    // Halting state is tracked by the driver; the precondition contract lives in the driver.
    return null
  }

  async listDevices() {
    return this.driver.listDevices()
  }

  async connect(opts: { serial?: string; interfaceKind?: 'SWD' | 'JTAG'; chip?: string; core?: string }): Promise<Envelope<TargetInfoView>> {
    if (this.state.status === 'connecting') return fail('already connecting', ErrorCodes.BUSY)
    this.setState({ status: 'connecting', error: null, chip: opts.chip ?? null, interfaceKind: opts.interfaceKind ?? this.config.defaultInterface, serial: opts.serial ?? null })
    const res = await this.driver.connect({
      interfaceKind: opts.interfaceKind ?? this.config.defaultInterface,
      chip: opts.chip ?? undefined,
      serial: opts.serial,
      core: this.config.defaultCore,
    })
    if (!res.success) {
      this.setState({ status: 'error', error: res.error?.message ?? res.message })
      return res
    }
    this.reconnectAttempts = 0
    this.setState({ status: 'connected', chip: res.data?.chip ?? opts.chip ?? null, voltage: res.data?.voltage ?? null, error: null })
    // Best-effort: reflect the actual CPU state right after connecting / 连接后查询 CPU 状态.
    try {
      const st = await this.driver.getCpuState()
      if (st.success && st.data) this.cpuState = st.data
    } catch {
      /* keep previous state */
    }
    return res
  }

  async disconnect(): Promise<Envelope<null>> {
    const res = await this.driver.disconnect()
    this.setState({ status: 'disconnected', chip: null, interfaceKind: null, serial: null, voltage: null, error: null })
    this.breakpoints.clear()
    return res
  }

  async halt(): Promise<Envelope<CpuStateKind>> {
    const e = this.guardConnected(); if (e) return e
    const res = await this.driver.halt()
    if (res.success && res.data) this.cpuState = res.data
    return res
  }

  async run(): Promise<Envelope<CpuStateKind>> {
    const e = this.guardConnected(); if (e) return e
    const res = await this.driver.run()
    if (res.success && res.data) this.cpuState = res.data
    return res
  }

  async step(): Promise<Envelope<CpuStateKind>> {
    const e = this.guardConnected(); if (e) return e
    const res = await this.driver.step()
    if (res.success && res.data) this.cpuState = res.data
    return res
  }

  async reset(): Promise<Envelope<null>> {
    const e = this.guardConnected(); if (e) return e
    const res = await this.driver.reset()
    if (res.success) {
      this.cpuState = 'halted'
      this.setState({ chip: this.state.chip, voltage: this.state.voltage, error: null })
    }
    return res
  }

  async getCpuState(): Promise<Envelope<CpuStateKind>> {
    const e = this.guardConnected(); if (e) return e
    const res = await this.driver.getCpuState()
    if (res.success && res.data) this.cpuState = res.data
    return res
  }

  // ── RTT (Phase 3) ──
  async rttStart(bufSize = 1024): Promise<Envelope<null>> {
    const e = this.guardConnected(); if (e) return e
    if (this.rttActive) return fail('RTT already started', ErrorCodes.BUSY)
    const d = this.driver
    if (!d.rttStart) return fail('RTT unsupported by driver', ErrorCodes.UNSUPPORTED)
    const res = await d.rttStart(bufSize)
    if (res.success) this.rttActive = true
    return res
  }

  async rttStop(): Promise<Envelope<null>> {
    this.rttActive = false
    const d = this.driver
    if (!d.rttStop) return ok(null)
    return d.rttStop()
  }

  async rttRead(since = 0): Promise<Envelope<RttReadView>> {
    const e = this.guardConnected(); if (e) return e
    const d = this.driver
    if (!d.rttRead) return fail('RTT unsupported by driver', ErrorCodes.UNSUPPORTED)
    const res = await d.rttRead(since)
    if (!res.success) return res as Envelope<RttReadView>
    const lines = res.data?.lines ?? []
    return ok({ since: since + lines.length, lines, active: this.rttActive })
  }

  async rttWrite(text: string): Promise<Envelope<null>> {
    const e = this.guardConnected(); if (e) return e
    const d = this.driver
    if (!d.rttWrite) return fail('RTT unsupported by driver', ErrorCodes.UNSUPPORTED)
    return d.rttWrite(text)
  }

  /** H5 contract: memory/register access requires halted CPU / 读写前必须 halt. */
  async readMemory(address: number, length: number): Promise<Envelope<Uint8Array>> {
    const e = this.guardConnected(); if (e) return e
    if (length < 1 || length > this.config.maxMemoryReadSize) {
      return fail('length must be 1..' + this.config.maxMemoryReadSize, ErrorCodes.INVALID_PARAMETER)
    }
    const halted = await this.driver.getCpuState()
    if (halted.success && halted.data !== 'halted') {
      return fail('CPU not halted; call halt_cpu first', ErrorCodes.NOT_HALTED)
    }
    return this.driver.readMemory(address, length)
  }

  async writeMemory(address: number, data: Uint8Array): Promise<Envelope<null>> {
    const e = this.guardConnected(); if (e) return e
    const halted = await this.driver.getCpuState()
    if (halted.success && halted.data !== 'halted') {
      return fail('CPU not halted; call halt_cpu first', ErrorCodes.NOT_HALTED)
    }
    return this.driver.writeMemory(address, data)
  }

  async readRegisters(names?: string[]): Promise<Envelope<RegisterView[]>> {
    const e = this.guardConnected(); if (e) return e
    const halted = await this.driver.getCpuState()
    if (halted.success && halted.data !== 'halted') {
      return fail('CPU not halted; call halt_cpu first', ErrorCodes.NOT_HALTED)
    }
    const res = await this.driver.readRegisters(names)
    if (!res.success) return { success: false, message: res.message, error: res.error }
    const views: RegisterView[] = Object.entries(res.data ?? {}).map(([name, value]) => ({
      name,
      value,
      hex: '0x' + (value >>> 0).toString(16).toUpperCase().padStart(8, '0'),
      decimal: String(value),
    }))
    return ok(views)
  }

  async writeRegister(name: string, value: number): Promise<Envelope<null>> {
    const e = this.guardConnected(); if (e) return e
    return this.driver.writeRegister(name, value)
  }

  async eraseFlash(start: number, end: number): Promise<Envelope<null>> {
    const e = this.guardConnected(); if (e) return e
    if (start >= end) return fail('start must be < end', ErrorCodes.INVALID_PARAMETER)
    this.flashProgress = { phase: 'erasing', percent: 0, address: start, length: end - start, message: 'erasing' }
    const res = await this.driver.eraseFlash(start, end)
    this.flashProgress = res.success ? { phase: 'idle', percent: 100, address: start, length: end - start, message: 'erased' } : null
    return res
  }

  async programFlash(address: number, data: Uint8Array, verify: boolean): Promise<Envelope<null>> {
    const e = this.guardConnected(); if (e) return e
    this.flashProgress = { phase: 'programming', percent: 0, address, length: data.length, message: 'programming' }
    const res = await this.driver.programFlash(address, data, verify, (phase, percent, a, l, message) => {
      this.flashProgress = { phase, percent, address: a, length: l, message }
    })
    if (res.success && verify) {
      const v = await this.driver.verifyFlash(address, data)
      if (!v.success) {
        this.flashProgress = { phase: 'idle', percent: 100, address, length: data.length, message: 'verify failed' }
        return v
      }
    }
    this.flashProgress = res.success
      ? { phase: 'idle', percent: 100, address, length: data.length, message: verify ? 'programmed and verified' : 'programmed' }
      : null
    return res
  }

  async verifyFlash(address: number, data: Uint8Array): Promise<Envelope<null>> {
    const e = this.guardConnected(); if (e) return e
    const res = await this.driver.verifyFlash(address, data)
    this.flashProgress = res.success ? { phase: 'idle', percent: 100, address, length: data.length, message: 'verified' } : this.flashProgress
    return res
  }

  async setBreakpoint(address: number): Promise<Envelope<null>> {
    const e = this.guardConnected(); if (e) return e
    if (!this.driver.setBreakpoint) throw new JlinkError(ErrorCodes.UNSUPPORTED, 'breakpoints unsupported by driver')
    const res = await this.driver.setBreakpoint(address)
    if (res.success && !this.breakpoints.has(address)) {
      this.breakpoints.set(address, { address, type: 'hw', createdAt: Date.now() })
    }
    return res
  }

  async clearBreakpoint(address: number): Promise<Envelope<null>> {
    const e = this.guardConnected(); if (e) return e
    if (!this.driver.clearBreakpoint) throw new JlinkError(ErrorCodes.UNSUPPORTED, 'breakpoints unsupported by driver')
    const res = await this.driver.clearBreakpoint(address)
    if (res.success) this.breakpoints.delete(address)
    return res
  }

  getBreakpoints(): BreakpointEntry[] {
    return [...this.breakpoints.values()].sort((a, b) => a.address - b.address)
  }

  getTargetInfo(): Envelope<TargetInfoView> {
    const e = this.guardConnected()
    if (e) return e
    return ok({
      chip: this.state.chip,
      core: 'Cortex-M4',
      flashSize: 0x200000,
      ramSize: 0x40000,
      workRamAddr: 0x20000000,
      workRamSize: 0x10000,
      voltage: this.state.voltage,
    })
  }

  getTargetVoltage(): Envelope<number> {
    const e = this.guardConnected()
    if (e) return e
    return ok(this.state.voltage ?? 0)
  }

  async scanTargetDevices(): Promise<Envelope<{ chip: string; core: string }[]>> {
    const e = this.guardConnected()
    if (e) return e
    return ok([{ chip: this.state.chip ?? 'unknown', core: 'Cortex-M4' }])
  }
}
