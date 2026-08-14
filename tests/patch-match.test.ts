/** Patch matching algorithm tests (vectors shared with jlink_mcp) / 补丁匹配测试. */
import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { FlagchipPatch } from '../src/patch/flagchip'
import { PatchRegistry } from '../src/patch/registry'

const xmlPath = fileURLToPath(new URL('../../resources/JLinkDevices.xml', import.meta.url))
const xmlDir = xmlPath.slice(0, xmlPath.length - 'JLinkDevices.xml'.length)

function makePatch(): FlagchipPatch {
  return new FlagchipPatch(xmlDir)
}

describe('FlagchipPatch device loading', () => {
  it('loads the bundled database', () => {
    const p = makePatch()
    expect(p.isAvailable()).toBe(true)
    expect(p.deviceNames.length).toBeGreaterThanOrEqual(5)
  })

  it('exact match is case-insensitive', () => {
    const p = makePatch()
    expect(p.matchDeviceName('fc7300f4mddxxxxt1c')).toBe('FC7300F4MDDxXxxxT1C')
    expect(p.matchDeviceName('FC7300F4MDDxXxxxT1C')).toBe('FC7300F4MDDxXxxxT1C')
  })
})

describe('FlagchipPatch matching algorithm (jlink_mcp vectors)', () => {
  const p = makePatch()

  it('prefix match: FC7300F4MDD -> FC7300F4MDDxXxxxT1C', () => {
    expect(p.matchDeviceName('FC7300F4MDD')).toBe('FC7300F4MDDxXxxxT1C')
  })

  it('contains match: FC7300F4MDDS -> FC7300F4MDSxXxxxT1C (dup-char collapse)', () => {
    expect(p.matchDeviceName('FC7300F4MDDS')).toBe('FC7300F4MDSxXxxxT1C')
  })

  it('fuzzy match: FC7300F4MDDxT1C -> FC7300F4MDDxXxxxT1C', () => {
    expect(p.matchDeviceName('FC7300F4MDDxT1C')).toBe('FC7300F4MDDxXxxxT1C')
  })

  it('revision priority: FC4150F1MBS prefers T1B over T1A', () => {
    expect(p.matchDeviceName('FC4150F1MBS')).toBe('FC4150F1MBSxXxxxT1B')
  })

  it('no match returns null and suggestions are informative', () => {
    expect(p.matchDeviceName('NOPE12345')).toBeNull()
    const s = p.getDeviceNameSuggestions('NOPE12345')
    expect(s).toContain('支持的设备')
  })

  it('findSimilarDevices dedupes and limits', () => {
    const m = p.findSimilarDevices('FC7300F4MDD', 10)
    expect(m.length).toBeGreaterThan(0)
    expect(new Set(m).size).toBe(m.length)
  })
})

describe('PatchRegistry', () => {
  it('registers, matches, unregisters', () => {
    const reg = new PatchRegistry()
    const p = makePatch()
    reg.register(p)
    expect(reg.patchCount).toBe(1)
    expect(reg.supportedVendorNames).toEqual(['Flagchip'])
    const hit = reg.matchDeviceName('FC7300F4MDD')
    expect(hit?.[0]).toBe('FC7300F4MDDxXxxxT1C')
    expect(hit?.[1].vendorName).toBe('Flagchip')
    expect(reg.unregister('flagchip')).toBe(true)
    expect(reg.patchCount).toBe(0)
  })
})
