# @can/dsh-jlink — DSH 原生 J-Link 调试插件

Native DeepSeek Harness (Cordis) plugin: J-Link debugging as first-class tools,
device patches and browser visualization. 设计规格见 [DESIGN.md](./DESIGN.md)。

## 状态（实现进度）

- ✅ Phase 1 骨架：MockDriver、JLinkCore 状态机、连接/状态/暂停 3 工具、`jlink/status` Remote、会话头状态灯
- ✅ Phase 2 全量：23 个工具、PatchRegistry + FlagchipPatch（内置 6 款 Flagchip 设备）、toolview 视图族（hexdump/寄存器/芯片卡/进度条）
- 🚧 Phase 3 代码已就位（未硬件验证）：PythonDriver + python/driver.py（ndjson RPC）、RTT 工具与终端视图、projection 单元（需事件提交路径验证）
- ⏳ Phase 4：Node 直驱 DLL、SVD、多厂商补丁

## 安装

```bash
# 1) 安装依赖并构建（构建会同时产出 host / client / remote 三份产物）
pnpm install
pnpm build

# 2) 挂进 DSH profile（profile 名可自定；具体命令以 DSH CLI 行为参考为准）
dsh plugin --profile can add <本目录路径或打包名>

# 3) profile 的 cordis.patch.yml（host plane 根层，勿放进 isolate realm）：
#    - id: jlink
#      name: '@can/dsh-jlink'
#      config:
#        driver: mock          # mock | python
#        defaultInterface: JTAG

# 4) 启动并验证
dsh web
dsh --profile web --dump-config        # 应能看到 jlink 插件行
```

## 配置（src/config.ts，zod）

| 键 | 默认 | 说明 |
|---|---|---|
| driver | mock | mock / python / gdb(未实现) |
| pythonCommand | python | PythonDriver 的解释器 |
| pythonDriverPath | 内置 python/driver.py | 驱动脚本路径 |
| defaultInterface | JTAG | SWD / JTAG |
| defaultTimeoutMs | 10000 | 工具默认超时 |
| maxMemoryReadSize | 65536 | 单次最大读内存字节数 |
| patchDir | 内置 resources/JLinkDevices.xml | 外部设备库目录 |
| autoReconnect | false | 断线重连（500ms 起指数退避，上限 30s，10 次） |
| projectionEnabled | false | Phase 3：注册 jlink 会话投影单元 |

## 工具目录（23，与 jlink_mcp 同名）

connection: list_jlink_devices / connect_device / disconnect_device / get_connection_status / match_chip_name
device: get_target_info / get_target_voltage / scan_target_devices / list_device_patches
memory: read_memory / write_memory / read_registers / write_register
debug: reset_target / halt_cpu / run_cpu / step_instruction / get_cpu_state / set_breakpoint / clear_breakpoint
flash: erase_flash / program_flash / verify_flash
（rtt_* 与 gdb_* 已实现服务层，工具注册随 Phase 3 硬件验证后启用；RTT Remote 端点 `jlink/rttRead` 已注册）

## 可视化

- 会话头 J-Link 状态灯（`conversation.session.header.actions` 槽）+ 弹窗快捷操作（暂停/运行/复位）
- 工具结果键控视图（`tool.call.toolview`）：read_memory hexdump、read_registers 表格、get_target_info 芯片卡、flash 进度条
- Remote RPC（手写 strict codec 贡献，D4）：status / halt / run / reset / rttRead

## 开发

```bash
pnpm typecheck   # tsc --noEmit（严格模式）
pnpm test        # vitest：补丁匹配向量 / 信封 / 状态机（MockDriver）
pnpm watch       # tsdown --watch（host 产物热重建）
```

## 注意事项

- 本包完全自包含：整体搬移后只需 `pnpm install && pnpm build`。
- 客户端 bundle 经 scripts/wrap-client.mjs 包装为 web shell 的 `__ModuleLoader__.load` 格式；client 改动需重建后刷新浏览器。
- Python 驱动（Phase 3）需 pylink-square；flash 三件套待接入 jlink_mcp 的 flash loader 管线。


## 实现偏差记录（对照 DESIGN.md 验收用）

| DESIGN.md 条目 | 实现情况 | 说明 |
|---|---|---|
| §6.4 PatchRegistry extends Service | 已实现为纯类 + `ctx.provide('jlink.patches', ...)` | 为可单测性改为普通类注册为服务，功能等价 |
| §6.7 @Remote 装饰器 | **已移除**，改为普通方法 + 手写 InvocationDescriptor | 环境无装饰器转译；网关按注册描述符分发（D4 手写贡献路径），装饰器仅对生成器有意义 |
| U4 样式 token / locale | 内联样式 + 自有 locale 字典 | ui-primitives token 细化留待 Phase 3 浏览器验证时接入 |
| §10 Phase 3 | 代码已就位（PythonDriver / RTT / projection / 视图），未硬件验证 | flash 三件套在 driver.py 中返回 JLINK_UNSUPPORTED，待接入 jlink_mcp flash 管线 |
| client 事件流 | 未用 `ctx.remote.$on` | 树外白名单限制（DESIGN R2），状态灯用 2s 轮询 + Remote RPC |
