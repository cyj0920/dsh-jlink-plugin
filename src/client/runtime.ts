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

/** Remote RPC result envelope (the gateway client returns {ok, value} | {ok:false, error}) / RPC 结果信封. */
export type RemoteResult<T> = { ok: true; value: T } | { ok: false; error: { code?: string; message?: string } }

/** Typed surface of the mounted jlink remote namespace / JLink Remote 接口. */
export interface JlinkRemote {
  status(): Promise<RemoteResult<JlinkStatusView>>
  /** Positional args follow the descriptor parameter order: (interfaceKind, chip, core) / 位置参数. */
  remoteConnect(interfaceKind?: string, chip?: string, core?: string): Promise<RemoteResult<JlinkStatusView>>
  remoteDisconnect(): Promise<RemoteResult<JlinkStatusView>>
  remoteHalt(): Promise<RemoteResult<JlinkStatusView>>
  remoteRun(): Promise<RemoteResult<JlinkStatusView>>
  remoteReset(): Promise<RemoteResult<JlinkStatusView>>
  rttRead(since: number): Promise<RemoteResult<RttReadView>>
}

/** Client services accessed through one structural view / 客户端服务访问. */
export interface ClientRemoteLike {
  jlink?: JlinkRemote
}

/** Minimal structural types for client services / 客户端服务结构类型. */
export interface SlotsLike {
  register(...args: unknown[]): unknown
  inject(name: string, callback: () => unknown): unknown
}

export interface LocaleLike {
  register(key: string, dictionaries: { zh: Record<string, string>; en: Record<string, string> }): (() => void) | undefined
}

interface ClientServices {
  slots?: SlotsLike
  locale?: LocaleLike
  remote?: ClientRemoteLike
}

/** Access client services through one structural view / 访问客户端服务. */
export function getClientServices(ctx: Context): ClientServices {
  return ctx as Context & ClientServices
}

/**
 * Get the mounted jlink remote namespace, or null when unavailable.
 * Resolved through ctx.reflect.get() — the raw registry lookup — because the
 * context proxy guard requires 'remote.jlink' to be declared in this fiber's
 * inject, but declaring it would deadlock the boot (the namespace is created
 * by our own $mount inside apply). reflect is a core property and its get()
 * performs no inject check (see cordis reflect.ts proxy handler).
 * / 通过 reflect.get 获取命名空间服务（避开 Proxy 守卫，避免自死锁）.
 */
export function getJlinkRemote(): JlinkRemote | null {
  const rootCtx = getClientRoot()
  if (!rootCtx) return null
  try {
    const reflect = (rootCtx as Context & { reflect?: { get(name: string): unknown } }).reflect
    const svc = reflect?.get?.('remote.jlink')
    return (svc as JlinkRemote | undefined) ?? null
  } catch (e) {
    console.warn('[dsh-jlink] remote namespace lookup failed:', e)
    return null
  }
}

/** Unwrap a RemoteResult into the value, throwing a descriptive error on failure / 解包 RPC 结果. */
export function unwrap<T>(r: RemoteResult<T>): T {
  if (r.ok) return r.value
  throw new Error(r.error?.message ?? r.error?.code ?? 'remote RPC failed')
}

/** Race a promise against a timeout so hangs become visible errors / 超时竞速. */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(label + ' 超时(' + ms + 'ms)')), ms)),
  ])
}
