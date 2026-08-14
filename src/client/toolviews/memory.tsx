/** read_memory / write_memory tool view: hexdump / 内存视图. */
import type { ReactElement } from 'react'
import { extractResult, monoStyle } from './util'

interface MemoryData {
  address?: number
  length?: number
  hex?: string
  bytes?: string
}

/** Hexdump tool view / hexdump 视图. */
export function MemoryToolView(props: Record<string, unknown>): ReactElement {
  const raw = extractResult(props)
  const v = (raw ?? {}) as MemoryData
  if (!v.hex && !v.bytes) {
    return <pre style={monoStyle}>read_memory: 无数据 / no data</pre>
  }
  const header = '地址 0x' + (v.address ?? 0).toString(16) + ' · ' + (v.length ?? 0) + ' 字节'
  return (
    <div>
      <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>{header}</div>
      <pre style={monoStyle}>{v.hex ?? v.bytes}</pre>
    </div>
  )
}
