/** Session-header J-Link status pill with quick actions / 会话头状态灯. */
import { useEffect, useState } from 'react'
import type { JlinkStatusView } from '../types'
import { getJlinkRemote } from './runtime'

const POLL_MS = 2000

const STATUS_COLOR: Record<JlinkStatusView['status'], string> = {
  connected: '#34c759',
  connecting: '#ffcc00',
  error: '#ff3b30',
  disconnected: '#8e8e93',
}

const STATUS_TEXT: Record<JlinkStatusView['status'], string> = {
  connected: 'J-Link 已连接',
  connecting: 'J-Link 连接中',
  error: 'J-Link 错误',
  disconnected: 'J-Link 未连接',
}

const pillStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'inherit',
  font: 'inherit',
  padding: '2px 6px',
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  zIndex: 30,
  top: 36,
  right: 8,
  background: '#fff',
  border: '1px solid #d0d0d0',
  borderRadius: 8,
  padding: 12,
  minWidth: 240,
  boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
  color: '#111',
}

/** Header action entry: status pill + popover / 状态灯组件. */
export function JlinkHeaderControl(_props: Record<string, unknown>): JSX.Element {
  const [status, setStatus] = useState<JlinkStatusView | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const poll = async (): Promise<void> => {
      const remote = getJlinkRemote()
      if (!remote) return
      try {
        const s = await remote.status()
        if (!cancelled) setStatus(s)
      } catch {
        /* transient polling failure */
      }
    }
    void poll()
    const timer = setInterval(() => {
      void poll()
    }, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const runAction = (fn: () => Promise<JlinkStatusView | null>): void => {
    void fn()
      .then((s) => {
        if (s) setStatus(s)
      })
      .catch(() => undefined)
  }

  const st = status?.status ?? 'disconnected'
  const color = STATUS_COLOR[st]
  const chip = status?.chip ?? '—'
  const title = STATUS_TEXT[st] + (status?.error ? ': ' + status.error : '')

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <button type="button" title={title} aria-label={title} onClick={() => setOpen((v) => !v)} style={pillStyle}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block', flex: 'none' }} />
        <span style={{ fontSize: 12 }}>J-Link</span>
      </button>
      {open && (
        <div style={panelStyle}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>J-Link · {STATUS_TEXT[st]}</div>
          <div style={{ marginBottom: 4 }}>芯片: {chip}</div>
          <div style={{ marginBottom: 4 }}>电压: {status?.voltage != null ? status.voltage.toFixed(2) + ' V' : '—'}</div>
          <div style={{ marginBottom: 4 }}>
            CPU: {status?.cpuState === 'halted' ? '已暂停' : status?.cpuState === 'running' ? '运行中' : '—'}
          </div>
          {status?.error && <div style={{ color: '#ff3b30', marginBottom: 4 }}>{status.error}</div>}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button type="button" onClick={() => runAction(async () => (await getJlinkRemote()?.halt()) ?? null)}>
              暂停
            </button>
            <button type="button" onClick={() => runAction(async () => (await getJlinkRemote()?.run()) ?? null)}>
              运行
            </button>
            <button type="button" onClick={() => runAction(async () => (await getJlinkRemote()?.reset()) ?? null)}>
              复位
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
