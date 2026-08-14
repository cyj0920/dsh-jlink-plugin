# dsh-jlink — DSH 原生 JLink 调试插件 · 设计方案

> **版本** 0.1 · **事实基准** 本机实际安装的 `@deepseek-ai/dsh@0.1.0-rc.6`（Cordis 4.0.1）
> **状态** 已实现（Phase 1+2 完成并通过 typecheck/build/单测；Phase 3 代码就位未硬件验证）→ 验收中。实现偏差见 README「实现偏差记录」
> **读者** 执行编码任务的模型（如 Gemini Flash）。本文是**规格书**：第 9 章「硬约束清单」每一条都可被检查，实现时逐条自查；任何实现与第 2 章核心决策冲突即算错。

---

## 0. 怎么用这份文档

1. 先读 **第 2 章（核心决策）** 与 **第 9 章（硬约束清单）**，再动手写代码。
2. 编码前必须核对 **附录 B** 列出的基准文件（全部来自真实安装的 rc.6 包）。API 形状以那些文件为准，**禁止凭记忆写 API**。
3. 本文件夹**自包含**：`pnpm install && pnpm build` 后即可挂进任意 DSH profile；整体移动到任何目录后重复这两步即可，无绝对路径依赖。

---

## 1. 目标与非目标

**目标**：把 `jlink_mcp`（Python MCP 服务器）的「管理器 + 工具 + 补丁注册」逻辑，重写为 DeepSeek Harness **原生 Cordis 插件**（Host 面 + 浏览器面双端），并把**可视化**做成与工具同等地位的一等能力：内存 hexdump 视图、寄存器表格、RTT 终端、Flash 进度条、会话头状态灯——都是浏览器里的定制组件，而不是纯文本。

**非目标**：
- 不重写 Python 驱动逻辑（Phase 3 用薄 RPC 层**复用** jlink_mcp 已验证的 pylink 代码）。
- Phase 1/2 不做多厂商补丁（保留注册器，先实现 Flagchip）。
- 不做 MCP 桥接（`dsh-mcp-client`）——本插件就是它的原生替代。

---

## 2. 核心决策（先定死）

| # | 决策 | 理由 |
|---|---|---|
| D1 | 服务之下加 **DriverInterface** 驱动抽象。Phase 3 实现 `PythonDriver`（stdio + ndjson JSON-RPC，复用 jlink_mcp 的 pylink 逻辑）；开发期用 `MockDriver`，无硬件也能开发/演示全部 UI | 上层（工具/UI/补丁）与硬件后端解耦；将来可换 Node 直驱 DLL 而**上层零改动** |
| D2 | 插件行挂 **profile 根配置层（host plane）**，绝不放进 agent preset 的 isolate realm | 一把 J-Link 是进程级资源；工具全局可见、所有 agent 共享同一连接 |
| D3 | 数据通道分频：慢状态走 **session projection**（推送）、快数据走 **Remote RPC 长轮询**（RTT）、查询走 **Remote RPC** | 树外插件无法新增 `ctx.remote.$on` 事件（白名单是 app 侧固定数组，见 R2），projection+RPC 是唯一稳妥的树外通道 |
| D4 | Remote RPC 用 **SRC 模式 + 手写 `src-json` 贡献** | 环境没有 `dsh-typert-generator`；SRC 是官方文档明确的 fallback 路径 |
| D5 | 补丁注册器与匹配算法从 Python **原样平移** | 保证 FC7300 系列匹配行为与 jlink_mcp 完全一致（测试向量共用） |
| D6 | 工具返回契约 = `output.schema`（canonical JSON，信封 `{success,data,message,error}`）+ `output.render`（模型/人看的文本） | 继承 jlink_mcp 信封语义，同时获得 DSH「数据与渲染分离」的原生优势 |

---

## 3. 全新思路（设计哲学）

### 3.1 从「手搓」到「框架内建」

jlink_mcp 费心手搓的插件机制，DSH/Cordis 是框架级内建的。本方案**不照抄 Python 结构**，而是逐项映射：

| jlink_mcp（Python 手搓） | dsh-jlink（DSH 内建） | 获得的增益 |
|---|---|---|
| `__new__` 单例管理器 | Cordis `Service` + 依赖注入 | 生命周期、realm 隔离、可注入、可测试 |
| `DevicePatchInterface`（ABC） | TS `DevicePatch` 接口 | 编译期类型安全契约 |
| `DevicePatchManager` 单例注册器 | Cordis 服务注册表 + 组合树 | 运行时注册/注销、HMR、第三方可扩展 |
| `plugins/__init__.py` 静态导出 | 组合树 + Loader 发现 | 按 profile 组合，无需改主程序 |
| `@mcp.tool()` | `ctx.tools.register()` | 一等工具：可 guard / restrict / 超时 / 并发策略 / agent scope |
| Pydantic 校验 | zod（Standard Schema） | 与全栈 schema 体系统一 |
| `{success,data,message,error}` 信封 | `output.schema` + `output.render` | 模型吃 JSON、人看组件，两者分离 |
| 环境变量配置 | 插件 `Config` + patch 层覆盖 | 分层配置、可 `--dump-config` 检查 |
| （没有 UI） | toolview 键控槽 + slots | **全新能力：可视化** |

