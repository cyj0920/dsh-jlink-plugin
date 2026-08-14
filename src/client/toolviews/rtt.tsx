/** rtt_read tool view: terminal-style log / RTT 终端视图. */
import type { ReactElement } from 'react'
import { extractResult, monoStyle } from './util'

interface RttLine {
  seq?: number
  text?: string
}

interface RttData {
  lines?: RttLine[]
  active?: boolean
}

/** RTT log tool view / RTT 日志视图. */
export function RttToolView(props: Record<string, unknown>): ReactElement {
  const raw = extractResult(props)
  const v = (raw ?? {}) as RttData
  const lines = v.lines ?? []
  if (lines.length === 0) {
    return <pre style={monoStyle}>{v.active ? 'RTT 运行中，暂无数据…' : 'RTT 未启动'}</pre>
  }
  return (
    <pre style={{ ...monoStyle, color: '#0a0' }}>
      {lines.map((l) => '[' + (l.seq ?? 0) + '] ' + (l.text ?? '')).join('\n')}
    </pre>
  )
}
