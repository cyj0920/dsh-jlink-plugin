/** Flagchip patch (port of plugins/flagchip_patch.py) / Flagchip 补丁. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { DevicePatch } from './interface'
import type { DeviceInfo } from '../types'
import { logger } from '../utils'

const NORMAL_EXCLUDE_KEYWORDS = ['Unlock', 'Factory', 'FromRom', 'Core', '_64', 'ETM']

/** Flagchip J-Link device database patch / Flagchip 设备库补丁. */
export class FlagchipPatch implements DevicePatch {
  readonly vendorName = 'Flagchip'
  readonly patchVersion = 'v2.45'

  private devicesList: DeviceInfo[] = []
  private names: string[] = []
  private nameToLower = new Map<string, string>()
  private lowerNames: string[] = []

  constructor(patchDir?: string) {
    const xml = this.loadXml(patchDir)
    if (xml !== null) this.parseXml(xml)
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
      const info: DeviceInfo = {
        name,
        vendor: attrs['Vendor'] ?? '',
        core: attrs['Core'] ?? '',
        workRamAddr: attrs['WorkRAMAddr'] ?? '',
        workRamSize: attrs['WorkRAMSize'] ?? '',
      }
      this.devicesList.push(info)
      this.names.push(name)
      this.nameToLower.set(name.toLowerCase(), name)
      this.lowerNames.push(name.toLowerCase())
    }
  }

  isAvailable(): boolean {
    return this.devicesList.length > 0
  }

  get devices(): DeviceInfo[] {
    return [...this.devicesList]
  }

  get deviceNames(): string[] {
    return [...this.names]
  }

  /** All matching entries, ordered prefix > contains > fuzzy, deduped; fuzzy ranked by quality / 收集全部匹配. */
  private collectMatches(partialName: string): Array<{ name: string; stage: number; quality: number }> {
    if (!partialName) return []
    const pl = partialName.trim().toLowerCase()
    const exact = this.nameToLower.get(pl)
    if (exact) return [{ name: exact, stage: 0, quality: Number.MAX_SAFE_INTEGER }]
    const variants = this.fuzzyVariants(pl)
    const out: Array<{ name: string; stage: number; quality: number }> = []
    for (let i = 0; i < this.lowerNames.length; i++) {
      const nl = this.lowerNames[i]
      const orig = this.names[i]
      if (nl.startsWith(pl)) {
        out.push({ name: orig, stage: 0, quality: nl.length })
      } else if (nl.includes(pl)) {
        out.push({ name: orig, stage: 1, quality: nl.length })
      } else {
        const q = this.fuzzyQuality(nl, variants)
        if (q >= 0) out.push({ name: orig, stage: 2, quality: q })
      }
    }
    out.sort((a, b) => a.stage - b.stage || b.quality - a.quality)
    const seen = new Set<string>()
    const unique: Array<{ name: string; stage: number; quality: number }> = []
    for (const m of out) {
      if (!seen.has(m.name)) {
        seen.add(m.name)
        unique.push(m)
      }
    }
    return unique
  }

  /** Fuzzy variants: x-runs as wildcards; consecutive-letter collapse / 模糊变体. */
  private fuzzyVariants(input: string): Array<{ text: string; regex: RegExp }> {
    const escape = (s: string) => s.replace(/[.*+?^()|[\]\\]/g, '\\$&')
    const variants: string[] = [input]
    // Consecutive-letter collapse: FC7300F4MDDS -> FC7300F4MDS (digits untouched).
    const letterCollapsed = input.replace(/([a-z])\1+/g, '$1')
    if (letterCollapsed !== input) variants.push(letterCollapsed)
    return variants.map((v) => ({ text: v, regex: new RegExp(escape(v).replace(/x+/g, '.*'), 'i') }))
  }

  /** Best fuzzy variant score for one device name; -1 when nothing matches / 模糊评分. */
  private fuzzyQuality(nameLower: string, variants: Array<{ text: string; regex: RegExp }>): number {
    let best = -1
    for (const v of variants) {
      if (v.regex.test(nameLower)) {
        // Prefix-forming variants outrank plain substrings; longer variants win ties.
        const score = (nameLower.startsWith(v.text) ? 10000 : 0) + v.text.length
        if (score > best) best = score
      }
    }
    return best
  }

  private revisionPriority(name: string): number {
    if (name.includes('T1C')) return 3
    if (name.includes('T1B')) return 2
    if (name.includes('T1A')) return 1
    return 0
  }

  matchDeviceName(partialName: string): string | null {
    const all = this.collectMatches(partialName).map((m) => m.name)
    if (all.length === 0) return null
    if (all.length === 1) return all[0]
    const normal = all.filter((n) => !NORMAL_EXCLUDE_KEYWORDS.some((k) => n.includes(k)))
    const pool = normal.length > 0 ? normal : all
    return [...pool].sort((a, b) => this.revisionPriority(b) - this.revisionPriority(a))[0] ?? null
  }

  findSimilarDevices(partialName: string, limit = 10): string[] {
    return this.collectMatches(partialName)
      .map((m) => m.name)
      .slice(0, limit)
  }

  getDeviceNameSuggestions(partialName: string): string {
    const matches = this.findSimilarDevices(partialName, 10)
    if (matches.length > 0) {
      return '您是否想找以下设备之一:\n' + matches.map((n) => '  - ' + n).join('\n')
    }
    const sample = this.names.slice(0, 5).join(', ')
    return '未找到与 \'' + partialName + '\' 相似的设备。\n支持的设备: ' + sample + '...'
  }
}
