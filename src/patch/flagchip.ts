/** Flagchip patch (port of plugins/flagchip_patch.py) / Flagchip 补丁. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { NameMatchCore } from './name-match'
import type { DeviceInfo } from '../types'
import { logger } from '../utils'

/** Flagchip J-Link device database patch / Flagchip 设备库补丁. */
export class FlagchipPatch extends NameMatchCore {
  readonly vendorName = 'Flagchip'
  readonly patchVersion = 'v2.45'

  private devicesList: DeviceInfo[] = []

  constructor(patchDir?: string) {
    super()
    const xml = this.loadXml(patchDir)
    if (xml !== null) this.parseXml(xml)
    this.setNames(this.devicesList.map((d) => d.name))
    if (this.devicesList.length === 0) {
      logger.warn('Flagchip patch loaded 0 devices (missing JLinkDevices.xml?)')
    } else {
      logger.info('loaded ' + this.devicesList.length + ' Flagchip devices')
    }
  }

  private loadXml(patchDir?: string): string | null {
    const candidates: string[] = []
    if (patchDir) {
      candidates.push(patchDir + '\\JLinkDevices.xml')
    }
    // package-internal: <root>/resources/JLinkDevices.xml
    // built bundle lives at <root>/lib/index.mjs (../resources); source at <root>/src/patch (../../resources).
    candidates.push(fileURLToPath(new URL('../resources/JLinkDevices.xml', import.meta.url)))
    candidates.push(fileURLToPath(new URL('../../resources/JLinkDevices.xml', import.meta.url)))
    for (const c of candidates) {
      try {
        return readFileSync(c, 'utf8')
      } catch {
        /* try next */
      }
    }
    return null
  }

  private parseXml(xml: string): void {
    const deviceRe = /<Device>([\s\S]*?)<\/Device>/g
    const chipRe = /<ChipInfo\b([^>]*)\/>/g
    const attrRe = /(\w+)\s*=\s*"([^"]*)"/g
    for (const dm of xml.matchAll(deviceRe)) {
      const chip = [...dm[1].matchAll(chipRe)][0]
      if (!chip) continue
      const attrs: Record<string, string> = {}
      for (const am of chip[1].matchAll(attrRe)) attrs[am[1]] = am[2]
      const name = attrs['Name']
      if (!name) continue
      this.devicesList.push({
        name,
        vendor: attrs['Vendor'] ?? '',
        core: attrs['Core'] ?? '',
        workRamAddr: attrs['WorkRAMAddr'] ?? '',
        workRamSize: attrs['WorkRAMSize'] ?? '',
      })
    }
  }

  isAvailable(): boolean {
    return this.devicesList.length > 0
  }

  get devices(): DeviceInfo[] {
    return [...this.devicesList]
  }

  /** Batch priority hook: T1C > T1B > T1A / 批次优先级（平移自 jlink_mcp）. */
  protected revisionPriority(name: string): number {
    if (name.includes('T1C')) return 3
    if (name.includes('T1B')) return 2
    if (name.includes('T1A')) return 1
    return 0
  }
}