/** get_target_info / get_connection_status tool view: chip card / 芯片信息卡. */
import type { ReactElement } from 'react'
import { extractResult } from './util'

interface TargetData {
  chip?: string | null
  core?: string | null
  flashSize?: number | null
  ramSize?: number | null
  voltage?: number | null
  connected?: boolean
  status?: string
  error?: { message?: string } | null
}

function fmtSize(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 0x100000) return (n / 0x100000).toFixed(1) + ' MB'
  if (n >= 0x400) return (n / 0x400).toFixed(1) + ' KB'
  return String(n)
}

/** Chip info card / 芯片卡片. */
export function ChipToolView(props: Record<string, unknown>): ReactElement {
  const raw = extractResult(props)
  const v = (raw ?? {}) as TargetData
  const row = (label: string, value: string): ReactElement => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 11 }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span style={{ fontFamily: 'monospace' }}>{value}</span>
    </div>
  )
  const err = (raw as { error?: { message?: string } })?.error
  return (
    <div style={{ minWidth: 220 }}>
      {err ? (
        <div style={{ fontSize: 11, color: '#ff3b30' }}>error: {err.message}</div>
      ) : (
        <>
          {row('芯片', v.chip ?? '—')}
          {row('内核', v.core ?? '—')}
          {row('Flash', fmtSize(v.flashSize))}
          {row('RAM', fmtSize(v.ramSize))}
          {row('电压', v.voltage != null ? v.voltage.toFixed(2) + ' V' : '—')}
          {v.status ? row('状态', v.status) : null}
        </>
      )}
    </div>
  )
}
