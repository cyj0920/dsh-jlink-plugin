/** dsh-jlink client entry (browser) / 浏览器端入口. */
import type { Context } from '@deepseek-ai/cordis'
import { zh, en } from './locale'
import { getClientServices, setClientRoot } from './runtime'
import { mountJlinkRemote } from './remote'
import { JlinkHeaderControl } from './header-control'

/** Required cordis services / 需要的服务. */
export const inject = ['sessions', 'slots', 'locale', 'remote']

/** Client plugin body / 客户端插件主体. */
export function apply(ctx: Context): void {
  setClientRoot(ctx)
  const services = getClientServices(ctx)

  if (services.locale) {
    ctx.effect(() => services.locale?.register('jlink', { zh, en }) ?? (() => {}), 'jlink:locale')
  }

  // Header status pill (slot proven by dsh-client-ui-jobs) / 会话头状态灯.
  if (services.slots) {
    services.slots.inject('conversation.session.header.actions', () =>
      services.slots?.register(
        { name: 'conversation.session.header.actions', id: 'jlink-control', order: 30, locale: 'jlink' },
        JlinkHeaderControl,
      ),
    )
  } else {
    console.warn('[dsh-jlink] slots service unavailable; header control disabled')
  }

  // Remote RPC for status polling and quick actions / Remote 挂载.
  void mountJlinkRemote(ctx)
}
