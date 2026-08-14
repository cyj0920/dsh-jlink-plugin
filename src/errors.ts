/** Error codes and typed errors / 错误码与类型化错误. */

/** Structured error codes shared by tools, Remote RPC and drivers / 结构化错误码. */
export const ErrorCodes = {
  NOT_CONNECTED: 'JLINK_NOT_CONNECTED',
  NOT_HALTED: 'JLINK_NOT_HALTED',
  INVALID_PARAMETER: 'JLINK_INVALID_PARAMETER',
  DRIVER: 'JLINK_DRIVER_ERROR',
  TIMEOUT: 'JLINK_TIMEOUT',
  UNSUPPORTED: 'JLINK_UNSUPPORTED',
  PATCH_NOT_FOUND: 'JLINK_PATCH_NOT_FOUND',
  BUSY: 'JLINK_BUSY',
  ALREADY_EXISTS: 'JLINK_ALREADY_EXISTS',
  NOT_FOUND: 'JLINK_NOT_FOUND',
  INTERNAL: 'JLINK_INTERNAL_ERROR',
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

/** Typed plugin error / 类型化插件错误. */
export class JlinkError extends Error {
  constructor(
    readonly code: ErrorCode | string,
    message: string,
  ) {
    super(message)
    this.name = 'JlinkError'
  }
}
