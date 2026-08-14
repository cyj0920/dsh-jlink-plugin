/** Mount the hand-written remote contribution on the client / 挂载 Remote 贡献. */
import type { Context } from '@deepseek-ai/cordis'
import { JlinkRemoteContribution } from '../remote-spec'

interface ClientRemoteService {
  $mount(contribution: unknown): Promise<unknown>
}

/** Mount jlink remote endpoints; failures are logged, never fatal / 挂载（失败仅记录）. */
export async function mountJlinkRemote(ctx: Context): Promise<void> {
  const remote = (ctx as Context & { remote?: ClientRemoteService }).remote
  if (!remote?.$mount) {
    console.warn('[dsh-jlink] ctx.remote unavailable; remote RPC disabled')
    return
  }
  try {
    await remote.$mount(JlinkRemoteContribution)
    console.info('[dsh-jlink] remote contribution mounted')
  } catch (e) {
    console.error('[dsh-jlink] remote mount failed:', e)
  }
}
