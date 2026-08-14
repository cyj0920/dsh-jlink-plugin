# dsh-jlink 仓库结构图（STRUCTURE）

> 三仓库 + FC IDE + DSH 的完整地图。事实基准：2026-08 实测。

## 1. 生态总览（跨仓库）

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        DeepSeek Harness (DSH)                              │
│  profiles/web:  dsh-base + dsh-web-app + dsh-better-sidebar                │
│                       └─ bundle: @can/dsh-jlink  ◄── link: 本仓库          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ dsh-jlink-plugin  (本仓库, 插件本体)                                  │   │
│  │  host: 服务/工具/补丁/Remote      client: 状态灯/视图                 │   │
│  └──────────────┬──────────────────────────────────────────────────────┘   │
└─────────────────┼──────────────────────────────────────────────────────────┘
                  │ spawn ndjson RPC (pythonCommand)
                  ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  python/driver.py  (插件内置, pylink 2.0.0)                                 │
│  use_tmpcpy=False 原地加载 JLink_x64.dll  ◄── 关键：设备表才能读到            │
└──────┬───────────────────────────────────┬─────────────────────────────────┘
       │ (导入/参考，可选)                   │ 加载 DLL + 设备补丁
       ▼                                   ▼
┌───────────────────┐      ┌───────────────────────────────────────────────┐
│ jlink_mcp 仓库      │      │ FC IDE J-Link 软件                             │
│ (Python MCP 服务器,  │      │ C:\01_IDE\Flagchip_FC_IDE_4.4.1\JLink\       │
│  语义/驱动来源, 参考) │      │  JLink_x64.dll + JLinkDevices.xml(59设备)      │
└───────────────────┘      │  Devices/Flagchip/**/.FLM + .JLinkScript        │
                            └───────────────┬───────────────────────────────┘
                                            │ 设备表/JLinkScript/.FLM
                                            ▼
                                      J-Link 硬件 → 目标板 (Cortex-M4)
