/** Defensive extraction of the canonical tool result from slot props / 工具结果防御性提取. */
export function extractResult(props: Record<string, unknown>): unknown {
  const candidate = props['result'] ?? props['value'] ?? props
  if (candidate && typeof candidate === 'object') {
    const obj = candidate as { structuredContent?: unknown; content?: unknown; data?: unknown }
    if (obj.structuredContent !== undefined) return obj.structuredContent
    if (obj.data !== undefined) return obj.data
    if (Array.isArray(obj.content) && obj.content.length > 0) {
      const first = obj.content[0] as { type?: string; text?: string; structuredContent?: unknown } | undefined
      if (first?.structuredContent !== undefined) return first.structuredContent
      if (typeof first?.text === 'string') return { text: first.text }
    }
    return candidate
  }
  return candidate
}

/** Simple pre block styling / 等宽块样式. */
export const monoStyle: React.CSSProperties = {
  fontSize: 11,
  lineHeight: 1.5,
  whiteSpace: 'pre',
  overflowX: 'auto',
  maxHeight: 320,
  margin: 0,
  padding: 8,
  background: 'rgba(0,0,0,0.04)',
  borderRadius: 6,
}
