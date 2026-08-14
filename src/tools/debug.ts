/** Debug control tools (port of tools/debug.py) / 调试控制工具. */
import type { Context } from '@deepseek-ai/cordis'
import type { JLinkService } from '../service'
import { fail } from '../utils'
import { ErrorCodes } from '../errors'
import { envelopeSchema, registerTool, renderEnvelope, tool } from './defs'

interface AddressArgs {
  address: number
}

/** Register debug tools / 注册调试工具. */
export function registerDebugTools(ctx: Context, svc: JLinkService): void {
  registerTool(ctx, tool({
    name: 'reset_target',
    description: '复位目标设备 / Reset the target device.',
    parameters: { type: 'object', properties: {}, required: [] },
    output: { schema: envelopeSchema, render: renderEnvelope },
    timeoutMs: 10000,
    async execute() {
      return svc.reset()
    },
  }))

  registerTool(ctx, tool({
    name: 'halt_cpu',
    description: '暂停 CPU（读取寄存器/内存前必须执行） / Halt the CPU.',
    parameters: { type: 'object', properties: {}, required: [] },
    output: { schema: envelopeSchema, render: renderEnvelope },
    timeoutMs: 5000,
    async execute() {
      return svc.halt()
    },
  }))

  registerTool(ctx, tool({
    name: 'run_cpu',
    description: '运行 CPU / Run the CPU.',
    parameters: { type: 'object', properties: {}, required: [] },
    output: { schema: envelopeSchema, render: renderEnvelope },
    timeoutMs: 5000,
    async execute() {
      return svc.run()
    },
  }))

  registerTool(ctx, tool({
    name: 'step_instruction',
    description: '单步执行一条指令（CPU 必须已 halt） / Step one instruction.',
    parameters: { type: 'object', properties: {}, required: [] },
    output: { schema: envelopeSchema, render: renderEnvelope },
    timeoutMs: 5000,
    async execute() {
      return svc.stepInstruction()
    },
  }))

  registerTool(ctx, tool({
    name: 'get_cpu_state',
    description: '获取 CPU 状态（halted/running） / Get CPU state.',
    parameters: { type: 'object', properties: {}, required: [] },
    output: { schema: envelopeSchema, render: renderEnvelope },
    timeoutMs: 5000,
    async execute() {
      return svc.getCpuState()
    },
  }))

  registerTool(ctx, tool({
    name: 'set_breakpoint',
    description: '设置硬件断点 / Set a hardware breakpoint.',
    parameters: {
      type: 'object',
      properties: { address: { type: 'integer', minimum: 0 } },
      required: ['address'],
    },
    output: { schema: envelopeSchema, render: renderEnvelope },
    timeoutMs: 5000,
    async execute(args) {
      const a = args as AddressArgs
      if (!Number.isInteger(a.address)) return fail('address must be an integer', ErrorCodes.INVALID_PARAMETER)
      return svc.setBreakpoint(a.address)
    },
  }))

  registerTool(ctx, tool({
    name: 'clear_breakpoint',
    description: '清除硬件断点 / Clear a hardware breakpoint.',
    parameters: {
      type: 'object',
      properties: { address: { type: 'integer', minimum: 0 } },
      required: ['address'],
    },
    output: { schema: envelopeSchema, render: renderEnvelope },
    timeoutMs: 5000,
    async execute(args) {
      const a = args as AddressArgs
      if (!Number.isInteger(a.address)) return fail('address must be an integer', ErrorCodes.INVALID_PARAMETER)
      return svc.clearBreakpoint(a.address)
    },
  }))
}
