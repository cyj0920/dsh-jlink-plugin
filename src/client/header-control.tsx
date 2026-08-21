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
const chipListStyle: React.CSSProperties = {
  position: 'absolute', zIndex: 40, top: '100%', left: 0, right: 0, marginTop: 2,
  background: '#fff', border: '1px solid #ccc', borderRadius: 4,
  maxHeight: 160, overflowY: 'auto', boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
}
const chipCaptionStyle: React.CSSProperties = {
  padding: '3px 8px', fontSize: 10, opacity: 0.6, borderBottom: '1px solid #eee',
  position: 'sticky', top: 0, background: '#fff',
}
const chipItemBase: React.CSSProperties = {
  padding: '5px 8px', fontSize: 12, cursor: 'pointer', fontFamily: 'monospace',
}

export function JlinkHeaderControl(_props: Record<string, unknown>): JSX.Element {
  const [status, setStatus] = useState<JlinkStatusView | null>(null)
  const [open, setOpen] = useState(false)
  const [chipInput, setChipInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [remoteOk, setRemoteOk] = useState<boolean | null>(null)
  const [interfaceKind, setInterfaceKind] = useState<'SWD' | 'JTAG'>('JTAG')
  const [chipOptions, setChipOptions] = useState<string[] | null>(null)
  const [listOpen, setListOpen] = useState(false)
  const [hovered, setHovered] = useState<number | null>(null)

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

  // Lazy-load the chip name list once per panel open / 面板打开时拉取芯片名单.
  useEffect(() => {
    if (!open || chipOptions !== null) return
    const remote = getJlinkRemote()
    if (!remote) return
    void withTimeout(remote.deviceNames(), RPC_TIMEOUT_MS, 'deviceNames')
      .then((r) => unwrap(r))
      .then((names) => setChipOptions([...names].sort((a, b) => a.localeCompare(b))))
      .catch((e) => {
        console.warn('[dsh-jlink] deviceNames failed:', e)
        setChipOptions([]) // keep free-text entry usable even without the list
      })
  }, [open, chipOptions])

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
    setListOpen(false)
    const chip = chipInput.trim()  // '' => generic-core fallback in the driver
    // The gateway requires ALL descriptor fields present in args (undefined is dropped).
    runAction('connect', async () => unwrap(await withTimeout(remote.remoteConnect(interfaceKind, chip, 'Cortex-M4'), RPC_TIMEOUT_MS, 'connect')))
  }
  const doDisconnect = (): void => {
    const remote = getJlinkRemote()
    if (!remote) return
    runAction('disconnect', async () => unwrap(await withTimeout(remote.remoteDisconnect(), RPC_TIMEOUT_MS, 'disconnect')))
  }

  const st = status?.status ?? 'disconnected'
  const color = STATUS_COLOR[st]
  // Chip vs identified core: a generic-core connect reports the auto-identified
  // core instead of a fake chip name / 芯片与内核分开，通用连接显示自动识别的内核.
  const chipLine = status?.chip
    ? status.core && status.core !== status.chip ? status.chip + ' · ' + status.core : status.chip
    : status?.core ? '未指定芯片（识别: ' + status.core + '）' : '—'
  const title = STATUS_TEXT[st] + (status?.error ? ': ' + status.error : '')

  // Chip dropdown filter: case-insensitive substring on the typed text / 下拉过滤.
  const needle = chipInput.trim().toLowerCase()
  const allChips = chipOptions ?? []
  const filteredChips = (needle ? allChips.filter((n) => n.toLowerCase().includes(needle)) : allChips).slice(0, 50)

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <button type="button" title={title} aria-label={title} onClick={() => setOpen((v) => !v)} style={pillStyle}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block', flex: 'none' }} />
        <span style={{ fontSize: 12 }}>J-Link</span>
      </button>
      {open && (
        <div style={panelStyle}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>J-Link · {STATUS_TEXT[st]}</div>
          <div style={{ marginBottom: 4 }}>芯片: {chipLine}</div>
          <div style={{ marginBottom: 4 }}>电压: {status?.voltage != null ? status.voltage.toFixed(2) + ' V' : '—'}</div>
          <div style={{ marginBottom: 8 }}>CPU: {status?.cpuState === 'halted' ? '已暂停' : status?.cpuState === 'running' ? '运行中' : '—'}</div>
          <div style={{ marginBottom: 4, fontSize: 11, opacity: 0.7 }}>
            Remote RPC: {remoteOk === null ? '检测中…' : remoteOk ? '正常' : '不可用'}
          </div>
          {errorText && <div style={{ color: '#ff3b30', fontSize: 11, marginBottom: 6, wordBreak: 'break-all' }}>{errorText}</div>}
          {status?.error && <div style={{ color: '#ff3b30', marginBottom: 4 }}>{status.error}</div>}
          {st === 'disconnected' || st === 'error' ? (
            <div style={{ marginBottom: 8 }}>
              <div style={{ position: 'relative' }}>
                <input
                  name="jlink-chip"
                  value={chipInput}
                  onChange={(e) => { setChipInput(e.target.value); setListOpen(true); setHovered(null) }}
                  onFocus={() => setListOpen(true)}
                  onKeyDown={(e) => { if (e.key === 'Escape') setListOpen(false) }}
                  placeholder="芯片名（可选，留空=通用内核）"
                  style={inputStyle}
                  autoComplete="off"
                />
                {listOpen && filteredChips.length > 0 && (
                  <div style={chipListStyle}>
                    <div style={chipCaptionStyle}>
                      共 {filteredChips.length} 款{needle ? '（过滤自 ' + allChips.length + '）' : ''} · 点击选择
                    </div>
                    {filteredChips.map((n, idx) => (
                      <div
                        key={n}
                        style={idx === hovered ? { ...chipItemBase, background: '#eef4ff' } : chipItemBase}
                        onMouseEnter={() => setHovered(idx)}
                        onMouseLeave={() => setHovered(null)}
                        // mousedown fires before input blur, so the pick always lands / 先于 blur 触发
                        onMouseDown={() => { setChipInput(n); setListOpen(false); setHovered(null) }}
                      >
                        {n}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <span style={{ fontSize: 11, opacity: 0.7 }}>接口</span>
                <select
                  value={interfaceKind}
                  onChange={(e) => setInterfaceKind(e.target.value === 'SWD' ? 'SWD' : 'JTAG')}
                  style={{ ...inputStyle, width: 84 }}
                >
                  <option value="SWD">SWD</option>
                  <option value="JTAG">JTAG</option>
                </select>
                <span style={{ fontSize: 11, opacity: 0.55 }}>
                  {chipOptions === null ? '芯片名单加载中…' : '库内 ' + chipOptions.length + ' 款'}
                </span>
              </div>
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
