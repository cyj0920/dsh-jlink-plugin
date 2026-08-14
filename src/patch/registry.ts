/** Patch registry (port of device_patch_manager.py) / 补丁注册器. */
import type { DevicePatch } from './interface'
import type { PatchInfo } from '../types'
import { logger } from '../utils'

/** Plain-class registry, provided to the cordis context via ctx.provide('jlink.patches'). */
export class PatchRegistry {
  private patchIndex = new Map<string, DevicePatch>() // vendor(lower) -> patch

  register(patch: DevicePatch): void {
    const key = patch.vendorName.toLowerCase()
    if (this.patchIndex.has(key)) {
      logger.warn('patch ' + patch.vendorName + ' already registered; replacing')
    }
    this.patchIndex.set(key, patch)
    logger.info('registered patch: ' + patch.vendorName + ' ' + patch.patchVersion)
  }

  unregister(vendorName: string): boolean {
    const key = vendorName.toLowerCase()
    if (this.patchIndex.delete(key)) {
      logger.info('unregistered patch: ' + vendorName)
      return true
    }
    return false
  }

  getPatchByVendor(vendorName: string): DevicePatch | null {
    return this.patchIndex.get(vendorName.toLowerCase()) ?? null
  }

  matchDeviceName(chipName: string): [string, DevicePatch] | null {
    for (const patch of this.patchIndex.values()) {
      const matched = patch.matchDeviceName(chipName)
      if (matched) return [matched, patch]
    }
    return null
  }

  findSimilarDevices(chipName: string, limit = 10): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    for (const patch of this.patchIndex.values()) {
      for (const name of patch.findSimilarDevices(chipName, limit)) {
        if (!seen.has(name)) {
          seen.add(name)
          out.push(name)
          if (out.length >= limit) return out
        }
      }
    }
    return out
  }

  getDeviceNameSuggestions(chipName: string): string {
    const matches = this.findSimilarDevices(chipName, 10)
    if (matches.length > 0) {
      return '您是否想找以下设备之一:\n' + matches.map((n) => '  - ' + n).join('\n')
    }
    const supported: string[] = []
    for (const patch of this.patchIndex.values()) {
      supported.push(...patch.deviceNames.slice(0, 5))
    }
    return '未找到与 \'' + chipName + '\' 相似的设备。\n支持的设备: ' + supported.join(', ') + '...'
  }

  getAllDeviceNames(): string[] {
    return [...this.patchIndex.values()].flatMap((p) => p.deviceNames)
  }

  isDeviceSupported(deviceName: string): boolean {
    return this.getAllDeviceNames().includes(deviceName)
  }

  get patchesList(): DevicePatch[] {
    return [...this.patchIndex.values()]
  }

  get patchCount(): number {
    return this.patchIndex.size
  }

  get supportedVendorNames(): string[] {
    return [...this.patchIndex.values()].map((p) => p.vendorName)
  }

  getPatchInfo(): PatchInfo[] {
    return [...this.patchIndex.values()].map((p) => ({
      vendor: p.vendorName,
      version: p.patchVersion,
      deviceCount: p.deviceNames.length,
      available: p.isAvailable(),
    }))
  }
}
