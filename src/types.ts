/** Shared canonical types / 共享类型定义. */

/** Unified tool/API response envelope, mirroring jlink_mcp. / 统一响应信封。 */
export interface Envelope<T = unknown> {
  success: boolean
  data?: T
  message: string
  error?: { code: string; message: string } | null
}

/** Debug probe interface / 调试接口类型. */
export type InterfaceKind = 'SWD' | 'JTAG'
export type CpuStateKind = 'halted' | 'running' | 'unknown'
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

/** JLinkService connection state machine snapshot / 连接状态机快照. */
export interface ConnectionState {
  status: ConnectionStatus
  chip: string | null
  /** Core identified by the DLL after connect / 连接后 DLL 实际识别的内核. */
  core: string | null
  interfaceKind: InterfaceKind | null
  serial: string | null
  voltage: number | null
  error: string | null
  lastChangedAt: number
}

/** One device row from the JLinkDevices.xml database / 设备库条目. */
export interface DeviceInfo {
  name: string
  vendor: string
  core: string
  workRamAddr: string
  workRamSize: string
}

/** Physical probe entry from list_jlink_devices / 物理探针条目. */
export interface JlinkDeviceEntry {
  serial: string
  description: string
  mock: boolean
}

/** get_target_info payload / 目标信息负载. */
export interface TargetInfoView {
  chip: string | null
  core: string | null
  flashSize: number | null
  ramSize: number | null
  workRamAddr: number | null
  workRamSize: number | null
  voltage: number | null
}

/** Remote RPC jlink/status payload / Remote 状态视图. */
export interface JlinkStatusView {
  connected: boolean
  status: ConnectionStatus
  chip: string | null
  /** Identified core (may exist even when no chip name was given) / 识别的内核. */
  core: string | null
  voltage: number | null
  cpuState: CpuStateKind | null
  error: string | null
  lastChangedAt: number
}

/** One register row / 寄存器行. */
export interface RegisterView {
  name: string
  value: number
  hex: string
  decimal: string
}

/** Flash operation phase / 烧录阶段. */
export type FlashPhase = 'idle' | 'erasing' | 'programming' | 'verifying'

/** Flash progress payload / 烧录进度负载. */
export interface FlashProgressView {
  phase: FlashPhase
  percent: number
  address: number
  length: number
  message: string
}

/** One RTT log line / RTT 日志行. */
export interface RttLine {
  seq: number
  text: string
  at: number
}

/** Remote RPC jlink/rttRead payload / RTT 读取视图. */
export interface RttReadView {
  since: number
  lines: RttLine[]
  active: boolean
}

/** Device patch info for list_device_patches / 补丁信息. */
export interface PatchInfo {
  vendor: string
  version: string
  deviceCount: number
  available: boolean
}
