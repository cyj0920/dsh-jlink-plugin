# dsh-jlink 设计思路复盘（供 Review）

> 本文是阶段性收束的设计回顾：目标、架构决策、联调踩坑、现状、以及**留给你的开放设计问题**。
> 规格书（实现约束）见 [DESIGN.md](./DESIGN.md)。

## 1. 任务目标回顾

把 jlink_mcp（Python MCP 服务器）的「管理器 + 工具 + 补丁注册」逻辑，重写为 **DSH 原生 Cordis 插件**（host + 浏览器双面），并把**可视化**做成一等能力。

## 2. 核心设计决策（按重要性排序）

### D1 驱动层可插拔（DriverInterface）
服务之下加驱动抽象：`mock`（无硬件开发全部 UI）/ `python`（真机，ndjson RPC 子进程复用 pylink）/ `gdb`（规划）。**决策理由**：硬件后端与上层完全解耦；未来可换 Node 直驱 DLL 而零改动上层。

### D2 数据通道分频（不依赖 remote events）
慢状态（连接/芯片/电压）→ Remote RPC 轮询；快数据（RTT）→ RPC 长轮询；**明确不用 `ctx.remote.$on`**——树外插件无法扩展 app 侧的事件转发白名单（`API_REMOTE_FORWARDED_EVENTS` 是固定数组）。这是「可行的最小闭环」和「理论最优推送」之间的务实选择。

### D3 手写 Typert 贡献（不依赖生成器）
环境没有 dsh-typert-generator，手写 host/client 双份贡献（strict codec + zod）。**实测可行**，且换来对协议的完全掌控；代价是与生成器产物需手动保持同步。

### D4 补丁注册器完整平移
匹配算法（精确→前缀→包含→模糊 + T1C>T1B>T1A）逐行为对齐 jlink_mcp，测试向量共用。**联调中发现**：jlink_mcp 的 fuzzy 规则实际上是「连续字母折叠」（FC7300F4MDDS→FC7300F4MDS），不是通用编辑距离。

## 3. 联调踩坑记录（DSH 深层机制，价值极高）

这七层问题是本次任务最宝贵的产出，已全部回写 DESIGN.md 硬约束：

| # | 现象 | 根因 | 解法 |
|---|---|---|---|
| 1 | host 启动报 `cannot get property "tools" without inject` | loader Proxy 守卫，inject 必须声明在**配置树行**（非模块导出） | cordis.patch.yml 行加 `inject: ['tools','typert']` |
| 2 | client 挂载后访问 `ctx.remote.jlink` 报 same | client Proxy 守卫同样存在 | 见 #3 |
| 3 | 声明 `remote.jlink` 后**启动自死锁**（服务由本插件 apply 内 $mount 创建，loader 等不到） | 自包含插件「挂载者即消费者」矛盾 | **消费侧改用 `ctx.reflect.get('remote.jlink')` 原生注册表查询**（reflection 层无守卫） |
| 4 | 所有按钮「没反应」 | remote 方法返回 `{ok, value}` 信封（不 reject），被当裸值用 | 解包 + 5s 超时 + 弹窗红字错误 |
| 5 | `expected 3 argument(s), got 1` | client remote 方法是**位置参数**（按描述符参数顺序） | 传 `('JTAG', chip, 'Cortex-M4')` |
| 6 | `missing "chip", "core"` | 网关要求 args **完整包含全部描述符字段**，undefined 会被丢弃 | 全部传实值（空串=通用内核） |
| 7 | pylink 2.0.0 API 全部猜错 | 无 go()/TIF；寄存器用索引；halted() 是方法；connected_emulators 在实例上 | 逐项探测修正（记录见文末附录） |

**方法论沉淀**：DSH 的插件开发 = 先读 node_modules 里对应包的 .d.ts/.js（事实基准），再写代码；运行时问题用「分阶段日志」（浏览器 console + 服务端终端 + 驱动 stderr 三层）快速二分。

## 4. 现状盘点

- ✅ 全链路已验证：UI 状态灯 → Remote RPC → 网关 → JLinkService → PythonDriver → pylink → 真板（J-Link WiFi · Cortex-M4）
- ✅ 23 工具注册就绪（新会话可见）；25 单测；构建冒烟
- ⚠️ Flash 三件套：待接 jlink_mcp flash loader 管线（`Devices/Flagchip/FC7300/*.elf`）
- ⚠️ RTT：服务层就绪，待固件 SEGGER_RTT_Init() 联调
- ⏳ 未验证：会话投影推送（projectionEnabled）、GDB server、SVD、多厂商补丁

## 5. 开放设计问题（请你 Review）

### Q1 Flash 烧录方案（下一步优先级最高）
- **A. 复用 jlink_mcp 管线**：驱动子进程 import jlink_mcp 的 flash 实现（含补丁 XML + .elf loader）。快，但引入对 Python 包的强依赖
- **B. 直接调 DLL flash 接口**：pylink 有 flash_write8/flash_file，但 FC7300 不在 DLL 设备表，需 JLinkDevices.xml 打进 DLL 目录（pylink 是临时解包 DLL，需研究设备补丁加载机制）
- 我倾向 A（先打通），B 作为后续优化

### Q2 驱动进程生命周期
当前 PythonDriver 惰性 spawn、随插件 fiber dispose。问题：DSH 断线重连/会话切换时驱动进程是否保持？是否需要驱动进程常驻 + 心跳？

### Q3 状态推送的下一步
轮询 2s 已可用。要真推送（<100ms 响应）需投影或改 app 侧白名单。RTT 控制台做到什么程度（终端流式 vs 定时刷新）？

### Q4 自动连接策略
现在状态灯灰→手动连接。要不要加 `autoConnect: true`（启动即连通用内核）？权衡：与 jlink_mcp 并发占用探针的冲突风险。

### Q5 多厂商补丁与发布
补丁注册器已就绪，是否要做 ST/其他厂商补丁示例？包名 `@can/dsh-jlink` 是否发布到 npm（peerDeps 依赖 rc.6 内部版本，发布需谨慎）？

### Q6 UI 完善
内联样式 → ui-primitives token；toolview 组件接真实 ToolCallOwner 负载验证（现在对 props 是防御性提取）；locale 完整接入。

## 附录：pylink 2.0.0 关键 API 备忘（探测验证）

- `JLinkInterfaces.SWD/JTAG`（无 jl.TIF）
- `jl.connected_emulators()` → `JLinkConnectInfo`（SerialNumber/acProduct），Library 上无此方法
- `register_list()` 返回**索引**，`register_name(idx)` 取名；SP/LR/PC 不在表内（用 MSP/PSP）
- `jl.halted()` / `connected()` 是**方法**
- 无 `go()` → `jl._dll.JLINKARM_Go()`
- `breakpoint_set(addr)` 返回句柄，`breakpoint_clear(handle)`
- `exec_command('VTarget = %.2f')` 读电压
