/** Session projection unit for the jlink domain (Phase 3) / JLink 会话投影单元. */
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import type { JLinkService } from './service'
import { logger } from './utils'

/** jlink projection whole value (small, JSON-safe) / 投影值（小体积）. */
export const jlinkProjectionSchema = z.object({
  connected: z.boolean(),
  chip: z.string().nullable(),
  voltage: z.number().nullable(),
  cpuState: z.enum(['halted', 'running', 'unknown']).nullable(),
  flash: z
    .object({ phase: z.enum(['idle', 'erasing', 'programming', 'verifying']), percent: z.number() })
    .nullable(),
})

export type JlinkProjectionValue = z.infer<typeof jlinkProjectionSchema>

interface SessionProjectionsLike {
  register(def: unknown): unknown
}

/** Register the 'jlink' projection unit; drive wiring is Phase 3 (event commit path). */
export function registerJlinkProjection(ctx: Context, svc: JLinkService): void {
  const registry = (ctx as Context & { sessionProjections?: SessionProjectionsLike }).sessionProjections
  if (!registry?.register) {
    throw new Error('sessionProjections service unavailable')
  }
  registry.register({
    key: 'jlink',
    schema: jlinkProjectionSchema,
    init: (): JlinkProjectionValue => ({ connected: false, chip: null, voltage: null, cpuState: null, flash: null }),
    // Whole-value rule: return the same reference for unrelated events.
    apply: (state: JlinkProjectionValue, _event: unknown): JlinkProjectionValue => state,
    view: (state: JlinkProjectionValue): JlinkProjectionValue => state,
    stateVersion: 1,
  })
  // Phase 3: commit whole-value 'jlink/state' session events from svc.core.onChange
  // so the projection folds live state; the session event API must be verified first.
  svc.core.onChange = (state) => {
    logger.debug('[projection] state change: ' + state.status + ' (commit wiring pending Phase 3)')
  }
}
