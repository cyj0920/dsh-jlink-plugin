# python/driver.py — ndjson RPC 驱动（Phase 3，硬件未验证）

`PythonDriver`（src/driver/python.ts）通过 stdio 与本脚本通信，协议为逐行 JSON：

## 协议

请求（TS → Python，每行一个 JSON 对象）：

    {"id": 1, "method": "read_memory", "params": {"address": 536870912, "length": 16}}

响应（Python → TS）：

    {"id": 1, "result": {"bytes": "deadbeef..."}}
    {"id": 1, "error": {"code": "JLINK_DRIVER_ERROR", "message": "..."}}

进度事件（无 id，仅在 program_flash 期间）：

    {"event": "flash_progress", "data": {"phase": "programming", "percent": 42, "address": 0, "length": 1024, "message": "..."}}

## 方法清单（与 DriverInterface 一一对应）

list_devices / connect / disconnect / halt / run / step / reset / get_cpu_state /
read_memory / write_memory / read_registers / write_register / set_breakpoint /
clear_breakpoint / rtt_start / rtt_stop / rtt_read / rtt_write / erase_flash /
program_flash / verify_flash

## 状态

- 已验证：无（需要真实 J-Link 硬件 + pylink-square 环境）。
- 未实现：flash 三件套（需要 jlink_mcp 的 flash loader 管线，Phase 3 接入）。
- 依赖：pylink-square（与 jlink_mcp 同一库栈）；启动不要求硬件库可导入（惰性导入 + 结构化错误）。