### 3.2 为什么原生 > MCP 桥接（最大化插件优势）

1. **一等工具**：原生注册的工具可被 DSH 的 guard/restrict/超时/并发策略/agent scope 治理；MCP 桥接工具只能拿到名字与 schema。
2. **可视化**：`tool.call.toolview` 键控槽让每个工具结果渲染成专属组件——桥接工具永远只有文本。
3. **组合性（插件套插件）**：补丁注册器让「ST 补丁」成为另一个插件在运行时挂载，无需改本项目。
4. **深度联动**：approval 策略、jobs、goal、subagent 都能通过 `ctx.get('jlink')` 感知硬件状态。
5. **HMR**：改工具/服务热更新，不重启进程、不重连硬件。
6. **生命周期**：断线重连、进程退出清理由框架承担，而非 Python 单例硬扛。

### 3.3 可视化原则（贯穿全设计）

- 每个工具一个专属视图（§7.2）。
- 硬件状态常驻 UI（§7.1 状态灯）。
- 慢状态推送、快数据流式（§4.2 通道分频）。
- UI 只用宿主已声明的槽与 token，不碰布局全局（U1/U4）。

---

## 4. 总体架构

### 4.1 三平面

```
┌─ 浏览器（Client plane）────────────────────────────────────────┐
│  Header JLink 状态灯 │ RTT 控制台 │ Flash 进度 │ hexdump/寄存器视图 │
│  ctx.slots.register      ctx.remote.jlink.rttRead(since, signal) │
│                          projections.faceOf('jlink')（Phase 3）  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP /api（Typert RPC）+ session/projection 帧
┌─ Host（Node 进程）─────────────────────────────────────────────┐
│  JLinkService（连接状态机） ──► PatchRegistry ──► FlagchipPatch… │
│     │                                                          │
│     │  DriverInterface：MockDriver / PythonDriver / GdbDriver   │
│  工具注册（ctx.tools.register） │ Remote RPC（SRC） │ projection │
└────────────────────────────────────────────────────────────────┘
                           │ ndjson JSON-RPC（stdio，Phase 3）
                     ┌─────┴──────────┐
                     │ python/driver.py│── pylink ──► J-Link 硬件
                     └────────────────┘
```

### 4.2 数据通道总表

| 通道 | 方向 | 用途 | 本插件用法 |
|---|---|---|---|
| 工具调用 | 模型 → Host | 调试操作 | §6.5 工具清单（23 个） |
| Remote RPC | UI → Host | 查询 / 长轮询 | `jlink/status`、`jlink/rttRead` |
| session/projection 帧 | Host → UI | 小快照推送 | `jlink` 键：连接/芯片/flash 快照（Phase 3） |
| toolview 槽 | 工具结果 → UI | 结果可视化 | 键控注册（§7.2） |
| （禁用）remote 事件 | Host → UI | —— | 树外不可扩展，见 R2 |

---

## 5. 包结构（自包含）

```
dsh-jlink-plugin/
├── DESIGN.md                  # 本文件
├── README.md                  # 用户文档（安装/配置/工具目录/常见错误）
├── package.json               # 硬形状见 §8.1
├── tsconfig.json              # strict、ESM、erasable 语法（禁 enum/namespace）
├── tsdown.config.ts           # 双面产物：host + client + remote
├── python/
│   └── README.md              # Phase 3 才实现 driver.py（ndjson RPC 协议定义）
├── src/                       # ── Host 面 ──
│   ├── index.ts               # 入口 apply(ctx, config)
│   ├── config.ts              # zod Config
│   ├── types.ts               # 全部共享类型 + 事件声明合并
│   ├── errors.ts              # 错误码（平移 exceptions.py）
│   ├── utils.ts               # 工具函数（平移 utils.py）
│   ├── driver/
│   │   ├── interface.ts       # DriverInterface（D1）
│   │   └── mock.ts            # MockDriver（Phase 1/2）
│   ├── service.ts             # JLinkService 状态机（← jlink_manager.py）
│   ├── remote-spec.ts         # 手写 TYPERT 贡献数据（host/client 共用，D4）
│   ├── projection.ts          # session projection 单元（Phase 3）
│   ├── patch/
│   │   ├── interface.ts       # DevicePatch（← device_patch_interface.py）
│   │   ├── registry.ts        # PatchRegistry（← device_patch_manager.py）
│   │   └── flagchip.ts        # FlagchipPatch（← plugins/flagchip_patch.py）
│   └── tools/
│       ├── connection.ts      # 5 工具（← tools/connection.py）
│       ├── device.ts          # 4 工具（← tools/device_info.py）
│       ├── memory.ts          # 4 工具（← tools/memory.py）
│       ├── debug.ts           # 7 工具（← tools/debug.py）
│       └── flash.ts           # 3 工具（← tools/flash.py）
├── src/client/                # ── 浏览器面 ──
│   ├── index.ts               # client 入口 apply（dsh.client 标记指向这里）
│   ├── remote.ts              # ctx.remote.$mount(手写贡献)
│   ├── header-control.tsx     # 会话头状态灯 + 弹窗（§7.1）
│   └── toolviews/
│       ├── memory.tsx         # hexdump 视图
│       ├── registers.tsx      # 寄存器表格
│       ├── chip.tsx           # 芯片信息卡
│       ├── rtt.tsx            # RTT 终端（Phase 3）
│       └── flash.tsx          # 烧录进度（Phase 3）
└── tests/
    ├── patch-match.test.ts    # 匹配算法测试向量（与 jlink_mcp 一致）
    ├── envelope.test.ts       # 信封契约测试
    └── service.test.ts        # 状态机测试（MockDriver）
```

