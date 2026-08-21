/** Reusable device-name matching core (algorithm ported from jlink_mcp flagchip_patch.py). */
import type { DevicePatch } from './interface'
import type { DeviceInfo } from '../types'

const NORMAL_EXCLUDE_KEYWORDS = ['Unlock', 'Factory', 'FromRom', 'Core', '_64', 'ETM']

/**
 * Matching core over a flat device-name list: exact > prefix > contains > fuzzy,
 * fuzzy ranked by variant quality. Subclasses provide the names and may tune
 * revisionPriority for tie-breaking.
 */
export abstract class NameMatchCore implements DevicePatch {
  abstract readonly vendorName: string
  abstract readonly patchVersion: string
  abstract isAvailable(): boolean
  abstract get devices(): DeviceInfo[]

  protected names: string[] = []
  private nameToLower = new Map<string, string>()
  private lowerNames: string[] = []

  protected setNames(names: string[]): void {
    this.names = [...names]
    this.nameToLower = new Map(names.map((n) => [n.toLowerCase(), n]))
    this.lowerNames = names.map((n) => n.toLowerCase())
  }

  get deviceNames(): string[] {
    return [...this.names]
  }

  /** Tie-breaker among equally-ranked candidates / 批次优先级钩子（Flagchip: T1C>T1B>T1A）. */
  protected revisionPriority(_name: string): number {
    return 0
  }

  /** All matching entries, ordered prefix > contains > fuzzy, deduped / 收集全部匹配. */
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
