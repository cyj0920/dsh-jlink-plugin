<div align="center">

# 🔌 dsh-jlink

**DeepSeek Harness 原生 J-Link 调试插件**

*让 AI 助手直接调试真实硬件 —— 23 个一等工具 · 浏览器可视化面板 · 设备补丁注册器*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9%20strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tests](https://img.shields.io/badge/unit_tests-25%2F25-brightgreen)](../../actions)
[![License](https://img.shields.io/badge/license-MIT-green)](#license)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-rc.6-blue)](https://github.com/deepseek-ai/deepseek-harness)

**@can/dsh-jlink** · 在 DSH 会话里连接、暂停、读写内存寄存器、设断点、烧录固件 —— 全部通过自然语言完成。

</div>

---

## 🎯 为什么是「原生」

MCP 桥接方案只能递给模型一个工具名；本插件以 **Cordis 插件身份**深度集成 DeepSeek Harness：

| MCP 桥接 | dsh-jlink 原生 |
|---|---|
| 工具只有名字与 schema | 一等工具：guard / restrict / 超时 / 并发策略 / agent scope 全套治理 |
| 结果永远是纯文本 | `toolview` 键控槽：hexdump、寄存器表、Flash 进度条等专属组件 |
| 单例脚本自管生命周期 | Cordis Service 托管：依赖注入、HMR 热更新、fiber 销毁清理 |
| 配置靠环境变量 | 分层 zod 配置，`--dump-config` 可检查 |

工具语义、芯片匹配算法与 [jlink_mcp](https://github.com/cyj0920/jlink_mcp)（Python MCP 版）完全对齐，测试向量共用——迁移零心智成本。

## ✨ 特性总览

| | |
|---|---|
| 🛠 **23 个一等工具** | 连接管理 · 设备信息 · 内存/寄存器 · 调试控制 · Flash 三件套，统一 `{success, data, message, error}` 信封与结构化错误码 |
| 🖥 **浏览器可视化** | 会话头状态灯常驻，弹窗直连/暂停/运行/复位；内存 hexdump、寄存器表格、芯片卡、RTT 终端、烧录进度五类视图 |
| 🔍 **芯片选择器** | 连接面板内置**可搜索下拉**（27 款设备名册，输入即过滤），SWD/JTAG 一键切换，通用内核自动识别并如实上报 |
| 🧩 **设备补丁注册器** | 匹配算法逐行平移 jlink_mcp（精确→前缀→包含→模糊 + T1C>T1B>T1A）；Flagchip 与常见 DLL 内置芯片开箱即用，第三方厂商可作为独立插件运行时挂载 |
| 🔌 **可插拔驱动层** | `mock` 无硬件开发全部 UI · `python` 真机（ndjson RPC 子进程 + pylink）· `gdb` 规划中 |
| ✅ **真机打磨** | 两块真实板卡全流程实测，含 **Flash 备份→擦除→烧录→校验→还原** 完整往返（见下文验证记录） |

## 🚀 快速开始

> **前置条件**：DeepSeek Harness rc.6 · J-Link 驱动已安装 · Python 3.10+ 且可安装 [pylink-square](https://github.com/pylink/pylink) 2.0.0（真机模式）

**1️⃣ 挂进 profile**（link 安装，树外 bundle 模式）

```jsonc
// profiles/<name>/package.json
{
  "dependencies": {
    "@can/dsh-jlink": "link:C:/path/to/dsh-jlink-plugin"
  },
  "dsh": { "profile": { "bundles": [ /* ... */, "@can/dsh-jlink" ] } }
}
```

**2️⃣ 构建插件**

```bash
pnpm install
CI=true pnpm build   # 产物：lib/index.mjs(host) + lib/client.js(browser) + lib/remote.mjs
```

**3️⃣ 启动并验证**

```bash
dsh web
# ✔ --dump-config 可见 jlink 行
# ✔ 浏览器会话头出现 J-Link 状态灯
```

> [!IMPORTANT]
> 插件行由包内 `cordis.patch.yml`（`dsh.bundle.patch` 层）自动注入。
> **不要**再在 profile 的 cordis.patch.yml 里手动添加 jlink 行——会双挂载。

无硬件？把配置里 `driver` 改成 `mock`，即可开发/演示全部工具与 UI。

## 🏗 架构

```
浏览器（Client plane）           Host（Node plane）                  硬件侧
┌──────────────────────┐   ┌───────────────────────────┐   ┌──────────────────┐
│ 会话头状态灯 / 弹窗    │RPC│  JLinkService (Typert)     │ndjson│ python/driver.py │
│ toolview 视图族 ×5    │◄─►│    └ JLinkCore 连接状态机   │◄───►│  └ pylink 2.0.0  │
│ hexdump·寄存器·RTT…  │   │    └ DriverInterface       │stdio│    └ J-Link DLL  │
└──────────────────────┘   │         ├ MockDriver        │    └───────┬──────────┘
                           │         └ PythonDriver      │            ▼
ctx.tools.register ◄───────│  PatchRegistry → Flagchip   │       J-Link → 目标板
23 个工具（模型调用面）      │              → Builtin      │
```

数据通道：工具调用（模型→Host）· Remote RPC（UI→Host，`{ok,value}` 信封）· RTT 长轮询 · toolview 键控槽。

## 🛠 工具目录（23）

| 分组 | 工具 |
|---|---|
| **连接管理** | `list_jlink_devices` · `connect_device` · `disconnect_device` · `get_connection_status` · `match_chip_name` |
| **设备信息** | `get_target_info` · `get_target_voltage` · `scan_target_devices` · `list_device_patches` |
| **内存/寄存器** | `read_memory` · `write_memory` · `read_registers` · `write_register` |
| **调试控制** | `reset_target` · `halt_cpu` · `run_cpu` · `step_instruction` · `get_cpu_state` · `set_breakpoint` · `clear_breakpoint` |
| **Flash** | `erase_flash` · `program_flash` · `verify_flash` |

> [!NOTE]
> 内存/寄存器读写前必须已 halt（工具内前置检查，未 halt 返回 `JLINK_NOT_HALTED`）。
> `match_chip_name` 支持 精确 → 前缀 → 包含 → 模糊 四级匹配，输 `FC7300F4MDD` 即得完整型号。

## ⚙ 配置

zod schema 只增不改；经 `cordis.patch.yml` 行内 `config:` 覆盖。

| 键 | 默认 | 说明 |
|---|---|---|
| `driver` | `python` | mock / python / gdb（规划） |
| `pythonCommand` | `python` | PythonDriver 解释器（建议指向装好 pylink 的 venv） |
| `pythonDriverPath` | 内置 python/driver.py | 驱动脚本路径 |
| `defaultInterface` | `JTAG` | SWD / JTAG（连接面板可临时切换） |
| `defaultCore` | `Cortex-M4` | 通用内核回退（镜像 jlink_mcp generic_core_fallback） |
| `defaultTimeoutMs` | `10000` | 工具默认超时 |
| `maxMemoryReadSize` | `65536` | 单次最大读内存字节数 |
| `patchDir` | 内置 resources/JLinkDevices.xml | 外部设备库目录 |
| `autoReconnect` | `false` | 断线重连（指数退避） |
| `projectionEnabled` | `false` | 会话投影推送单元 |
| `remoteEnabled` | `true` | 浏览器 Remote RPC 面 |

## ✅ 真机验证记录

<details open>
<summary><b>🅰 Flagchip FC7300 · JTAG · Cortex-M4 r0p1</b>（J-Link WiFi S/N 941000021）</summary>

| 操作 | 结果 |
|---|---|
| connect（FC7300F4MDDxXxxxT1C → DLL 无此芯片 → 自动回退通用内核） | ✅ |
| halt / run（pylink 2.0.0 无 go()，直调 DLL `JLINKARM_Go`） | ✅ |
| read_registers | ✅ R0=0x2002ffe0 · MSP=0x2002ffcc · XPSR=0x41000003 |
| SRAM 读写回环 @0x20000000 | ✅ 写 aa bb cc dd 读回一致 |
| 断点 set/clear | ✅ |

</details>

<details>
<summary><b>🅱 ST STM32F103ZE · SWD · Cortex-M3</b>（J-Link WiFi S/N 941000024）</summary>

| 操作 | 结果 |
|---|---|
| SWD + DLL 内置设备精确连接，自动识别内核 Cortex-M3 | ✅ |
| 调试链路：halt/run/寄存器/SRAM 回环/断点 | ✅ 16/16 步全绿 |
| 向量表读取 @0x08000000（SP=0x20005000 · Reset=0x08000401） | ✅ |
| **Flash 往返**：备份 512KB（8×64K，3.5s）→ 全片擦除 → 空白校验 → 图案烧录+读回校验 → 整镜像还原（2.4s）→ 二次校验 | ✅ 字节级一致 |
| 进度事件流（Compare/Erase/Program → erasing/programming/verifying） | ✅ |

</details>

## ⚠ 已知限制

1. **Flash 能力按设备而异** — DLL 内置设备（STM32 等）三件套直接可用；`erase_flash` 为**全片擦除**（pylink 仅绑定 `JLINK_EraseChip`）。FC7300 不在 DLL 设备表，需接入 jlink_mcp 的 flash loader 管线（规划中）
2. **电压读数依赖 DLL 版本** — 部分 DLL 不支持 VTarget exec 命令，此时显示 “—”
3. **RTT 需固件配合** — 目标固件执行 `SEGGER_RTT_Init()` 后才有数据
4. **规划中** — SVD 寄存器符号化 · GDB server · 多厂商补丁示例 · ui-primitives token 化

## 🧪 本地开发

```bash
pnpm install                # devDeps 以 file: 引用本机 @deepseek-ai/* rc.6
CI=true pnpm build          # 主构建(ESM) + client(CJS) + wrap-client 包装
pnpm typecheck              # tsc --noEmit 严格模式
pnpm test                   # vitest：匹配向量 / 信封 / 状态机 / remote 描述符一致性
```

| 脚本 | 用途 |
|---|---|
| `node scripts/smoke.mjs` | 构建产物冒烟（23 工具注册） |
| `node scripts/tool-catalog.mjs` | 打印模型可见的工具目录 |
| `node scripts/hw-test.mjs` | 真机全流程（Flagchip 板 · JTAG） |
| `node scripts/hw-test-stm32.mjs` | STM32 板冒烟（SWD，`JLINK_SERIAL` 可换探头） |
| `node scripts/hw-flash-test.mjs [--wipe]` | Flash 验证：只读检查 / 备份还原往返 |

> [!TIP]
> pnpm 无 TTY 时构建可能触发 install 确认，统一加 `CI=true`。
> 同一时刻一个探头只能被一个进程占用——测试前先退出 J-Link Commander / J-Flash。

## 📁 文档导航

| 文档 | 内容 |
|---|---|
| [DESIGN.md](./DESIGN.md) | 规格书：核心决策 D1-D6 · 硬约束清单 · rc.6 API 事实基准 |
| [DESIGN-REVIEW.md](./DESIGN-REVIEW.md) | 设计复盘：联调踩坑七层问题 · 开放设计问题 |
| [STRUCTURE.md](./STRUCTURE.md) | 跨仓库地图：插件 ↔ jlink_mcp ↔ 补丁资源 ↔ FC IDE |
| [python/README.md](./python/README.md) | ndjson RPC 协议与驱动实现说明 |

## 🙏 致谢

- [jlink_mcp](https://github.com/cyj0920/jlink_mcp) — 工具语义 · 匹配算法 · 补丁数据来源
- [DSH-better-sidebar](https://github.com/cyj0920/DSH-better-sidebar) — 树外 bundle 插件先例
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — `@deepseek-ai/dsh@0.1.0-rc.6` 事实基准

---

<div align="center">

**MIT License** © can · 在真实硬件上逐行打磨 🔧

</div>