---

## 6. Host 设计

### 6.1 Config（config.ts）

```ts
import { z } from 'zod'

export const Config = z.object({
  driver: z.enum(['mock', 'python', 'gdb']).default('mock'),
  pythonCommand: z.string().default('python'),      // Phase 3
  defaultInterface: z.enum(['SWD', 'JTAG']).default('JTAG'),
  defaultTimeoutMs: z.number().int().positive().default(10000),
  maxMemoryReadSize: z.number().int().positive().default(65536),
  patchDir: z.string().optional(),                  // 外部 JLinkDevices.xml 目录
  svdDir: z.string().optional(),                    // Phase 4
  autoReconnect: z.boolean().default(false),
})
export type JlinkConfig = z.infer<typeof Config>
```

约束：schema **只增不改**；形状变化必须同步 bump 相关 `stateVersion` 与文档。

### 6.2 DriverInterface（driver/interface.ts）

```ts
export interface DriverInterface {
  /** 生命周期 */
  connect(opts: { interface?: 'SWD'|'JTAG'; chip?: string; serial?: string }): Promise<Envelope<DeviceInfo>>
  disconnect(): Promise<Envelope<null>>
  /** 调试控制 */
  halt(): Promise<Envelope<CpuState>>
  run(): Promise<Envelope<CpuState>>
  step(): Promise<Envelope<CpuState>>
  reset(): Promise<Envelope<null>>
  getCpuState(): Promise<Envelope<CpuState>>
  /** 内存/寄存器 */
  readMemory(address: number, length: number): Promise<Envelope<Uint8Array>>
  writeMemory(address: number, data: Uint8Array): Promise<Envelope<null>>
  readRegisters(names?: string[]): Promise<Envelope<Record<string, number>>>
  writeRegister(name: string, value: number): Promise<Envelope<null>>
  /** Flash（Phase 2+） */
  eraseFlash(start: number, end: number): Promise<Envelope<null>>
  programFlash(address: number, data: Uint8Array, verify: boolean): Promise<Envelope<null>>
  verifyFlash(address: number, data: Uint8Array): Promise<Envelope<null>>
}
```

语义约定：
- 所有方法返回信封，**不 throw 业务错误**；编程错误（参数非法等）可 throw。
- 实现层负责**请求互斥**（同驱动实例内串行）；上层不假设并发。
- `MockDriver` 维护一张内存 Map 模拟 Flash/RAM/寄存器，行为与真实驱动一致（未 halt 读内存返回 `JLINK_NOT_HALTED` 错误码）。

### 6.3 JLinkService 状态机（service.ts）

```ts
export class JLinkService extends Service {
  constructor(ctx: Context, config: JlinkConfig) {
    super(ctx, 'jlink')          // 注册为 ctx['jlink']，随 fiber 自动销毁
    this.driver = createDriver(config.driver, config)
  }
  // 状态机：disconnected → connecting → connected(halted|running) → error
  private state: ConnectionState = { status: 'disconnected' }
  private setState(next: ConnectionState) { /* 单点修改 + 记录 lastChangedAt */ }
  // 业务方法：connect/disconnect/halt/run/reset/step/readMemory/...（供工具与 Remote 共用）
}
```

约束：
- **工具与 Remote 不得直接碰 driver**，必须经 JLinkService 业务方法（H 约束）。
- 断线重连语义平移自 `dsh-mcp-client` 的 reconnect 配置：初始 500ms、指数退避、上限 30s、最多 10 次。
- 进程内只允许一个 JLinkService 实例（由 `apply` 提供；禁止 `new JLinkService`）。

### 6.4 Patch 系统（patch/）

