# @can/dsh-jlink — DSH 原生 J-Link 调试插件

Native DeepSeek Harness (Cordis) plugin: J-Link debugging as first-class tools,
device patches and browser visualization. 设计规格见 [DESIGN.md](./DESIGN.md)，
设计思路复盘见 [DESIGN-REVIEW.md](./DESIGN-REVIEW.md)。

## 状态

- ✅ **Phase 1+2**：骨架、23 个工具、补丁注册器、toolview 视图族（已通过 typecheck / 25 单测 / 构建冒烟）
- ✅ **Phase 3（已真机验证）**：PythonDriver（ndjson RPC + pylink 2.0.0）、状态灯 + 连接/暂停/运行/复位、RTT 服务层
- ✅ **Flash 三件套（STM32 真机验证）**：program_flash 走 pylink 原生 DLL 管线（进度事件）、verify_flash 读回比对、erase_flash 全片擦除；FC7300 需 jlink_mcp loader 管线（后续）
- ⏳ **Phase 3 剩余**：RTT 固件联调、会话投影推送
- 真机记录：**J-Link WiFi (S/N 941000021) · JTAG · Cortex-M4 r0p1**，halt / 寄存器 / SRAM 读写回环 / 断点 / run 全部实测通过

## 特性

- **23 个原生工具**（与 jlink_mcp 同名）：连接管理、设备信息、内存/寄存器、调试控制、Flash、芯片名智能匹配
- **浏览器可视化**：会话头 J-Link 状态灯（实时轮询 Remote RPC，弹窗内直接连接/断开/暂停/运行/复位；连接面板带**芯片名可搜索下拉**（补丁注册器 27 款，输入即过滤）与 SWD/JTAG 接口选择）
- **设备补丁注册器**：Flagchip 内置 6 款设备（FC7300F4MDDxXxxxT1C 等）+ Builtin 内置 21 款 DLL 常见芯片（STM32F1xx/F2/F4/H7/L4/G4、nRF52、LPC、TM4C），匹配算法与 jlink_mcp 一致（精确→前缀→包含→模糊 + T1C>T1B>T1A 优先级）
- **可插拔驱动层**：mock（无硬件开发）/ python（真机，ndjson RPC 子进程）/ gdb（规划）
- **统一信封**：所有工具返回 `{success, data, message, error}`，错误码结构化（JLINK_NOT_HALTED 等）

## 架构

```
浏览器（Client）            Host（Node）                 硬件侧
状态灯/toolview 组件   →  Remote RPC (Typert)  →  JLinkService → DriverInterface
ctx.remote.jlink.*        ctx.tools.register        │    MockDriver / PythonDriver
                           23 个工具 → JLinkCore     │    │
                          PatchRegistry → Flagchip   │    │ ndjson RPC (stdio)
                                                    └── python/driver.py → pylink → J-Link
```

数据通道：工具调用（模型→Host）、Remote RPC（UI→Host，返回 `{ok, value}` 信封）、RTT 长轮询、toolview 键控槽。

## 安装（挂进 DSH profile）

```bash
# 1) profile 依赖（link: 安装，与 dsh-better-sidebar 同一模式）
#    profiles/<name>/package.json:
#      "dependencies": { "@can/dsh-jlink": "link:C:/1.Projects/Can/dsh-jlink-plugin" }
#      "dsh": { "profile": { "bundles": [..., "@can/dsh-jlink"] } }

# 2) 安装依赖并构建
pnpm install
pnpm build          # 产物：lib/index.mjs(host) + lib/client.js(browser) + lib/remote.mjs

# 3) 启动
dsh web
# 验证：--dump-config 可见 jlink 行；浏览器会话头出现 J-Link 状态灯
```

插件行由包内 `cordis.patch.yml`（`dsh.bundle.patch`）自动注入，**不要**再在 profile 的 cordis.patch.yml 里手动加 jlink 行（会双挂载）。

## 配置（src/config.ts，zod，只增不改）

| 键 | 默认 | 说明 |
|---|---|---|
| driver | python | mock / python / gdb(规划) |
| pythonCommand | python | PythonDriver 解释器（真机建议指向 jlink_mcp 的 venv） |
| pythonDriverPath | 内置 python/driver.py | 驱动脚本路径 |
| defaultInterface | JTAG | SWD / JTAG |
| defaultCore | Cortex-M4 | 通用内核回退（镜像 jlink_mcp generic_core_fallback） |
| defaultTimeoutMs | 10000 | 工具默认超时 |
| maxMemoryReadSize | 65536 | 单次最大读内存 |
| patchDir | 内置 resources/JLinkDevices.xml | 外部设备库目录 |
| autoReconnect | false | 断线重连（指数退避） |
| projectionEnabled | false | 会话投影单元（Phase 3 推送） |

