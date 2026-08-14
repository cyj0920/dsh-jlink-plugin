/** erase_flash / program_flash tool view: progress bar / 烧录进度视图. */
import type { ReactElement } from 'react'
import { extractResult } from './util'

interface ProgressData {
  phase?: string
  percent?: number
  message?: string
}

interface FlashData {
  progress?: ProgressData | null
  verified?: boolean
}

const PHASE_TEXT: Record<string, string> = {
  idle: '完成',
  erasing: '擦除中',
  programming: '烧录中',
  verifying: '校验中',
}

/** Flash progress tool view / 烧录进度组件. */
export function FlashToolView(props: Record<string, unknown>): ReactElement {
  const raw = extractResult(props)
  const v = (raw ?? {}) as FlashData
  const p = v.progress
  const percent = Math.min(100, Math.max(0, p?.percent ?? (v.verified ? 100 : 0)))
  const phase = p?.phase ?? (v.verified ? 'idle' : 'unknown')
  const bar: React.CSSProperties = {
    height: 8,
    borderRadius: 4,
    background: '#e5e5e5',
    overflow: 'hidden',
    width: '100%',
  }
  const fill: React.CSSProperties = {
    height: '100%',
    width: percent + '%',
    background: '#34c759',
    transition: 'width .2s',
  }
  return (
    <div style={{ minWidth: 220 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
        <span>{PHASE_TEXT[phase] ?? phase}</span>
        <span>{percent}%</span>
      </div>
      <div style={bar}>
        <div style={fill} />
      </div>
      {p?.message && <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>{p.message}</div>}
    </div>
  )
}
