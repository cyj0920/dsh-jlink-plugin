/** Connection management tools (port of tools/connection.py) / 连接管理工具. */
import type { Context } from '@deepseek-ai/cordis'
import type { JLinkService } from '../service'
import type { PatchRegistry } from '../patch/registry'
import { envelopeSchema, registerTool, renderEnvelope, tool } from './defs'

interface ConnectArgs {
  serial?: string
  interface?: 'SWD' | 'JTAG'
  chip_name?: string
}

/** Register connection tools / 注册连接工具. */
export function registerConnectionTools(ctx: Context, svc: JLinkService, patches: PatchRegistry): void {
  registerTool(ctx, tool({
    name: 'list_jlink_devices',
    description: '列出所有已连接的 JLink 设备 / List all connected JLink devices.',
    parameters: { type: 'object', properties: {}, required: [] },
    output: { schema: envelopeSchema, render: renderEnvelope },
    async execute() {
      const res = await svc.listDevices()
      if (!res.success) return res
      return { success: true, data: { devices: res.data, count: res.data?.length ?? 0 }, message: 'ok', error: null }
    },
  }))

  registerTool(ctx, tool({
    name: 'connect_device',
    description: '连接到 JLink 设备；不指定 serial 时连接第一个可用设备 / Connect to a JLink device.',
    parameters: {
      type: 'object',
      properties: {
        serial: { type: 'string' },
        interface: { type: 'string', enum: ['SWD', 'JTAG'] },
        chip_name: { type: 'string' },
      },
      required: [],
    },
    output: { schema: envelopeSchema, render: renderEnvelope },
    async execute(args) {
      const a = args as ConnectArgs
      return svc.connect({
        serial: a.serial,
        interfaceKind: a.interface,
        chip: a.chip_name,
      })
    },
  }))

  registerTool(ctx, tool({
    name: 'disconnect_device',
    description: '断开当前 JLink 连接 / Disconnect the active JLink device.',
    parameters: { type: 'object', properties: {}, required: [] },
    output: { schema: envelopeSchema, render: renderEnvelope },
    async execute() {
      return svc.disconnect()
    },
  }))

  registerTool(ctx, tool({
    name: 'get_connection_status',
    description: '查询连接状态（状态/芯片/电压/错误） / Get current connection status.',
    parameters: { type: 'object', properties: {}, required: [] },
    output: { schema: envelopeSchema, render: renderEnvelope },
    async execute() {
      return { success: true, data: svc.statusView(), message: 'ok', error: null }
    },
  }))

  registerTool(ctx, tool({
    name: 'match_chip_name',
    description: '智能匹配芯片名称（精确/前缀/包含/模糊），如 FC7300F4MDD -> FC7300F4MDDxXxxxT1C / Match a chip name.',
    parameters: { type: 'object', properties: { chip_name: { type: 'string' } }, required: ['chip_name'] },
    output: { schema: envelopeSchema, render: renderEnvelope },
    async execute(args) {
      const a = args as { chip_name: string }
      const hit = patches.matchDeviceName(a.chip_name)
      return {
        success: true,
        data: {
          matched: hit ? hit[0] : null,
          patch_vendor: hit ? hit[1].vendorName : null,
          all_matches: patches.findSimilarDevices(a.chip_name, 10),
          suggestions: patches.getDeviceNameSuggestions(a.chip_name),
        },
        message: hit ? 'matched: ' + hit[0] : 'no match',
        error: null,
      }
    },
  }))
}
