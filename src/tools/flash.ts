/** Flash tools (port of tools/flash.py) / Flash 操作工具. */
import type { Context } from '@deepseek-ai/cordis'
import type { JLinkService } from '../service'
import { fail, hexToBytes } from '../utils'
import { ErrorCodes } from '../errors'
import { envelopeSchema, registerTool, renderEnvelope, tool } from './defs'

interface RangeArgs {
  start_address: number
  end_address: number
}

interface ProgramArgs {
  address: number
  data: string
  verify?: boolean
}

/** Register flash tools / 注册 Flash 工具. */
export function registerFlashTools(ctx: Context, svc: JLinkService): void {
  registerTool(ctx, tool({
    name: 'erase_flash',
    description: '擦除 Flash 扇区区间 / Erase a flash sector range.',
    parameters: {
      type: 'object',
      properties: {
        start_address: { type: 'integer', minimum: 0 },
        end_address: { type: 'integer', minimum: 0 },
      },
      required: ['start_address', 'end_address'],
    },
    output: { schema: envelopeSchema, render: renderEnvelope },
    timeoutMs: 300000,
    async execute(args) {
      const a = args as RangeArgs
      if (!Number.isInteger(a.start_address) || !Number.isInteger(a.end_address)) {
        return fail('addresses must be integers', ErrorCodes.INVALID_PARAMETER)
      }
      const res = await svc.eraseFlash(a.start_address, a.end_address)
      if (!res.success) return res
      return {
        success: true,
        data: { start_address: a.start_address, end_address: a.end_address, progress: svc.getFlashProgress() },
        message: 'flash erased',
        error: null,
      }
    },
  }))

  registerTool(ctx, tool({
    name: 'program_flash',
    description: '烧录 Flash（data 为十六进制字符串；verify 默认 true 校验） / Program flash.',
    parameters: {
      type: 'object',
      properties: {
        address: { type: 'integer', minimum: 0 },
        data: { type: 'string' },
        verify: { type: 'boolean' },
      },
      required: ['address', 'data'],
    },
    output: { schema: envelopeSchema, render: renderEnvelope },
    timeoutMs: 300000,
    async execute(args) {
      const a = args as ProgramArgs
      if (!Number.isInteger(a.address)) return fail('address must be an integer', ErrorCodes.INVALID_PARAMETER)
      let bytes: Uint8Array
      try {
        bytes = hexToBytes(a.data)
      } catch (e) {
        return fail('invalid hex data: ' + (e as Error).message, ErrorCodes.INVALID_PARAMETER)
      }
      const res = await svc.programFlash(a.address, bytes, a.verify ?? true)
      if (!res.success) return res
      return {
        success: true,
        data: { address: a.address, length: bytes.length, verified: a.verify ?? true, progress: svc.getFlashProgress() },
        message: 'programmed and verified',
        error: null,
      }
    },
  }))

  registerTool(ctx, tool({
    name: 'verify_flash',
    description: '校验 Flash 内容（data 为十六进制字符串） / Verify flash content.',
    parameters: {
      type: 'object',
      properties: {
        address: { type: 'integer', minimum: 0 },
        data: { type: 'string' },
      },
      required: ['address', 'data'],
    },
    output: { schema: envelopeSchema, render: renderEnvelope },
    timeoutMs: 120000,
    async execute(args) {
      const a = args as Omit<ProgramArgs, 'verify'>
      if (!Number.isInteger(a.address)) return fail('address must be an integer', ErrorCodes.INVALID_PARAMETER)
      let bytes: Uint8Array
      try {
        bytes = hexToBytes(a.data)
      } catch (e) {
        return fail('invalid hex data: ' + (e as Error).message, ErrorCodes.INVALID_PARAMETER)
      }
      const res = await svc.verifyFlash(a.address, bytes)
      if (!res.success) return res
      return { success: true, data: { address: a.address, length: bytes.length, verified: true }, message: 'verify ok', error: null }
    },
  }))
}
