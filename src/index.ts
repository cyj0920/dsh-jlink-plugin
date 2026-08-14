/** dsh-jlink host entry / 插件主机入口. */
import type { Context } from '@deepseek-ai/cordis'
import { Config, type JlinkConfig } from './config'
import { JLinkService } from './service'
import { PatchRegistry } from './patch/registry'
import { FlagchipPatch } from './patch/flagchip'
import { registerJlinkTools } from './tools'
import { JlinkHostContribution } from './remote-spec'
import { registerJlinkProjection } from './projection'
import { logger } from './utils'

export const name = 'jlink'

/** Required cordis services (loader guard: undeclared ctx access throws) / 依赖的服务. */
export const inject = ['tools', 'typert']

export { Config }
export * from './types'
export * from './errors'
export * from './utils'
export { JLinkService } from './service'
export { JLinkCore } from './core'
export { PatchRegistry } from './patch/registry'
export { FlagchipPatch } from './patch/flagchip'
export { MockDriver } from './driver/mock'
export { PythonDriver } from './driver/python'
export { JlinkHostContribution, JlinkRemoteContribution } from './remote-spec'

/** Plugin body / 插件主体. */
export function apply(ctx: Context, config: JlinkConfig): void {
  // D2: the service lives on the host plane (process-global hardware handle).
  const svc = new JLinkService(ctx, config)

  // Patch registry (H10: patch load failure is non-fatal).
  const patches = new PatchRegistry()
  try {
    const flag = new FlagchipPatch(config.patchDir)
    if (flag.isAvailable()) patches.register(flag)
  } catch (e) {
    logger.warn('Flagchip patch load failed: ' + (e as Error).message)
  }
  ctx.provide('jlink.patches', patches)

  registerJlinkTools(ctx, svc, patches)

  if (config.remoteEnabled) {
    try {
      const typert = (ctx as Context & { typert?: { register(c: unknown): unknown } }).typert
      if (typert?.register) {
        typert.register(JlinkHostContribution)
        logger.info('typert contribution registered')
      }
    } catch (e) {
      logger.warn('typert register skipped: ' + (e as Error).message)
    }
  }

  if (config.projectionEnabled) {
    try {
      registerJlinkProjection(ctx, svc)
    } catch (e) {
      logger.warn('projection register skipped: ' + (e as Error).message)
    }
  }

  // Cleanup: dispose the driver when the plugin fiber unloads / 卸载时释放驱动.
  ctx.effect(
    () => {
      const d = svc.core.driver as { dispose?: () => void }
      return () => d.dispose?.()
    },
    'jlink:driver-dispose',
  )

  logger.info('dsh-jlink loaded (driver=' + config.driver + ', patches=' + patches.patchCount + ')')
}

export default { name, apply, Config }
