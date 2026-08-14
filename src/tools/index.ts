/** Tool registration entry / 工具注册入口. */
import type { Context } from '@deepseek-ai/cordis'
import type { JLinkService } from '../service'
import type { PatchRegistry } from '../patch/registry'
import { registerConnectionTools } from './connection'
import { registerDeviceTools } from './device'
import { registerMemoryTools } from './memory'
import { registerDebugTools } from './debug'
import { registerFlashTools } from './flash'

/** Register all J-Link tools / 注册全部工具. */
export function registerJlinkTools(ctx: Context, svc: JLinkService, patches: PatchRegistry): void {
  registerConnectionTools(ctx, svc, patches)
  registerDeviceTools(ctx, svc, patches)
  registerMemoryTools(ctx, svc)
  registerDebugTools(ctx, svc)
  registerFlashTools(ctx, svc)
}