┌────────────────────────────────────────────────────────────────────────────┐
│ jlink_device_patches 仓库 (可分发资源)                                       │
│  tool/JLink_Patch_v2.45/   ← 与 FC IDE Devices/ 同源 (补丁包)               │
│  tool/SVD_V1.5.6/*.svd     ← SVD 寄存器描述 (11 款芯片)                     │
└────────────────────────────────────────────────────────────────────────────┘
```

**关系**：`dsh-jlink-plugin` 是唯一运行物；`jlink_device_patches` 提供可分发资源（补丁 + SVD）；
`jlink_mcp` 是逻辑与数据来源（工具语义、匹配算法、SVD/缓存设计）；FC IDE 是设备补丁的**运行时宿主**。

## 2. dsh-jlink-plugin 内部结构

```
dsh-jlink-plugin/
├── package.json              # exports: .(host) / ./client / ./remote; dsh.bundle.patch + dsh.client
├── cordis.patch.yml          # bundle patch: 注入插件行 (id: jlink, inject: [tools,typert], config)
├── tsdown.config.ts          # 主构建: index/types/remote (ESM)
├── tsdown.client.config.ts   # client 构建 (CJS + zod 内联)
├── DESIGN.md                 # 规格书（硬约束, 实测回写 H11/U6 等）
├── DESIGN-REVIEW.md          # 设计思路复盘 + 开放问题 Q1-Q6
├── README.md                 # 用户文档
│
├── resources/
│   └── JLinkDevices.xml      # 内置精简 Flagchip 库（6 款；patchDir 可外置 59 款）
├── python/
│   ├── driver.py             # ndjson JSON-RPC 驱动（pylink, 原地 DLL, VTarget/寄存器/断点/RTT）
│   └── README.md             # RPC 协议文档
├── scripts/
│   ├── wrap-client.mjs       # client bundle → window.__ModuleLoader__.load 包装
│   ├── smoke.mjs             # 构建产物冒烟（23 工具注册）
│   ├── hw-test.mjs           # 真机全流程测试
│   └── tool-catalog.mjs      # 打印模型可见工具目录
│
├── src/                      # ── Host 面 ──
│   ├── index.ts              # apply(): 装配服务/补丁/工具/typert (inject: ['tools','typert'])
│   ├── service.ts            # JLinkService: Remote 端点(remote*) + 工具面委托
│   ├── core.ts               # JLinkCore: 连接状态机（无框架依赖, 单测友好）
│   ├── config.ts             # zod Config（driver/pythonCommand/jlinkDir/svdDir/...）
│   ├── types.ts / errors.ts / utils.ts
│   ├── remote-spec.ts        # 手写 Typert 贡献（strict codec + zod, host/client 双份）
│   ├── projection.ts         # 会话投影单元（Phase 3, 默认关）
│   ├── driver/
│   │   ├── interface.ts      # DriverInterface（可插拔契约）
│   │   ├── mock.ts           # MockDriver（无硬件开发）
│   │   ├── python.ts         # PythonDriver（ndjson RPC 子进程）
│   │   └── factory.ts        # 按 config.driver 创建
│   ├── patch/
│   │   ├── interface.ts      # DevicePatch 契约（vendorName/匹配/建议）
│   │   ├── registry.ts       # PatchRegistry（注册/匹配/查询）
│   │   └── flagchip.ts       # FlagchipPatch（XML 解析 + 算法平移）
│   └── tools/                # 23 个工具（connection/device/memory/debug/flash）
│       └── defs.ts           # ToolDefinition 助手 + envelope schema
│
├── src/client/               # ── 浏览器面 ──
│   ├── index.ts              # apply(): 挂载 remote → 注册状态灯 (inject: [...,'remote'])
│   ├── runtime.ts            # ctx.reflect.get('remote.jlink') 取命名空间（绕守卫不死锁）
│   ├── remote.ts             # $mount(手写贡献)
│   ├── header-control.tsx    # 会话头状态灯 + 弹窗（连接/断开/暂停/运行/复位）
│   ├── locale.ts             # zh/en 字典
│   └── toolviews/            # read_memory hexdump / registers 表 / chip 卡 / flash 进度 / RTT 终端
│
└── tests/                    # 25 个单测
    ├── patch-match.test.ts   # 匹配向量（与 jlink_mcp 共用）
    ├── envelope.test.ts      # 信封/hex 工具
    ├── core.test.ts          # 状态机（MockDriver）
    └── remote-spec.test.ts   # 描述符↔方法↔schema 一致性
```

## 3. 运行时数据流

```
模型工具调用                    浏览器 UI
   │                              │
   ▼                              ▼
ctx.tools.register  ◄─────  ctx.remote.jlink.* (Typert RPC, {ok,value} 信封)
   │                              │
   ▼                              ▼
JLinkService ──────────────►  JLinkCore（状态机: 连接/halt 前置检查）
   │                              │
   └──────────► DriverInterface ◄─┘
                  ├─ MockDriver（内存）
                  └─ PythonDriver ── ndjson RPC ──► python/driver.py
                                                      └─► pylink → JLink_x64.dll(原地)
                                                            ├─ JLinkDevices.xml → 设备表/JLinkScript/.FLM
                                                            └─► J-Link 硬件
```

## 4. 资源文件对照（jlink_mcp / jlink_device_patches / FC IDE）

| 资源 | jlink_mcp | jlink_device_patches | FC IDE (运行时) |
|---|---|---|---|
| 设备补丁 XML | resources/JLink_Patch_v2.45（空目录） | tool/JLink_Patch_v2.45/JLinkDevices.xml（59 设备） | JLink\JLinkDevices.xml |
| Flash loader | resources/.../FC7300/*_FlexCore.elf | tool/.../Devices/Flagchip/**/*.FLM | JLink\Devices\Flagchip\**\*.FLM |
| JLink 脚本 | （无） | tool/.../Devices/Flagchip/**/*.JLinkScript | JLink\Devices\Flagchip\**\*.JLinkScript |
| SVD | resources/SVD_V1.5.6（或 JLINK_SVD_DIR） | tool/SVD_V1.5.6/*.svd（11 款） | （无） |
| 解析缓存 | .svd_cache/<芯片>.v2.pkl | （无） | （无） |

## 5. jlink_mcp → dsh-jlink 模块对照

| jlink_mcp | dsh-jlink | 说明 |
|---|---|---|
| server.py + tools/*.py | src/tools/*.ts + src/service.ts | @mcp.tool → ctx.tools.register |
| jlink_manager.py | src/core.ts + src/driver/* | 单例 → Service + 驱动抽象 |
| svd_manager.py | （规划 src/svd.ts） | pickle 缓存思路保留 |
| device_patch_interface/manager.py | src/patch/interface.ts + registry.ts | ABC → TS 接口 |
| plugins/flagchip_patch.py | src/patch/flagchip.ts | 匹配算法平移 |
| config_manager.py | src/config.ts | Pydantic → zod |
| exceptions.py | src/errors.ts | 错误码枚举 |
| （无） | src/client/* + remote-spec.ts | 可视化 + Remote RPC（新增量） |