```ts
// patch/interface.ts —— 平移 device_patch_interface.py
export interface DevicePatch {
  readonly vendorName: string
  readonly patchVersion: string
  isAvailable(): boolean
  readonly devices: DeviceInfo[]
  readonly deviceNames: string[]
  matchDeviceName(partial: string): string | null
  findSimilarDevices(partial: string, limit?: number): string[]
  getDeviceNameSuggestions(partial: string): string
}

// patch/registry.ts —— 平移 device_patch_manager.py（含全部去重/优先级逻辑）
export class PatchRegistry extends Service {
  constructor(ctx: Context) { super(ctx, 'jlink.patches') }
  register(patch: DevicePatch): void       // vendor 去重，重复告警
  unregister(vendor: string): boolean
  matchDeviceName(chip: string): [string, DevicePatch] | null
  // ...
}
```

**匹配算法必须逐行平移**（测试向量共用，见 Phase 2 DoD）：
1. 精确匹配（忽略大小写，O(1) 预计算小写字典）
2. 前缀匹配 → 3. 包含匹配 → 4. 占位符模糊匹配
5. 多命中时排除 Unlock/Factory/FromRom/Core/_64/ETM 关键词
6. 批次优先级 T1C > T1B > T1A

`FlagchipPatch` 解析 `JLinkDevices.xml`（内置一份于包内 `resources/`，或经 `patchDir` 外置——与 jlink_mcp 的资源解析优先级一致）。

### 6.5 工具清单

命名**与 jlink_mcp 完全一致**。阶段与硬指标：

| 工具 | 阶段 | 关键参数 | timeoutMs | 前置条件 | isConcurrencySafe |
|---|---|---|---|---|---|
| list_jlink_devices | P1 | —— | 10000 | —— | Phase 3 评估 |
| get_connection_status | P1 | —— | 10000 | —— | Phase 3 评估 |
| halt_cpu | P1 | —— | 5000 | 已连接 | 否 |
| connect_device | P2 | serial?, interface?, chip_name? | 15000 | —— | 否 |
| disconnect_device | P2 | —— | 10000 | —— | 否 |
| match_chip_name | P2 | chip_name | 5000 | —— | 否 |
| get_target_info | P2 | —— | 10000 | 已连接 | 否 |
| get_target_voltage | P2 | —— | 10000 | 已连接 | 否 |
| scan_target_devices | P2 | —— | 15000 | —— | 否 |
| list_device_patches | P2 | —— | 5000 | —— | 否 |
| read_memory | P2 | address, length(≤65536) | 15000 | **已 halt** | 否 |
| write_memory | P2 | address, data | 15000 | **已 halt** | 否 |
| read_registers | P2 | names? | 10000 | **已 halt** | 否 |
| write_register | P2 | name, value | 10000 | **已 halt** | 否 |
| reset_target | P2 | —— | 10000 | 已连接 | 否 |
| run_cpu | P2 | —— | 5000 | 已连接 | 否 |
| step_instruction | P2 | —— | 5000 | 已连接 | 否 |
| get_cpu_state | P2 | —— | 5000 | 已连接 | 否 |
| set_breakpoint | P2 | address, type? | 5000 | 已连接 | 否 |
| clear_breakpoint | P2 | address | 5000 | 已连接 | 否 |
| erase_flash | P2 | start_address, end_address | 300000 | 已连接 | 否 |
| program_flash | P2 | address, data, verify=true | 300000 | 已连接 | 否 |
| verify_flash | P2 | address, data | 120000 | 已连接 | 否 |
| rtt_start / rtt_stop / rtt_read / rtt_write / rtt_get_status | P3 | —— | 10000 | 已连接 | 否 |
| start_gdb_server / stop_gdb_server / get_gdb_server_status | P3 | port?, device? | 10000 | —— | 否 |
| SVD 5 工具 | P4 | —— | —— | —— | —— |

**前置条件语义**（继承 jlink_mcp 最佳实践）：memory/register 读写前必须 halted；工具内检查，未 halted 返回结构化错误（`error.code='JLINK_NOT_HALTED'`，message 提示先调 `halt_cpu`）。

### 6.6 工具注册模板（tools/memory.ts）

```ts
ctx.tools.register({
  name: 'read_memory',
  description: '读取目标内存。读取前 CPU 必须已 halt（未 halt 返回 JLINK_NOT_HALTED）。',
  parameters: {
    type: 'object',
    properties: {
      address: { type: 'integer', minimum: 0 },
      length: { type: 'integer', minimum: 1, maximum: 65536 },
    },
    required: ['address', 'length'],
  },
  output: {
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: { type: 'object', properties: { address: { type: 'integer' }, bytes: { type: 'string' }, hex: { type: 'string' } } },
        message: { type: 'string' },
        error: { type: ['object', 'null'] },
      },
      required: ['success', 'message'],
    },
    render(_args, value) {
      return value.success
        ? [{ type: 'text', text: value.data.hex }]        // 模型看到 hexdump 文本
        : [{ type: 'text', text: 'error: ' + value.error?.message }]
    },
  },
  timeoutMs: 15000,
  async execute(args, exec) {
    return this.ctx.get('jlink').readMemory(args.address, args.length)   // 返回 canonical JSON
  },
})
```

### 6.7 Remote RPC（remote-spec.ts，D4）

