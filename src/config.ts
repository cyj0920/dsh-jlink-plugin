/** Plugin configuration / 插件配置. */
import { z } from 'zod'

/** Config schema — additive only (C1/DESIGN §6.1) / 配置 Schema（只增不改）. */
export const Config = z.object({
  driver: z.enum(['mock', 'python', 'gdb']).default('mock'),
  pythonCommand: z.string().default('python'),
  pythonDriverPath: z.string().optional(),
  defaultInterface: z.enum(['SWD', 'JTAG']).default('JTAG'),
  defaultCore: z.string().default('Cortex-M4'),
  defaultTimeoutMs: z.number().int().positive().default(10000),
  maxMemoryReadSize: z.number().int().positive().default(65536),
  patchDir: z.string().optional(),
  svdDir: z.string().optional(),
  autoReconnect: z.boolean().default(false),
  projectionEnabled: z.boolean().default(false),
  remoteEnabled: z.boolean().default(true),
})

export type JlinkConfig = z.infer<typeof Config>
