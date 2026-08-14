/** Memory tools (port of tools/memory.py) / 内存操作工具. */
import type { Context } from '@deepseek-ai/cordis'
import type { JLinkService } from '../service'
import { bytesToHex, fail, hexToBytes, hexdump } from '../utils'
import { ErrorCodes } from '../errors'
import { envelopeSchema, registerTool, renderEnvelope, tool } from './defs'

interface ReadMemoryArgs {
  address: number
  length: number
}

interface WriteMemoryArgs {
  address: number
  data: string
}

interface ReadRegistersArgs {
  names?: string[]
}

interface WriteRegisterArgs {
  name: string
  value: number
}

/** Register memory tools / 注册内存工具. */
export function registerMemoryTools(ctx: Context, svc: JLinkService): void {
  registerTool(ctx, tool({
    name: 'read_memory',
    description: '读取目标内存（读取前 CPU 必须已 halt；未 halt 返回 JLINK_NOT_HALTED） / Read target memory.',
    parameters: {
      type: 'object',
      properties: {
        address: { type: 'integer', minimum: 0 },
        length: { type: 'integer', minimum: 1, maximum: 65536 },
      },
      required: ['address', 'length'],
    },
    output: { schema: envelopeSchema, render: renderEnvelope },
    timeoutMs: 15000,
    async execute(args) {
      const a = args as ReadMemoryArgs
      if (!Number.isInteger(a.address) || !Number.isInteger(a.length)) {
        return fail('address/length must be integers', ErrorCodes.INVALID_PARAMETER)
      }
      const res = await svc.readMemory(a.address, a.length)
      if (!res.success || !res.data) return res
      return {
        success: true,
        data: { address: a.address, length: a.length, bytes: bytesToHex(res.data), hex: hexdump(res.data, a.address) },
        message: 'read ' + a.length + ' bytes @ 0x' + a.address.toString(16),
        error: null,
      }
    },
  }))

  registerTool(ctx, tool({
    name: 'write_memory',
    description: '写入目标内存（data 为十六进制字符串；写入前 CPU 必须已 halt） / Write target memory.',
    parameters: {
      type: 'object',
      properties: {
        address: { type: 'integer', minimum: 0 },
        data: { type: 'string' },
      },
      required: ['address', 'data'],
    },
    output: { schema: envelopeSchema, render: renderEnvelope },
    timeoutMs: 15000,
    async execute(args) {
      const a = args as WriteMemoryArgs
      if (!Number.isInteger(a.address)) return fail('address must be an integer', ErrorCodes.INVALID_PARAMETER)
      let bytes: Uint8Array
      try {
        bytes = hexToBytes(a.data)
      } catch (e) {
        return fail('invalid hex data: ' + (e as Error).message, ErrorCodes.INVALID_PARAMETER)
      }
      const res = await svc.writeMemory(a.address, bytes)
      if (!res.success) return res
      return { success: true, data: { address: a.address, length: bytes.length }, message: 'wrote ' + bytes.length + ' bytes', error: null }
    },
  }))

  registerTool(ctx, tool({
    name: 'read_registers',
    description: '读取 CPU 寄存器（读取前 CPU 必须已 halt） / Read CPU registers.',
    parameters: {
      type: 'object',
      properties: { names: { type: 'array', items: { type: 'string' } } },
      required: [],
    },
    output: { schema: envelopeSchema, render: renderEnvelope },
    timeoutMs: 10000,
    async execute(args) {
      const a = args as ReadRegistersArgs
      return svc.readRegisters(a.names)
    },
  }))

  registerTool(ctx, tool({
    name: 'write_register',
    description: '写入寄存器（写入前 CPU 必须已 halt） / Write a CPU register.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        value: { type: 'integer' },
      },
      required: ['name', 'value'],
    },
    output: { schema: envelopeSchema, render: renderEnvelope },
    timeoutMs: 10000,
    async execute(args) {
      const a = args as WriteRegisterArgs
      if (!Number.isInteger(a.value)) return fail('value must be an integer', ErrorCodes.INVALID_PARAMETER)
      const res = await svc.writeRegister(a.name, a.value)
      if (!res.success) return res
      return { success: true, data: { name: a.name, value: a.value }, message: 'register ' + a.name + ' = ' + a.value, error: null }
    },
  }))
}