端点（最小且稳定）：`jlink/status`（Phase 1）、`jlink/rttRead(since, signal)`（Phase 3）。

**SRC 硬约束**（来自 dsh-typert-protocol）：
- 方法只允许**简单位置参数**（string/number/boolean/普通对象，全部 JSON-safe）；
- **禁止**解构参数、默认值、rest 参数、重载；
- 可选末位 `signal: AbortSignal`（取消感知；SRC 识别保留名）。

**手写贡献**（host/client 共用同一份数据，codec 一律 `mode:'src-json'`）：

```ts
// remote-spec.ts —— 手写 TYPERT 贡献（D4）。字段形状以附录 B 基准文件为准！
export const JlinkRemoteSpec = {
  package: '@can/dsh-jlink',
  face: 'host',
  schemas: [],
  invocations: [
    {
      id: '@can/dsh-jlink#jlink/status',
      service: 'jlink',
      namespace: 'jlink',
      method: 'status',
      invocation: { kind: 'direct' },       // 无 scope、无 lookup（进程级服务）
      parameters: [],                        // 全部 source:'json'；此处无参
      result: { mode: 'src-json', typeSymbol: '@can/dsh-jlink/types#JlinkStatusView' },
      sourceLocation: { file: 'src/remote-spec.ts', line: 0, column: 0 },
    },
    // rttRead: parameters 含 { name:'since', wire:'since', source:'json', codec:{mode:'src-json',...} }
    // 取消感知的 descriptor 字段以 InvocationDescriptor 类型声明为准（typert-protocol）
  ],
}
```

Host 侧（index.ts 内）：`ctx.typert.register(JlinkRemoteSpec)`（typert-loader 的 `packages` 备选，但**直接 register 最简**）。
Client 侧（client/remote.ts）：`await ctx.remote.$mount(JlinkRemoteSpec)` 后使用 `ctx.remote.jlink.status()`。

⚠️ 实现前**必须先读**：`dsh-goal/lib/typert.host.js`、`dsh-goal/lib/typert.remote-client.js`（TYPERT/TYPERT_REMOTE 数据基准）、`dsh-typert-protocol/lib/types/types.d.ts`（`InvocationDescriptor` 等字段真名）。**禁止臆造字段名**；拿不准时宁可少一个可选字段也不要编造。

### 6.8 Projection（projection.ts，Phase 3）

```ts
ctx.sessionProjections.register({
  key: 'jlink',
  schema: z.object({
    connected: z.boolean(),
    chip: z.string().nullable(),
    voltage: z.number().nullable(),
    cpuState: z.enum(['halted', 'running', 'unknown']).nullable(),
    flash: z.object({ phase: z.enum(['idle', 'erasing', 'programming', 'verifying']), percent: z.number() }).nullable(),
  }),
  init: () => ({ connected: false, chip: null, voltage: null, cpuState: null, flash: null }),
  apply(state, event) { return state },  // 不关心的事件必须返回同引用（same-reference gate）
  view: (s) => s,
  stateVersion: 1,
})
```

约束：值必须小（<2KB）；`init/apply/view` 全同步；形状变化 bump `stateVersion`；状态变化以 **whole-value** 事件提交（经 SessionEventMap 声明合并 `'jlink/state'`），由 projection 折叠；**禁止**把 RTT 高频数据放进 projection。

---

## 7. Client 设计（src/client/）

### 7.1 会话头状态灯（header-control.tsx）

- 槽：`conversation.session.header.actions`（dsh-client-ui-jobs 已证明该槽存在且持续渲染；注册一个条目即可）。
- 行为：2s 间隔轮询 `ctx.remote.jlink.status()`；四态灰/绿/黄/红 = 未连接/已连接/运行中/错误；点击弹窗：连接参数（接口/芯片/序列号）、halt/run/reset 快捷按钮（按钮调 Remote 方法，不直接发工具调用）。
- Phase 3 后改吃 `jlink` projection 推送，轮询降级为兜底。
- 轮询 interval 与 RPC 订阅随 fiber 卸载清理（U3）。

### 7.2 工具结果视图（tool.call.toolview 键控注册）

注册模式（来自 dsh-client-ui-tool 的键控链式槽）：

```ts
ctx.slots.inject('tool.call.toolview', () =>
  ctx.slots.register({ name: 'tool.call.toolview', key: 'read_memory' }, MemoryToolView))
```

视图清单（组件只读工具结果负载，**不**发 RPC）：

| key（工具名） | 组件 | 渲染内容 |
|---|---|---|
| read_memory | memory.tsx | 地址列 + hexdump + ASCII 列 |
| write_memory | memory.tsx | 写入确认（地址/长度） |
| read_registers | registers.tsx | 寄存器表：名/十六进制/十进制 |
| get_target_info | chip.tsx | 芯片卡片（core/Flash/RAM/电压） |
| get_connection_status | chip.tsx | 连接状态卡 |
| erase_flash / program_flash / verify_flash | flash.tsx | 阶段 + 进度条（Phase 3 接 projection 实时进度） |
| rtt_read | rtt.tsx | 终端样式日志（Phase 3） |

