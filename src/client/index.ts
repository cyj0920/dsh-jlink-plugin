/** dsh-jlink client entry (browser) / 浏览器端入口. */
import type { Context } from '@deepseek-ai/cordis'
import { zh, en } from './locale'
import { getClientServices, setClientRoot } from './runtime'
import { mountJlinkRemote } from './remote'
import { JlinkHeaderControl } from './header-control'

/**
 * Required cordis services.
 * 注意：`remote.jlink` 不能出现在 inject 中 —— 该命名空间服务由本 entry 在 apply 内
 * 通过 `ctx.remote.$mount(...)` 动态创建（api-gateway 按贡献注册 `remote.<ns>` 服务）。
 * 若声明为依赖，loader 在 apply 前解析时服务尚不存在，entry 将永远 pending。
 * 挂载者只声明 `remote`（与 dsh-api-remotes 官方模式一致），消费方在挂载完成后访问。
 */
export const inject = ['sessions', 'slots', 'locale', 'remote']

/** Client plugin body / 客户端插件主体. */
export async function apply(ctx: Context): Promise<void> {
  setClientRoot(ctx)
  const services = getClientServices(ctx)

  if (services.locale) {
    ctx.effect(() => services.locale?.register('jlink', { zh, en }) ?? (() => {}), 'jlink:locale')
  }

  // Remote RPC for status polling and quick actions / 先挂载 Remote（后续访问 remote.jlink 的前提）.
  await mountJlinkRemote(ctx)

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
}
