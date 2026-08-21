/** JLinkService: cordis service exposing the JLinkCore (Remote RPC + tool surface) / JLink 服务. */
import type { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { PatchRegistry } from './patch/registry'
import type { JlinkConfig } from './config'
import { JLinkCore } from './core'
import { createDriver } from './driver/factory'
import type { ConnectOptions } from './driver/interface'
import type { BreakpointEntry } from './core'
import type { CpuStateKind, Envelope, FlashProgressView, JlinkStatusView, RegisterView, RttReadView, TargetInfoView, JlinkDeviceEntry } from './types'

/** J-Link debug service registered as ctx['jlink'] / 调试服务. */
export class JLinkService extends TypertRemoteService {
  readonly core: JLinkCore
  private readonly patches: PatchRegistry | null

  constructor(ctx: Context, config: JlinkConfig, patches?: PatchRegistry | null) {
    super(ctx, 'jlink')
    this.patches = patches ?? null
    this.core = new JLinkCore(createDriver(config), config)
  }

  /** Remote endpoint: all known chip names for the client dropdown / 芯片名单. */
  deviceNames(): Promise<string[]> {
    const names = this.patches ? [...this.patches.getAllDeviceNames()].sort((a, b) => a.localeCompare(b)) : []
    return Promise.resolve(names)
  }

  // ── Remote endpoints (SRC, direct invocation) / Remote 端点 ──

  status(): Promise<JlinkStatusView> {
    console.info('[dsh-jlink] RPC status() invoked')
    return Promise.resolve(this.core.statusView())
  }

  async halt(): Promise<JlinkStatusView> {
    await this.core.halt()
    return this.core.statusView()
  }

  async run(): Promise<JlinkStatusView> {
    await this.core.run()
    return this.core.statusView()
  }

  async reset(): Promise<JlinkStatusView> {
    await this.core.reset()
    return this.core.statusView()
  }

  rttRead(since: number): Promise<RttReadView> {
    return this.core.rttRead(since).then((r) => (r.success && r.data ? r.data : { since, lines: [], active: false }))
  }

  /** Remote-facing connect (UI button) / UI 连接入口. */
  async remoteConnect(opts: { interfaceKind?: string; chip?: string; core?: string }): Promise<JlinkStatusView> {
    console.info('[dsh-jlink] RPC remoteConnect() invoked', opts)
    const res = await this.core.connect({
      interfaceKind: opts.interfaceKind === 'SWD' || opts.interfaceKind === 'JTAG' ? opts.interfaceKind : undefined,
      chip: opts.chip,
      core: opts.core,
    })
    return this.core.statusView()
  }

  /** Remote-facing disconnect (UI button) / UI 断开入口. */
  async remoteDisconnect(): Promise<JlinkStatusView> {
    await this.core.disconnect()
    return this.core.statusView()
  }

  /** Remote-facing halt (UI button) / UI 暂停入口. */
  async remoteHalt(): Promise<JlinkStatusView> {
    await this.core.halt()
    return this.core.statusView()
  }

  /** Remote-facing run (UI button) / UI 运行入口. */
  async remoteRun(): Promise<JlinkStatusView> {
    await this.core.run()
    return this.core.statusView()
  }

  /** Remote-facing reset (UI button) / UI 复位入口. */
  async remoteReset(): Promise<JlinkStatusView> {
    await this.core.reset()
    return this.core.statusView()
  }

  // ── Tool surface (thin delegation to the core) / 工具面 ──

  listDevices(): Promise<Envelope<JlinkDeviceEntry[]>> {
    return this.core.listDevices()
  }

  connect(opts: ConnectOptions & { chip?: string }): Promise<Envelope<TargetInfoView>> {
    return this.core.connect(opts)
  }

  disconnect(): Promise<Envelope<null>> {
    return this.core.disconnect()
  }

  haltCpu(): Promise<Envelope<CpuStateKind>> {
    return this.core.halt()
  }

  runCpu(): Promise<Envelope<CpuStateKind>> {
    return this.core.run()
  }

  stepInstruction(): Promise<Envelope<CpuStateKind>> {
    return this.core.step()
  }

  resetTarget(): Promise<Envelope<null>> {
    return this.core.reset()
  }

  getCpuState(): Promise<Envelope<CpuStateKind>> {
    return this.core.getCpuState()
  }

  readMemory(address: number, length: number): Promise<Envelope<Uint8Array>> {
    return this.core.readMemory(address, length)
  }

  writeMemory(address: number, data: Uint8Array): Promise<Envelope<null>> {
    return this.core.writeMemory(address, data)
  }

  readRegisters(names?: string[]): Promise<Envelope<RegisterView[]>> {
    return this.core.readRegisters(names)
  }

  writeRegister(name: string, value: number): Promise<Envelope<null>> {
    return this.core.writeRegister(name, value)
  }

  eraseFlash(start: number, end: number): Promise<Envelope<null>> {
    return this.core.eraseFlash(start, end)
  }

  programFlash(address: number, data: Uint8Array, verify: boolean): Promise<Envelope<null>> {
    return this.core.programFlash(address, data, verify)
  }

  verifyFlash(address: number, data: Uint8Array): Promise<Envelope<null>> {
    return this.core.verifyFlash(address, data)
  }

  setBreakpoint(address: number): Promise<Envelope<null>> {
    return this.core.setBreakpoint(address)
  }

  clearBreakpoint(address: number): Promise<Envelope<null>> {
    return this.core.clearBreakpoint(address)
  }

  getBreakpoints(): BreakpointEntry[] {
    return this.core.getBreakpoints()
  }

  getTargetInfo(): Envelope<TargetInfoView> {
    return this.core.getTargetInfo()
  }

  getTargetVoltage(): Promise<Envelope<number>> {
    return Promise.resolve(this.core.getTargetVoltage())
  }

  scanTargetDevices(): Promise<Envelope<{ chip: string; core: string }[]>> {
    return this.core.scanTargetDevices()
  }

  statusView(): JlinkStatusView {
    return this.core.statusView()
  }

  getFlashProgress(): FlashProgressView | null {
    return this.core.getFlashProgress()
  }

  rttStart(bufSize?: number): Promise<Envelope<null>> {
    return this.core.rttStart(bufSize)
  }

  rttStop(): Promise<Envelope<null>> {
    return this.core.rttStop()
  }

  rttWrite(text: string): Promise<Envelope<null>> {
    return this.core.rttWrite(text)
  }
}
