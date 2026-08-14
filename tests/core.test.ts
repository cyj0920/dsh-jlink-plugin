/** JLinkCore state machine tests with MockDriver / 核心状态机测试. */
import { describe, expect, it } from 'vitest'
import { Config } from '../src/config'
import { JLinkCore } from '../src/core'
import { MockDriver } from '../src/driver/mock'
import { ErrorCodes } from '../src/errors'

function makeCore(): JLinkCore {
  const config = Config.parse({ driver: 'mock', maxMemoryReadSize: 65536 })
  return new JLinkCore(new MockDriver(), config)
}

describe('JLinkCore lifecycle', () => {
  it('starts disconnected; memory access fails with JLINK_NOT_CONNECTED', async () => {
    const core = makeCore()
    expect(core.getState().status).toBe('disconnected')
    const res = await core.readMemory(0x20000000, 4)
    expect(res.success).toBe(false)
    expect(res.error?.code).toBe(ErrorCodes.NOT_CONNECTED)
  })

  it('connect transitions to connected and exposes status view', async () => {
    const core = makeCore()
    const res = await core.connect({ interfaceKind: 'JTAG', chip: 'FC7300F4MDDxXxxxT1C' })
    expect(res.success).toBe(true)
    expect(core.getState().status).toBe('connected')
    expect(core.statusView().connected).toBe(true)
    expect(core.statusView().chip).toBe('FC7300F4MDDxXxxxT1C')
  })

  it('halt then read_memory then write_memory round-trip', async () => {
    const core = makeCore()
    await core.connect({})
    const h = await core.halt()
    expect(h.success).toBe(true)
    expect(core.statusView().cpuState).toBe('halted')

    await core.writeMemory(0x20000000, new Uint8Array([0x11, 0x22, 0x33, 0x44]))
    const r = await core.readMemory(0x20000000, 4)
    expect(r.success).toBe(true)
    expect(Array.from(r.data ?? [])).toEqual([0x11, 0x22, 0x33, 0x44])
  })

  it('running CPU blocks memory access with JLINK_NOT_HALTED', async () => {
    const core = makeCore()
    await core.connect({})
    await core.run()
    const res = await core.readMemory(0x20000000, 4)
    expect(res.success).toBe(false)
    expect(res.error?.code).toBe(ErrorCodes.NOT_HALTED)
  })

  it('flash program + verify cycle with progress events', async () => {
    const core = makeCore()
    await core.connect({})
    await core.halt()
    const data = new Uint8Array([1, 2, 3, 4, 5])
    const p = await core.programFlash(0x08000000, data, true)
    expect(p.success).toBe(true)
    const v = await core.verifyFlash(0x08000000, data)
    expect(v.success).toBe(true)
    const progress = core.getFlashProgress()
    expect(progress?.phase).toBe('idle')
    expect(progress?.percent).toBe(100)
  })

  it('breakpoint set/clear lifecycle', async () => {
    const core = makeCore()
    await core.connect({})
    const s = await core.setBreakpoint(0x08000100)
    expect(s.success).toBe(true)
    expect(core.getBreakpoints()).toHaveLength(1)
    const c = await core.clearBreakpoint(0x08000100)
    expect(c.success).toBe(true)
    expect(core.getBreakpoints()).toHaveLength(0)
    const missing = await core.clearBreakpoint(0x08000100)
    expect(missing.success).toBe(false)
  })

  it('RTT mock stream returns incrementing lines', async () => {
    const core = makeCore()
    await core.connect({})
    const start = await core.rttStart(1024)
    expect(start.success).toBe(true)
    const r1 = await core.rttRead(0)
    expect(r1.success).toBe(true)
    expect((r1.data?.lines ?? []).length).toBeGreaterThan(0)
    expect(r1.data?.active).toBe(true)
    const r2 = await core.rttRead(r1.data?.since ?? 0)
    expect(r2.success).toBe(true)
  })
})
