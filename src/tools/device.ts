/** Device information tools (port of tools/device_info.py) / 设备信息工具. */
import type { Context } from '@deepseek-ai/cordis'
import type { JLinkService } from '../service'
import type { PatchRegistry } from '../patch/registry'
import { envelopeSchema, registerTool, renderEnvelope, tool } from './defs'

/** Register device info tools / 注册设备信息工具. */
export function registerDeviceTools(ctx: Context, svc: JLinkService, patches: PatchRegistry): void {
  registerTool(ctx, tool({
    name: 'get_target_info',
    description: '获取目标芯片信息（名称/内核/Flash/RAM/电压） / Get target device information.',
    parameters: { type: 'object', properties: {}, required: [] },
    output: { schema: envelopeSchema, render: renderEnvelope },
    async execute() {
      return svc.getTargetInfo()
    },
  }))

  registerTool(ctx, tool({
    name: 'get_target_voltage',
    description: '获取目标芯片供电电压 / Get target supply voltage.',
    parameters: { type: 'object', properties: {}, required: [] },
    output: { schema: envelopeSchema, render: renderEnvelope },
    async execute() {
      const res = await svc.getTargetVoltage()
      if (!res.success) return res
      return { success: true, data: { voltage: res.data }, message: 'ok', error: null }
    },
  }))

  registerTool(ctx, tool({
    name: 'scan_target_devices',
    description: '扫描目标总线上的设备 / Scan devices on the target bus.',
    parameters: { type: 'object', properties: {}, required: [] },
    output: { schema: envelopeSchema, render: renderEnvelope },
    async execute() {
      const res = await svc.scanTargetDevices()
      if (!res.success) return res
      return { success: true, data: { devices: res.data }, message: 'ok', error: null }
    },
  }))

  registerTool(ctx, tool({
    name: 'list_device_patches',
    description: '列出已加载的设备补丁及支持设备 / List loaded device patches.',
    parameters: { type: 'object', properties: {}, required: [] },
    output: { schema: envelopeSchema, render: renderEnvelope },
    async execute() {
      return { success: true, data: { patches: patches.getPatchInfo(), supported: patches.getAllDeviceNames() }, message: 'ok', error: null }
    },
  }))
}
