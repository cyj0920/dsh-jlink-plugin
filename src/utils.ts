/** Utility helpers: logger, envelope, hexdump / 工具函数. */
import type { Envelope } from './types'

/** Namespaced logger / 带前缀的日志器. */
export const logger = {
  debug: (...args: unknown[]) => console.debug('[dsh-jlink]', ...args),
  info: (...args: unknown[]) => console.info('[dsh-jlink]', ...args),
  warn: (...args: unknown[]) => console.warn('[dsh-jlink]', ...args),
  error: (...args: unknown[]) => console.error('[dsh-jlink]', ...args),
}

/** Success envelope / 成功信封. */
export function ok<T>(data: T, message = 'ok'): Envelope<T> {
  return { success: true, data, message, error: null }
}

/** Failure envelope / 失败信封. */
export function fail(message: string, code = 'JLINK_ERROR'): Envelope<never> {
  return { success: false, message, error: { code, message } }
}

/** Classic hexdump with ASCII column / 经典十六进制转储. */
export function hexdump(bytes: Uint8Array, address = 0): string {
  const lines: string[] = []
  for (let off = 0; off < bytes.length; off += 16) {
    const chunk = bytes.slice(off, off + 16)
    const hexPart = Array.from(chunk, (b) => b.toString(16).padStart(2, '0')).join(' ').padEnd(47, ' ')
    const ascii = Array.from(chunk, (b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join('')
    lines.push((address + off).toString(16).padStart(8, '0') + '  ' + hexPart + '  ' + ascii)
  }
  return lines.join('\n')
}

/** Awaitable sleep honoring an AbortSignal / 可取消延时. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason ?? new Error('aborted')); return }
    const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve() }, ms)
    const onAbort = () => { clearTimeout(t); reject(signal?.reason ?? new Error('aborted')) }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Format a 32-bit value as 0x-prefixed hex / 32 位值格式化. */
export function asHex(v: number): string {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0')
}

/** Byte array to 0x-prefixed hex string / 字节数组转十六进制串. */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Hex string to byte array; throws on invalid input / 十六进制串转字节数组. */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '').replace(/^0x/i, '')
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error('invalid hex string: ' + hex)
  }
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}
