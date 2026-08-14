/** Remote spec consistency: every descriptor must resolve to a service method whose result passes its schema. */
import { describe, expect, it } from 'vitest'
import { JlinkHostContribution } from '../src/remote-spec'
import { JLinkService } from '../src/service'
import { Config } from '../src/config'
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'

function methodNameOf(desc: InvocationDescriptor): string {
  return desc.method
}

describe('remote spec consistency', () => {
  const config = Config.parse({ driver: 'mock' })

  it('every descriptor method exists on JLinkService', () => {
    for (const desc of JlinkHostContribution.invocations) {
      const name = methodNameOf(desc)
      expect(typeof (JLinkService.prototype as unknown as Record<string, unknown>)[name], name).toBe('function')
    }
  })

  it('status/action endpoints return values that pass their declared schemas', async () => {
    // Build a real service with the mock driver (no cordis context needed for pure methods).
    const ctx = { reflect: { provide() {} } } as never
    const svc = new JLinkService(ctx, config)

    const status = await svc.status()
    const statusDesc = JlinkHostContribution.invocations.find((d) => d.method === 'status')!
    const statusSchema = (statusDesc.result as { schema: { parse(v: unknown): unknown } }).schema
    expect(statusSchema.parse(status)).toEqual(status)

    const connect = await svc.remoteConnect({ chip: 'FC7300F4MDDxXxxxT1C' })
    expect(connect.connected).toBe(true)
    const connectDesc = JlinkHostContribution.invocations.find((d) => d.method === 'remoteConnect')!
    expect((connectDesc.result as { schema: { parse(v: unknown): unknown } }).schema.parse(connect)).toEqual(connect)

    const halt = await svc.remoteHalt()
    expect(halt.cpuState).toBe('halted')
    const run = await svc.remoteRun()
    expect(run.cpuState).toBe('running')
    const reset = await svc.remoteReset()
    expect(reset.connected).toBe(true)
    const disconnect = await svc.remoteDisconnect()
    expect(disconnect.connected).toBe(false)

    for (const desc of JlinkHostContribution.invocations) {
      if (['status', 'remoteConnect', 'remoteDisconnect', 'remoteHalt', 'remoteRun', 'remoteReset'].includes(desc.method)) {
        const schema = (desc.result as { schema: { parse(v: unknown): unknown } }).schema
        const probe = desc.method === 'remoteConnect' ? connect : desc.method === 'status' ? status : desc.method === 'remoteDisconnect' ? disconnect : halt
        expect(() => schema.parse(probe), desc.id).not.toThrow()
      }
    }
  })

  it('wire namespaces and endpoint ids are stable and unique', () => {
    const ids = JlinkHostContribution.invocations.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const d of JlinkHostContribution.invocations) {
      expect(d.namespace).toBe('jlink')
    }
  })
})
