/** Device patch contract (port of device_patch_interface.py) / 设备补丁契约. */
import type { DeviceInfo } from '../types'

/** Patch plugin contract / 补丁接口. */
export interface DevicePatch {
  readonly vendorName: string
  readonly patchVersion: string
  isAvailable(): boolean
  readonly devices: DeviceInfo[]
  readonly deviceNames: string[]
  matchDeviceName(partialName: string): string | null
  findSimilarDevices(partialName: string, limit?: number): string[]
  getDeviceNameSuggestions(partialName: string): string
}

/** Default get_device_info helper / 默认设备信息查询. */
export function getDeviceInfo(patch: DevicePatch, deviceName: string): DeviceInfo | null {
  return patch.devices.find((d) => d.name === deviceName) ?? null
}

/** Default supports_device helper / 默认支持判断. */
export function supportsDevice(patch: DevicePatch, deviceName: string): boolean {
  return patch.deviceNames.includes(deviceName)
}
