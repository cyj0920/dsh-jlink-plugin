/** read_registers tool view: register table / 寄存器表格视图. */
import type { ReactElement } from 'react'
import { extractResult } from './util'

interface RegisterRow {
  name?: string
  value?: number
  hex?: string
  decimal?: string
}

interface RegistersData {
  registers?: RegisterRow[]
}

/** Register table tool view / 寄存器表格. */
export function RegistersToolView(props: Record<string, unknown>): ReactElement {
  const raw = extractResult(props)
  const rows = ((raw as RegistersData)?.registers ?? []) as RegisterRow[]
  if (rows.length === 0) {
    return <div style={{ fontSize: 11 }}>read_registers: 无数据 / no data</div>
  }
  const th: React.CSSProperties = { textAlign: 'left', padding: '2px 8px', borderBottom: '1px solid #ccc', fontSize: 11 }
  const td: React.CSSProperties = { padding: '2px 8px', fontSize: 11, fontFamily: 'monospace' }
  return (
    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead>
        <tr>
          <th style={th}>寄存器</th>
          <th style={th}>十六进制</th>
          <th style={th}>十进制</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name ?? String(r.value)}>
            <td style={td}>{r.name}</td>
            <td style={td}>{r.hex}</td>
            <td style={td}>{r.decimal}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