### 7.3 RTT 控制台（Phase 3）

- 挂载：状态灯弹窗内 tab，或独立面板（实现时先枚举宿主已声明槽再定，见 U1）。
- 数据：`ctx.remote.jlink.rttRead(since)` 长轮询（递增游标 + `AbortSignal` 取消）；环形缓冲 ≤1000 行；自动滚动；可暂停。

### 7.4 Flash 进度（Phase 3）

- 进度数据 = `jlink` projection 的 `flash` 子对象（阶段 + 百分比）；烧录工具 timeoutMs 已放宽至 300s，模型侧不会被超时打断。

### 7.5 组件硬约束

React 18；样式只用 ui-primitives token；文案走自有 locale 命名空间 `jlink`；组件为纯函数优先、无窗口依赖；订阅全生命周期清理。

---

## 8. 构建与安装

### 8.1 package.json 硬形状（B 约束）

```json
{
  "name": "@can/dsh-jlink",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./types": { "types": "./lib/types/types.d.ts", "default": "./lib/types/types.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
    "./remote": { "types": "./lib/types/remote.d.ts", "default": "./lib/remote.js" },
    "./package.json": "./package.json"
  },
  "dsh": {
    "client": {
      "inject": [
        "@deepseek-ai/dsh-client-runtime",
        "@deepseek-ai/dsh-client-ui-primitives",
        "@deepseek-ai/dsh-client-ui-conversation",
        "@deepseek-ai/dsh-client-ui-slots"
      ],
      "platform": "web"
    }
  },
  "files": ["lib/", "python/", "resources/"],
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-tools": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-llm": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-typert-protocol": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-api-gateway": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-session-projection": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-client-runtime": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-client-ui-slots": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-client-ui-primitives": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-client-ui-conversation": "^0.1.0-rc.6"
  },
  "dependencies": { "zod": "^4.4.3" },
  "scripts": {
    "build": "tsdown",
    "watch": "tsdown --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

注意：`dsh.client.inject` 只列**实际 import 了其公开 API** 的包；peerDependencies 与实际 import 一一对应（B4）。`dsh.client` 标记是 Loader 把本包 client 面打进浏览器 bundle 的依据。

### 8.2 tsdown 产物

- `lib/index.js`（host 入口）→ `exports["."]`
- `lib/client.js`（client 入口）→ `exports["./client"]`
- `lib/remote.js`（TYPERT_REMOTE 数据）→ `exports["./remote"]`
- types 全部随产物输出；ESM only。

### 8.3 装载步骤（写入 README）

```bash
# 1) 创建 profile（若尚无；具体命令以 CLI 行为参考为准）
dsh plugin --profile can add <本插件路径或 npm 包名>

# 2) profile 的 cordis.patch.yml 增加（host plane 根层，D2）：
#    - id: jlink
#      name: '@can/dsh-jlink'
#      config: { driver: mock }

