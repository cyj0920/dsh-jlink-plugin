/** Built-in patch: common J-Link DLL-resident devices (no XML needed) / 内置常见 DLL 设备名单. */
import { NameMatchCore } from './name-match'
import type { DeviceInfo } from '../types'

/**
 * Curated list of popular devices that ship with the stock SEGGER DLL device
 * table (STM32 families and a few other classics). They connect without any
 * vendor patch, so exposing them here powers the client-side chip dropdown and
 * match_chip_name for boards like STM32F103ZE.
 */
const BUILTIN_DEVICES: DeviceInfo[] = [
  { name: 'STM32F030C8', vendor: 'ST', core: 'Cortex-M0', workRamAddr: '', workRamSize: '' },
  { name: 'STM32F103C8', vendor: 'ST', core: 'Cortex-M3', workRamAddr: '0x20000000', workRamSize: '20K' },
  { name: 'STM32F103CB', vendor: 'ST', core: 'Cortex-M3', workRamAddr: '0x20000000', workRamSize: '20K' },
  { name: 'STM32F103RC', vendor: 'ST', core: 'Cortex-M3', workRamAddr: '0x20000000', workRamSize: '48K' },
  { name: 'STM32F103VC', vendor: 'ST', core: 'Cortex-M3', workRamAddr: '0x20000000', workRamSize: '48K' },
  { name: 'STM32F103ZE', vendor: 'ST', core: 'Cortex-M3', workRamAddr: '0x20000000', workRamSize: '64K' },
  { name: 'STM32F207IG', vendor: 'ST', core: 'Cortex-M3', workRamAddr: '0x20000000', workRamSize: '112K' },
  { name: 'STM32F407VE', vendor: 'ST', core: 'Cortex-M4', workRamAddr: '0x20000000', workRamSize: '112K' },
  { name: 'STM32F407VG', vendor: 'ST', core: 'Cortex-M4', workRamAddr: '0x20000000', workRamSize: '112K' },
  { name: 'STM32F429IG', vendor: 'ST', core: 'Cortex-M4', workRamAddr: '0x20000000', workRamSize: '192K' },
  { name: 'STM32F429ZI', vendor: 'ST', core: 'Cortex-M4', workRamAddr: '0x20000000', workRamSize: '192K' },
  { name: 'STM32G474RE', vendor: 'ST', core: 'Cortex-M4', workRamAddr: '0x20000000', workRamSize: '96K' },
  { name: 'STM32H743VI', vendor: 'ST', core: 'Cortex-M7', workRamAddr: '0x20000000', workRamSize: '128K' },
  { name: 'STM32H750VB', vendor: 'ST', core: 'Cortex-M7', workRamAddr: '0x20000000', workRamSize: '128K' },
  { name: 'STM32L431RC', vendor: 'ST', core: 'Cortex-M4', workRamAddr: '0x20000000', workRamSize: '48K' },
  { name: 'STM32L476RG', vendor: 'ST', core: 'Cortex-M4', workRamAddr: '0x20000000', workRamSize: '96K' },
  { name: 'nRF52832_xxAA', vendor: 'Nordic', core: 'Cortex-M4', workRamAddr: '0x20000000', workRamSize: '64K' },
  { name: 'nRF52840_xxAA', vendor: 'Nordic', core: 'Cortex-M4', workRamAddr: '0x20000000', workRamSize: '256K' },
  { name: 'LPC1768', vendor: 'NXP', core: 'Cortex-M3', workRamAddr: '0x10000000', workRamSize: '64K' },
  { name: 'LPC54628JBD64', vendor: 'NXP', core: 'Cortex-M4', workRamAddr: '0x20000000', workRamSize: '160K' },
  { name: 'TM4C1294NCPDT', vendor: 'TI', core: 'Cortex-M4', workRamAddr: '0x20000000', workRamSize: '256K' },
]

/** Stock-DLL device list exposed as a patch so registry consumers see it too / 内置设备补丁. */
export class BuiltinPatch extends NameMatchCore {
  readonly vendorName = 'Builtin'
  readonly patchVersion = 'v1.0'
  private readonly devicesList = BUILTIN_DEVICES

  constructor() {
    super()
    this.setNames(BUILTIN_DEVICES.map((d) => d.name))
  }

  isAvailable(): boolean {
    return this.devicesList.length > 0
  }

  get devices(): DeviceInfo[] {
    return [...this.devicesList]
  }
}
