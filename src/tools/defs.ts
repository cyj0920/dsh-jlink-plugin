/** Tool registration helpers / 工具注册助手. */
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'

/** Typed tool definition matching ctx.tools.register / 工具定义类型. */
export type { ToolDefinition }

/** Canonical envelope schema (H1: every tool declares output.schema + render) / 统一信封 Schema. */
export const envelopeSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {},
    message: { type: 'string' },
    error: {},
  },
  additionalProperties: true,
} as const

/** Default text render for the envelope / 默认信封渲染. */
export function renderEnvelope(_args: unknown, value: unknown): ContentBlock[] {
  const v = value as { success?: boolean; data?: unknown; message?: string; error?: { code?: string; message?: string } | null }
  if (v?.success) {
    const dataText =
      typeof v.data === 'string'
        ? v.data
        : v.data == null
          ? ''
          : JSON.stringify(v.data, null, 2)
    return [{ type: 'text', text: dataText || (v.message ?? 'ok') }]
  }
  const code = v?.error?.code ?? 'JLINK_ERROR'
  const msg = v?.error?.message ?? v?.message ?? 'failed'
  return [{ type: 'text', text: 'error[' + code + ']: ' + msg }]
}

/** Identity helper so definition literals are type-checked against ToolDefinition / 类型校验助手. */
export function tool(def: ToolDefinition): ToolDefinition {
  return def
}

/** Register a tool on a context / 注册工具. */
export function registerTool(ctx: Context, def: ToolDefinition): void {
  ctx.tools.register(def)
}