## 工具目录（23）

- **connection**：list_jlink_devices / connect_device / disconnect_device / get_connection_status / match_chip_name
- **device**：get_target_info / get_target_voltage / scan_target_devices / list_device_patches
- **memory**：read_memory / write_memory / read_registers / write_register
- **debug**：reset_target / halt_cpu / run_cpu / step_instruction / get_cpu_state / set_breakpoint / clear_breakpoint
- **flash**：erase_flash / program_flash / verify_flash（✅ STM32 真机验证；erase 为全片擦除，见限制）

约束：内存/寄存器读写前必须已 halt（工具内检查，未 halt 返回 JLINK_NOT_HALTED）。

## 真机验证记录（2026-08，J-Link WiFi · JTAG · Cortex-M4）

| 操作 | 结果 |
|---|---|
| 枚举 | ✅ J-Link WiFi, S/N 941000021 |
| connect（FC7300F4MDDxXxxxT1C → DLL 无此芯片 → 自动回退 Cortex-M4） | ✅ |
| halt / run（pylink 2.0.0 无 go()，直调 DLL JLINKARM_Go） | ✅ |
| read_registers | ✅ R0=0x2002ffe0, MSP=0x2002ffcc, XPSR=0x41000003, PRIMASK=1 |
| read/write memory @0x20000000 | ✅ 写 aa bb cc dd 读回一致 |
| 断点 set/clear | ✅ |
| 电压 | ✅ exec_command VTarget 解析 |

## 已知限制

1. **Flash 按设备而异**：DLL 已知设备（如 STM32 内置型号）三件套直接可用——program_flash 走 pylink 原生管线（含进度事件）、verify_flash 读回比对、erase_flash 为**全片擦除**（pylink 仅绑定 JLINK_EraseChip）。FC7300 不在 DLL 设备表，仍需 jlink_mcp 的 flash 管线 + `Devices/Flagchip/FC7300/*.elf` 加载器（后续接入）
2. **RTT 需固件配合**：目标固件执行 `SEGGER_RTT_Init()` 后 rtt_read/rtt_write 才能取到数据
3. **SVD / GDB server / 多厂商补丁**：规划中
4. **client 端 UI 为内联样式**：ui-primitives token 细化待做

## 开发

```bash
pnpm install          # devDeps 含 @deepseek-ai/* 的 file: 引用（本机 rc.6）
pnpm build            # 主构建(ESM) + client(CJS) + wrap-client.mjs 包装为 web shell 模块
pnpm typecheck        # tsc --noEmit 严格模式
pnpm test             # vitest：补丁匹配向量 / 信封 / 状态机 / remote 描述符一致性（25 个）
node scripts/smoke.mjs          # 构建产物冒烟（23 工具注册）
node scripts/hw-test.mjs        # 真机驱动全流程测试（需要 J-Link + 板子）
node scripts/tool-catalog.mjs   # 打印模型可见的工具目录
```

注意：pnpm 无 TTY 时构建可能触发 install 确认，用 `CI=true pnpm build`。

## 目录结构

```
src/index.ts            # host 入口 apply（服务/补丁/工具/typert 装配，inject: ['tools','typert']）
src/service.ts          # JLinkService：Remote 端点(remote*) + 工具面
src/core.ts             # JLinkCore：连接状态机（无框架依赖，可单测）
src/driver/             # DriverInterface + MockDriver + PythonDriver(ndjson RPC)
src/patch/              # DevicePatch 接口 + PatchRegistry + FlagchipPatch（匹配算法平移）
src/tools/              # 23 个工具（ToolDefinition 风格）
src/remote-spec.ts      # 手写 Typert 贡献（host TYPERT + client TYPERT_REMOTE，strict codec + zod）
src/projection.ts       # 会话投影单元（Phase 3）
src/client/             # 浏览器面：状态灯组件 + toolview 视图族 + remote 挂载
python/driver.py        # Python 驱动：ndjson JSON-RPC + pylink（协议见 python/README.md）
scripts/                # smoke / hw-test / tool-catalog / wrap-client
tests/                  # 25 个单测
```

## 参考

- [jlink_mcp](https://github.com/cyj0920/jlink_mcp)：工具语义、匹配算法、补丁 XML 数据来源
- [DSH-better-sidebar](https://github.com/cyj0920/DSH-better-sidebar)：树外 bundle 插件先例
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：@deepseek-ai/dsh@0.1.0-rc.6 事实基准
