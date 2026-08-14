/** Hardware driver abstraction (D1) / 硬件驱动抽象层. */
import type { CpuStateKind, Envelope, FlashPhase, JlinkDeviceEntry, RttLine, TargetInfoView } from '../types'

/** Options for driver.connect / 连接参数. */
export interface ConnectOptions {
  interfaceKind?: 'SWD' | 'JTAG'
  chip?: string
  serial?: string
}

/** Live flash progress callback / 烧录进度回调. */
export interface FlashProgressCallback {
  (phase: FlashPhase, percent: number, address: number, length: number, message: string): void
}

/** Driver contract: all methods return envelopes, never throw business errors / 驱动契约. */
export interface DriverInterface {
  readonly kind: 'mock' | 'python' | 'gdb'
  /** List physical probes / 枚举探针. */
  listDevices(): Promise<Envelope<JlinkDeviceEntry[]>>
  connect(opts: ConnectOptions): Promise<Envelope<TargetInfoView>>
  disconnect(): Promise<Envelope<null>>
  halt(): Promise<Envelope<CpuStateKind>>
  run(): Promise<Envelope<CpuStateKind>>
  step(): Promise<Envelope<CpuStateKind>>
  reset(): Promise<Envelope<null>>
  getCpuState(): Promise<Envelope<CpuStateKind>>
  readMemory(address: number, length: number): Promise<Envelope<Uint8Array>>
  writeMemory(address: number, data: Uint8Array): Promise<Envelope<null>>
  readRegisters(names?: string[]): Promise<Envelope<Record<string, number>>>
  writeRegister(name: string, value: number): Promise<Envelope<null>>
  eraseFlash(start: number, end: number): Promise<Envelope<null>>
  programFlash(address: number, data: Uint8Array, verify: boolean, onProgress?: FlashProgressCallback): Promise<Envelope<null>>
  verifyFlash(address: number, data: Uint8Array): Promise<Envelope<null>>
  /** Breakpoint support (mock) / 断点支持. */
  setBreakpoint?(address: number): Promise<Envelope<null>>
  clearBreakpoint?(address: number): Promise<Envelope<null>>
  /** RTT support (Phase 3) / RTT 支持. */
  rttStart?(bufSize?: number): Promise<Envelope<null>>
  rttStop?(): Promise<Envelope<null>>
  rttRead?(since?: number): Promise<Envelope<{ lines: RttLine[] }>>
  rttWrite?(text: string): Promise<Envelope<null>>
}
