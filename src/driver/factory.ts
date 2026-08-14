/** Driver factory (D1) / 驱动工厂. */
import type { JlinkConfig } from '../config'
import type { DriverInterface } from './interface'
import { MockDriver } from './mock'
import { PythonDriver } from './python'
import { ErrorCodes, JlinkError } from '../errors'

/** Create the configured driver / 按配置创建驱动. */
export function createDriver(config: JlinkConfig): DriverInterface {
  switch (config.driver) {
    case 'mock':
      return new MockDriver()
    case 'python':
      return new PythonDriver(config.pythonCommand, config.pythonDriverPath)
    case 'gdb':
      throw new JlinkError(ErrorCodes.UNSUPPORTED, 'gdb driver is not implemented yet (Phase 4)')
    default:
      return new MockDriver()
  }
}
