/** Envelope and utility tests / 信封与工具函数测试. */
import { describe, expect, it } from 'vitest'
import { bytesToHex, fail, hexToBytes, hexdump, ok } from '../src/utils'

describe('envelope helpers', () => {
  it('ok() builds a success envelope', () => {
    const e = ok({ a: 1 }, 'done')
    expect(e.success).toBe(true)
    expect(e.data).toEqual({ a: 1 })
    expect(e.message).toBe('done')
    expect(e.error).toBeNull()
  })

  it('fail() builds a structured failure envelope', () => {
    const e = fail('CPU not halted', 'JLINK_NOT_HALTED')
    expect(e.success).toBe(false)
    expect(e.error).toEqual({ code: 'JLINK_NOT_HALTED', message: 'CPU not halted' })
  })
})

describe('hex utilities', () => {
  it('bytesToHex / hexToBytes round-trip', () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
    const hex = bytesToHex(bytes)
    expect(hex).toBe('deadbeef')
    expect(hexToBytes(hex)).toEqual(bytes)
  })

  it('hexToBytes accepts 0x prefix and whitespace', () => {
    expect(hexToBytes('0x00 ff')).toEqual(new Uint8Array([0x00, 0xff]))
  })

  it('hexToBytes rejects odd length and bad chars', () => {
    expect(() => hexToBytes('abc')).toThrow()
    expect(() => hexToBytes('zz')).toThrow()
  })

  it('hexdump formats address + hex + ascii columns', () => {
    const dump = hexdump(new Uint8Array([0x41, 0x42, 0x00]), 0x1000)
    expect(dump).toContain('00001000')
    expect(dump).toContain('41 42 00')
    expect(dump).toContain('AB.')
  })
})
