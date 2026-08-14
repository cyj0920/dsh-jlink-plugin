/** Client root context holder and typed service access / 客户端根上下文与类型化服务访问. */
import type { Context } from '@deepseek-ai/cordis'
import type { JlinkStatusView, RttReadView } from '../types'

/** Client root context holder (integration seam, set in apply) / 根上下文持有器. */
let root: Context | null = null

export function setClientRoot(ctx: Context): void {
  root = ctx
}

export function getClientRoot(): Context | null {
  return root
}

/** Typed surface of the mounted jlink remote namespace / JLink Remote 接口. */
export interface JlinkRemote {
  status(): Promise<JlinkStatusView>
  halt(): Promise<JlinkStatusView>
  run(): Promise<JlinkStatusView>
  reset(): Promise<JlinkStatusView>
  rttRead(since: number): Promise<RttReadView>
}

/** Minimal structural types for client services (augmentations live in host packages) / 客户端服务结构类型. */
export interface SlotsLike {
  register(...args: unknown[]): unknown
  inject(name: string, callback: () => unknown): unknown
}

export interface LocaleLike {
  register(key: string, dictionaries: { zh: Record<string, string>; en: Record<string, string> }): (() => void) | undefined
}

interface ClientRemoteLike {
  jlink?: JlinkRemote
}

interface ClientServices {
  slots?: SlotsLike
  locale?: LocaleLike
  remote?: ClientRemoteLike
}

/** Access client services through one structural view / 访问客户端服务. */
export function getClientServices(ctx: Context): ClientServices {
  const c = ctx as Context & ClientServices
  return c
}

/** Get the mounted jlink remote namespace, or null when unavailable / 获取 JLink Remote. */
export function getJlinkRemote(): JlinkRemote | null {
  return getClientServices(getClientRoot() ?? ({} as Context)).remote?.jlink ?? null
}