# 3) 启动并验证
dsh web
dsh --profile web --dump-config      # 应能看到 jlink 插件行与配置
```

### 8.4 HMR 工作流

- Host：编辑插件入口 → cordis-plugin-hmr 重载（不重启进程、不重连硬件）。
- Client：`pnpm watch` 重建 `lib/client.js` → 刷新浏览器。**不要假设 checkout 的 dev:web watcher 会重建树外插件**——树外插件的 client bundle 由本包自建自刷。

---

## 9. 硬约束清单（实现者逐条自查）

### 9.1 通用（C）
- C1 全部源码 ESM + 严格 TS；禁 `enum`/`namespace`；公开函数全类型注解；docstring 中英双语（沿用 jlink_mcp 惯例）。
- C2 禁模块级可变全局；一切状态在 Service 实例内。
- C3 禁 import DSH 包的 `./src/*` 深层路径，只用公开 exports。
- C4 禁硬编码绝对路径；包内资源用 `import.meta.url` 相对解析。
- C5 工具名与 jlink_mcp 完全一致；工具/服务/端点名满足 `[A-Za-z0-9_-]`、≤64 字符。
- C6 包名占位 `@can/dsh-jlink`；改名需同步 3 处（package.json name、cordis.yml name、remote-spec 的 package 字段）。

### 9.2 Host（H）
- H1 工具必须声明 `output.schema` + `output.render`；`execute` 返回值必须通过该 schema。
- H2 业务失败不 throw：返回 `{success:false, message, error:{code,message}}`；仅编程错误可 throw。
- H3 `execute` 的异步工作必须观察 `exec.signal`。
- H4 Phase 1/2 不声明 `isConcurrencySafe`（全串行）；Phase 3 只对纯读且 driver 串行安全者开 true。
- H5 memory/register 读写前必须 halted（工具内检查，未 halted 返回 `JLINK_NOT_HALTED`）。
- H6 JLinkService 单实例：由 `apply` 提供，禁 `new JLinkService`。
- H7 Remote 方法仅简单参数 + 可选末位 `signal`；禁解构/默认值/rest/重载。
- H8 手写贡献逐字段对齐附录 B 基准；codec `mode:'src-json'`；改端点同步 host/client 两份数据并 bump 版本。
- H9 Projection 单元全同步、same-reference、值 <2KB、bump `stateVersion`（Phase 3）。
- H10 补丁加载失败只 warning 不致命（平移 jlink_mcp 容错语义）。
- H11 插件行必须在 cordis.patch.yml 声明 `inject: ['tools', 'typert']`（loader 的 Proxy 守卫：未声明即访问 ctx.tools 会抛 "cannot get property without inject"；模块导出 inject 仅对 client 面生效）。

### 9.3 Client（U）
- U1 只注册**已声明**槽：`conversation.session.header.actions`、`tool.call.toolview`；用其它槽前先确认宿主 SlotMap 声明；未声明的目标用 `ctx.slots.inject` 等待模式；禁凭空发明槽名。
- U2 toolview 注册必须键控（`key: '<工具名>'`）。
- U3 所有 interval / RPC / `$on` 订阅随 fiber 或组件卸载清理。
- U4 React 18；样式只用 ui-primitives token；文案走 `jlink` locale 命名空间。
- U5 组件不发工具调用；需要动作调 Remote 方法。

### 9.4 构建/打包（B）
- B1 `exports` 含 `.`、`./client`、`./types`、`./remote`、`./package.json`。
- B2 `dsh.client` 标记必须存在且 inject 列表真实。
- B3 `pnpm build` 后 `lib/index.js`、`lib/client.js`、`lib/remote.js` 齐全。
- B4 peerDependencies 与实际 import 一一对应（^0.1.0-rc.6）。
- B5 `python/` 目录 Phase 1/2 只放 README；Phase 3 才实现 driver.py 与 ndjson 协议。

### 9.5 禁止事项（F，红线）
- F1 禁用 `dsh-mcp-client` 桥接 jlink_mcp 作为交付物。
- F2 禁绕过 DriverInterface 直接操作 pylink / J-Link DLL。
- F3 禁把 RTT 高频数据写进 projection 或 session 事件日志。
- F4 禁 UI 直接读工具注册表拿数据（UI 数据走 Remote/projection）。
- F5 禁把插件行放进 agent preset / isolate realm（D2）。
- F6 禁修改 DSH checkout 内任何文件（本包完全自包含）。
- F7 program_flash 默认 `verify=true`，禁跳校验。

---

## 10. 分阶段实施（每阶段以 DoD 验收）

### Phase 0（已完成）本设计文档。

### Phase 1 — 骨架跑通（无硬件）
范围：package.json/tsconfig/tsdown；MockDriver；JLinkService 骨架；3 工具（list_jlink_devices / get_connection_status / halt_cpu）；`jlink/status` Remote；会话头状态灯；装载验证。
**完成定义（全部满足才算完成）：**
- [ ] `pnpm install && pnpm build` 产物齐全（B3）
- [ ] `--dump-config` 可见 jlink 插件行
- [ ] 浏览器会话头出现状态灯（mock：灰=disconnected；弹窗可用）
- [ ] 模型可调用 3 个工具并返回合法 envelope
- [ ] host 插件改一行 → 无重启热更新生效

### Phase 2 — 全量工具 + 补丁 + 首批视图
范围：23 工具全量；PatchRegistry + FlagchipPatch（XML 解析）；toolview：hexdump、寄存器表、芯片卡、连接卡。
**DoD：**
- [ ] match_chip_name 测试向量与 jlink_mcp 一致：FC7300F4MDD → FC7300F4MDDxXxxxT1C；FC7300F4MDDS → FC7300F4MDSxXxxxT1C；多命中时 T1C>T1B>T1A
- [ ] 浏览器工具结果渲染为组件视图（非纯文本卡片）
- [ ] 23 工具在 MockDriver 下含错误分支全部行为合理

### Phase 3 — 真硬件 + RTT + 推送
范围：PythonDriver（ndjson RPC 协议 + driver.py 复用 jlink_mcp 逻辑）；rtt/gdb 工具；RTT 控制台；projection 推送 + flash 实时进度。
**DoD：** 真板 connect/halt/read_memory 成功；RTT 终端实时出数据；烧录进度条推进；断线重连成功一次。

### Phase 4 — 可选增强
Node 直驱 DLL、SVD 工具、多厂商补丁示例、语义检索。

---

## 11. 验收清单（最终交付）

- [ ] 文件夹整体搬移到新路径后 install+build+装载全通过（自包含）
- [ ] 第 9 章每条约束自查通过
- [ ] README 含安装/配置/工具目录/常见错误
- [ ] tests/ 含 mock 单测（patch 匹配、envelope 契约、状态机）
- [ ] 无 console.error 泄漏；UI 卸载无订阅泄漏

---

## 12. 风险与开放问题

- **R1 typert-generator 不在环境** → D4：手写 src-json 贡献（已有真实基准文件可对齐）。
- **R2 remote 事件不可扩展**：`ctx.remote.$on` 的合法键来自 app 侧固定白名单（`dsh-api-remotes` 的 `API_REMOTE_FORWARDED_EVENTS`），树外插件无法新增 → 因此 D3 用 projection + RPC，**不用 remote events**。若将来需要真推送事件，须改 web app 装配，不属于本包范围。
- **R3 pylink 仅 Python** → D1 PythonDriver 覆盖。
- **R4 Flash 长耗时** → timeoutMs 300s + 进度投影。
- **R5 rc.6 API 演进** → 附录 B 基准文件路径化，升级时重核对。

---

## 附录 A：jlink_mcp → dsh-jlink 逐模块映射

| jlink_mcp 文件 | dsh-jlink 文件 | 说明 |
|---|---|---|
| server.py | src/index.ts + tools/* | 工具注册（@mcp.tool → ctx.tools.register） |
| jlink_manager.py | src/service.ts | 单例 → Service + 状态机 |
| config_manager.py | src/config.ts | Pydantic → zod |
| svd_manager.py | （Phase 4）src/svd.ts | 保留 pickle 缓存思路 |
| device_patch_interface.py | src/patch/interface.ts | ABC → TS interface |
| device_patch_manager.py | src/patch/registry.ts | 单例注册器 → Service |
| plugins/flagchip_patch.py | src/patch/flagchip.ts | XML 解析 + 预计算小写字典 + lru_cache → Map |
| models/*.py | src/types.ts | Pydantic → zod schema |
| exceptions.py | src/errors.ts | 错误码枚举（JLINK_NOT_HALTED 等） |
| utils.py | src/utils.ts | logger/hexdump 等 |
| （新增） | src/driver/* | **jlink_mcp 没有的驱动抽象层（D1）** |
| （新增） | src/client/* | **可视化面（本设计最大增量）** |
| （新增） | src/remote-spec.ts | Remote RPC 手写贡献（D4） |

## 附录 B：已验证 API 速查（rc.6 基准，编码前必读）

本机基准路径（npx 缓存）：`C:\Users\qxw0112\AppData\Local\npm-cache\_npx\1e7f6d9597241db0\node_modules\@deepseek-ai\`。换机器后以 **profile 的 node_modules 内同版本包** 为准。

| 主题 | 基准文件 / 包 | 要点 |
|---|---|---|
| 工具注册 | dsh-tools/lib/types/index.d.ts | `register(def)`；ToolSchema={name,description,parameters(JSON Schema)}；output={schema,render,presentationMeta?}；execute(args,exec)；timeoutMs?；isConcurrencySafe? |
| 插件/服务 | cordis/src/service.ts、registry.ts | `Service` 基类 `super(ctx,name)`；Plugin=Function/Constructor/Object(apply) |
| Remote 声明 | dsh-typert-protocol/lib/types/* | `@Remote`/`@RemoteScope`/`TypertRemoteService`/`bindTypertRemote`；SRC 限制；InvocationDescriptor 字段 |
| TYPERT 基准 | dsh-goal/lib/typert.host.js | `export const TYPERT = {package,face,schemas,invocations}` |
| TYPERT_REMOTE 基准 | dsh-goal/lib/typert.remote-client.js | client 挂载贡献数据形状 |
| 事件选择集 | dsh-typert-protocol/lib/types/types.d.ts | `TypertRemoteEventSelection`（声明合并）；注意 R2：运行时白名单在 app 侧 |
| Projection | dsh-session-projection/README.md | `ctx.sessionProjections.register({key,schema,init,apply,view,stateVersion})` |
| Client 挂载/订阅 | dsh-api-gateway/lib/client.js | `$mount(contribution)`/`$on(event)` |
| dsh.client 标记 | dsh-client-ui-jobs/package.json | `"dsh":{"client":{"inject":[...],"platform":"web"}}` + exports["./client"] |
| toolview 槽 | dsh-client-ui-tool/README.md | 键控 `tool.call.toolview`；`ctx.slots.inject(...)` + `register({name,key},Component)` |
| 会话头槽 | dsh-client-ui-jobs/README.md | `conversation.session.header.actions` |
| slot 系统 | dsh-client-ui-slots/README.md | register({name,children?,store?,inject?,key?},Component)；SlotMap 声明合并 |
| client runtime | dsh-client-runtime/README.md | projections 客户端读取（faceOf/useProjection） |

## 附录 C：术语

host plane（主机面，Node）/ client plane（浏览器面）/ 槽 slot（UI 插槽）/ 键控槽（按 key 路由的链式槽）/ realm（服务作用域）/ projection（会话投影：事件折叠出的可推送小快照）/ SRC（无生成描述符的 Remote fallback）/ TYPERT（Typert RPC 生成产物与协议）/ envelope（`{success,data,message,error}` 信封）