# python/driver.py — ndjson RPC 驱动（Phase 3，真机已验证）

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

- 已验证（J-Link WiFi S/N 941000024 · SWD · STM32F103ZE / Cortex-M3）：connect/halt/run/寄存器/SRAM 读写回环/断点/RTT 循环、verify_flash 读回比对（精确匹配通过、篡改数据返回 JLINK_VERIFY_FAILED）。
- flash 三件套：`program_flash` 走 pylink `jl.flash()`（DLL 管线：擦受影响扇区+编程+进度回调）；`verify_flash` 为分块读回比对；`erase_flash` 是**全片擦除**（pylink 只绑定 JLINK_EraseChip，无扇区区间擦除），结果以 `fullChip: true` 上报。仅对 DLL 已知设备可用（STM32 内置即属此类）；FC7300 等厂商设备仍需 jlink_mcp 的 loader 管线。
- 依赖：pylink-square（与 jlink_mcp 同一库栈）；启动不要求硬件库可导入（惰性导入 + 结构化错误）。
