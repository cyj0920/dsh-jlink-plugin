/** Hand-written Typert contributions (D4). Shapes verified against dsh-goal generated artifacts. */
import { z } from 'zod'
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types'

const statusResultSchema = z
  .object({
    connected: z.boolean(),
    status: z.enum(['disconnected', 'connecting', 'connected', 'error']),
    chip: z.string().nullable(),
    core: z.string().nullable(),
    voltage: z.number().nullable(),
    cpuState: z.enum(['halted', 'running', 'unknown']).nullable(),
    error: z.string().nullable(),
    lastChangedAt: z.number(),
  })
  .readonly()

const rttReadResultSchema = z
  .object({
    since: z.number(),
    lines: z.array(z.object({ seq: z.number(), text: z.string(), at: z.number() })),
    active: z.boolean(),
  })
  .readonly()

const deviceNamesResultSchema = z.array(z.string()).readonly()

function descriptor(id: string, method: string, params: InvocationDescriptor['parameters'], result: InvocationDescriptor['result']): InvocationDescriptor {
  return {
    id,
    service: 'jlink',
    namespace: 'jlink',
    method,
    invocation: { kind: 'direct' },
    parameters: params,
    result,
    sourceLocation: { file: 'src/remote-spec.ts', line: 0, column: 0 },
  }
}

const statusDesc = descriptor('@can/dsh-jlink#jlink/status', 'status', [], {
  mode: 'strict',
  typeSymbol: '@can/dsh-jlink/types#JlinkStatusView',
  schema: statusResultSchema,
})

const haltDesc = descriptor('@can/dsh-jlink#jlink/halt', 'remoteHalt', [], {
  mode: 'strict',
  typeSymbol: '@can/dsh-jlink/types#JlinkStatusView',
  schema: statusResultSchema,
})

const runDesc = descriptor('@can/dsh-jlink#jlink/run', 'remoteRun', [], {
  mode: 'strict',
  typeSymbol: '@can/dsh-jlink/types#JlinkStatusView',
  schema: statusResultSchema,
})

const resetDesc = descriptor('@can/dsh-jlink#jlink/reset', 'remoteReset', [], {
  mode: 'strict',
  typeSymbol: '@can/dsh-jlink/types#JlinkStatusView',
  schema: statusResultSchema,
})

const connectDesc = descriptor(
  '@can/dsh-jlink#jlink/connect',
  'remoteConnect',
  [
    { name: 'interfaceKind', wire: 'interfaceKind', source: 'json', codec: { mode: 'strict', typeSymbol: 'string', schema: z.string().optional() } },
    { name: 'chip', wire: 'chip', source: 'json', codec: { mode: 'strict', typeSymbol: 'string', schema: z.string().optional() } },
    { name: 'core', wire: 'core', source: 'json', codec: { mode: 'strict', typeSymbol: 'string', schema: z.string().optional() } },
  ],
  {
    mode: 'strict',
    typeSymbol: '@can/dsh-jlink/types#JlinkStatusView',
    schema: statusResultSchema,
  },
)

const disconnectDesc = descriptor('@can/dsh-jlink#jlink/disconnect', 'remoteDisconnect', [], {
  mode: 'strict',
  typeSymbol: '@can/dsh-jlink/types#JlinkStatusView',
  schema: statusResultSchema,
})

const rttReadDesc = descriptor(
  '@can/dsh-jlink#jlink/rttRead',
  'rttRead',
  [
    {
      name: 'since',
      wire: 'since',
      source: 'json',
      codec: { mode: 'strict', typeSymbol: 'number', schema: z.number() },
    },
  ],
  {
    mode: 'strict',
    typeSymbol: '@can/dsh-jlink/types#RttReadView',
    schema: rttReadResultSchema,
  },
)

const deviceNamesDesc = descriptor('@can/dsh-jlink#jlink/deviceNames', 'deviceNames', [], {
  mode: 'strict',
  typeSymbol: '@can/dsh-jlink/types#stringArray',
  schema: deviceNamesResultSchema,
})

export const JlinkInvocations: readonly InvocationDescriptor[] = [
  statusDesc,
  connectDesc,
  disconnectDesc,
  haltDesc,
  runDesc,
  resetDesc,
  rttReadDesc,
  deviceNamesDesc,
]

/** Host contribution registered via ctx.typert.register / Host 面贡献. */
export const JlinkHostContribution: TypertContribution = {
  package: '@can/dsh-jlink',
  face: 'host',
  schemas: [],
  invocations: JlinkInvocations,
  model: {
    services: [
      {
        key: 'jlink',
        exportName: 'JLinkService',
        summary: 'J-Link debug service (ctx.jlink).',
        description: 'J-Link debug service (ctx.jlink).',
        tags: [],
        jsDoc: '/** J-Link debug service (ctx.jlink). */',
        members: [
          { kind: 'method', name: 'status', signature: 'status(): Promise<JlinkStatusView>', summary: 'Current connection status view.', jsDoc: '' },
          { kind: 'method', name: 'halt', signature: 'halt(): Promise<JlinkStatusView>', summary: 'Halt CPU and return status view.', jsDoc: '' },
          { kind: 'method', name: 'run', signature: 'run(): Promise<JlinkStatusView>', summary: 'Run CPU and return status view.', jsDoc: '' },
          { kind: 'method', name: 'reset', signature: 'reset(): Promise<JlinkStatusView>', summary: 'Reset target and return status view.', jsDoc: '' },
          { kind: 'method', name: 'rttRead', signature: 'rttRead(since: number): Promise<RttReadView>', summary: 'Read RTT lines since a sequence number.', jsDoc: '' },
          { kind: 'method', name: 'deviceNames', signature: 'deviceNames(): Promise<string[]>', summary: 'All known chip names from the patch registry.', jsDoc: '' },
        ],
        types: [],
      },
    ],
    events: [],
    objects: [],
  },
}

/** Client contribution mounted via ctx.remote.$mount (TYPERT_REMOTE shape: package + descriptors). */
export const JlinkRemoteContribution: {
  package: string
  descriptors: readonly InvocationDescriptor[]
} = {
  package: '@can/dsh-jlink',
  descriptors: JlinkInvocations,
}
