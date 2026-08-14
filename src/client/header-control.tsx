/** Session-header J-Link status pill with quick actions / 会话头状态灯. */
import { useEffect, useState } from 'react'
import type { JlinkStatusView } from '../types'
import { getJlinkRemote, unwrap, withTimeout } from './runtime'

const POLL_MS = 2000
const RPC_TIMEOUT_MS = 5000

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
  display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
  cursor: 'pointer', color: 'inherit', font: 'inherit', padding: '2px 6px',
}
const panelStyle: React.CSSProperties = {
  position: 'absolute', zIndex: 30, top: 36, right: 8, background: '#fff',
  border: '1px solid #d0d0d0', borderRadius: 8, padding: 12, minWidth: 300,
  boxShadow: '0 4px 16px rgba(0,0,0,0.15)', color: '#111',
}
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '4px 6px',
  border: '1px solid #ccc', borderRadius: 4,
}

export function JlinkHeaderControl(_props: Record<string, unknown>): JSX.Element {
  const [status, setStatus] = useState<JlinkStatusView | null>(null)
  const [open, setOpen] = useState(false)
  const [chipInput, setChipInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [remoteOk, setRemoteOk] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    let polledOnce = false
    const poll = async (): Promise<void> => {
      let remote: ReturnType<typeof getJlinkRemote> = null
      try {
        remote = getJlinkRemote()
      } catch (e) {
        if (!polledOnce) {
          console.warn('[dsh-jlink] remote namespace access failed:', e)
          if (!cancelled) setRemoteOk(false)
          polledOnce = true
        }
        return
      }
      if (!remote) {
        if (!polledOnce) {
          console.warn('[dsh-jlink] remote namespace unavailable')
          if (!cancelled) setRemoteOk(false)
          polledOnce = true
        }
        return
      }
      try {
        const r = await withTimeout(remote.status(), RPC_TIMEOUT_MS, 'status')
        if (!cancelled) {
          setStatus(unwrap(r))
          setRemoteOk(true)
        }
        if (!polledOnce) {
          console.info('[dsh-jlink] status poll OK:', r)
          polledOnce = true
        }
      } catch (e) {
        console.warn('[dsh-jlink] status poll failed:', e)
        if (!cancelled) {
          setRemoteOk(false)
          setErrorText(e instanceof Error ? e.message : String(e))
        }
        if (!polledOnce) polledOnce = true
      }
    }
    void poll()
    const timer = setInterval(() => { void poll() }, POLL_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  const runAction = (label: string, fn: () => Promise<JlinkStatusView | null>): void => {
    setBusy(true)
    setErrorText(null)
    console.info('[dsh-jlink] action:', label)
    void fn()
      .then((s) => {
        if (s) setStatus(s)
        console.info('[dsh-jlink] action done:', label, s?.status)
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn('[dsh-jlink] action failed:', label, e)
        setErrorText(label + ' 失败: ' + msg)
      })
      .finally(() => setBusy(false))
  }

  const doConnect = (): void => {
    const remote = getJlinkRemote()
    if (!remote) return
    const chip = chipInput.trim()  // '' => generic-core fallback in the driver
    // The gateway requires ALL descriptor fields present in args (undefined is dropped).
    runAction('connect', async () => unwrap(await withTimeout(remote.remoteConnect('JTAG', chip, 'Cortex-M4'), RPC_TIMEOUT_MS, 'connect')))
  }
  const doDisconnect = (): void => {
    const remote = getJlinkRemote()
    if (!remote) return
    runAction('disconnect', async () => unwrap(await withTimeout(remote.remoteDisconnect(), RPC_TIMEOUT_MS, 'disconnect')))
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
          <div style={{ marginBottom: 8 }}>CPU: {status?.cpuState === 'halted' ? '已暂停' : status?.cpuState === 'running' ? '运行中' : '—'}</div>
          <div style={{ marginBottom: 4, fontSize: 11, opacity: 0.7 }}>
            Remote RPC: {remoteOk === null ? '检测中…' : remoteOk ? '正常' : '不可用'}
          </div>
          {errorText && <div style={{ color: '#ff3b30', fontSize: 11, marginBottom: 6, wordBreak: 'break-all' }}>{errorText}</div>}
          {status?.error && <div style={{ color: '#ff3b30', marginBottom: 4 }}>{status.error}</div>}
          {st === 'disconnected' || st === 'error' ? (
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input name="jlink-chip" value={chipInput} onChange={(e) => setChipInput(e.target.value)} placeholder="芯片名（可选，留空=通用内核）" style={inputStyle} />
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 6 }}>
            {st !== 'connected' ? (
              <button type="button" disabled={busy} onClick={doConnect} style={{ flex: 1 }}>{busy ? '连接中…' : '连接'}</button>
            ) : (
              <button type="button" disabled={busy} onClick={doDisconnect} style={{ flex: 1 }}>断开</button>
            )}
            <button type="button" disabled={busy || st !== 'connected'} onClick={() => runAction('halt', async () => unwrap(await withTimeout(getJlinkRemote()!.remoteHalt(), RPC_TIMEOUT_MS, 'halt')))}>暂停</button>
            <button type="button" disabled={busy || st !== 'connected'} onClick={() => runAction('run', async () => unwrap(await withTimeout(getJlinkRemote()!.remoteRun(), RPC_TIMEOUT_MS, 'run')))}>运行</button>
            <button type="button" disabled={busy || st !== 'connected'} onClick={() => runAction('reset', async () => unwrap(await withTimeout(getJlinkRemote()!.remoteReset(), RPC_TIMEOUT_MS, 'reset')))}>复位</button>
          </div>
        </div>
      )}
    </div>
  )
}
