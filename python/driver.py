#!/usr/bin/env python3
"""dsh-jlink Python driver (Phase 3, hardware-verified) / Python 硬件驱动.

ndjson JSON-RPC over stdio:
  request  -> {"id": n, "method": "...", "params": {...}}
  response -> {"id": n, "result": ...} | {"id": n, "error": {"code": "...", "message": "..."}}
  event    -> {"event": "flash_progress", "data": {"phase","percent","address","length","message"}}

Backed by pylink-square 2.0.0 (same library stack as jlink_mcp). API details were
verified empirically against the real J-Link (see scripts/pylink-probe*.py).
Flash operations are NOT implemented here yet: they require the vendor flash
loader pipeline from jlink_mcp (Phase 3 wiring).
"""

import json
import sys
import traceback


def log(msg: str) -> None:
    sys.stderr.write("[dsh-jlink:driver] " + msg + "\n")


def _hex_bytes(data: str) -> bytes:
    return bytes.fromhex(data.strip())


class DriverError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


DEFAULT_REGISTERS = [
    "R0", "R1", "R2", "R3", "R4", "R5", "R6", "R7",
    "R8", "R9", "R10", "R11", "R12", "SP", "LR", "PC", "XPSR",
    "MSP", "PSP", "PRIMASK", "CONTROL",
]


class JLinkBackend:
    """Thin pylink wrapper; import is lazy so the process can start without hardware libs."""

    def __init__(self):
        try:
            from pylink import JLink, JLinkInterfaces
        except Exception as e:  # pragma: no cover
            raise DriverError("JLINK_DRIVER_ERROR", "pylink not importable: %s" % e)
        self._jl = None
        self._JLink = JLink
        self._JLinkInterfaces = JLinkInterfaces
        self._registers = None  # name(upper) -> index
        self._breakpoints = {}  # address -> handle
        self._serial = None        # requested probe S/N (None = first available)
        self._open_serial = None   # S/N of the currently open probe

    def ensure(self):
        if self._jl is None:
            self._jl = self._JLink()
            self._jl.open(serial_no=self._serial)
            self._open_serial = self._serial
        return self._jl

    def list_devices(self, _params):
        jl = self.ensure()
        emus = jl.connected_emulators()
        return [
            {
                "serial": str(e.SerialNumber),
                "description": (e.acProduct.decode(errors="replace") if isinstance(e.acProduct, (bytes, bytearray)) else str(e.acProduct)) or str(e.Connection),
                "mock": False,
            }
            for e in emus
        ]

    def connect(self, params):
        serial = params.get("serial")
        want = None
        if serial:
            try:
                want = int(str(serial).strip())
            except ValueError:
                log("ignoring non-numeric serial %r" % serial)
        if want is not None and self._jl is not None and self._open_serial != want:
            # A different probe is already open; close it so ensure() re-opens the requested one.
            self.disconnect(None)
        self._serial = want
        jl = self.ensure()
        iface = (params.get("interfaceKind") or "JTAG").upper()
        if iface == "SWD":
            jl.set_tif(self._JLinkInterfaces.SWD)
        else:
            jl.set_tif(self._JLinkInterfaces.JTAG)
        chip = params.get("chip")
        core = params.get("core") or "Cortex-M4"
        if not chip:
            # No chip name: connect the generic core directly.
            log("no chip specified; connecting generic core %s" % core)
        if chip:
            try:
                jl.connect(chip_name=chip)
                return self._target_info(jl, chip)
            except Exception as e:
                # Generic-core fallback mirrors jlink_mcp's generic_core_fallback policy.
                log("exact device connect failed (%s); falling back to generic core %s" % (e, core))
                if "not connected" in str(e).lower():
                    raise DriverError("JLINK_DRIVER_ERROR", "J-Link online but no target found (%s); check probe wiring and target power" % e)
        try:
            jl.connect(chip_name=core)
        except Exception as e:
            raise DriverError("JLINK_DRIVER_ERROR", "connect failed (%s)" % e)
        return self._target_info(jl, chip or core)

    def disconnect(self, _params):
        if self._jl is not None:
            try:
                self._jl.close()
            except Exception:
                pass
            self._jl = None
        self._registers = None
        self._breakpoints = {}
        return None

    @staticmethod
    def _target_info(jl, chip_label):
        import re
        core = ""
        voltage = None
        try:
            core = str(jl.core_name() or "")
        except Exception:
            pass
        try:
            out = jl.exec_command("VTarget = %.2f")
            m = re.search(r"([-+]?\d+\.?\d*)", str(out))
            if m:
                voltage = float(m.group(1))
        except Exception:
            pass
        return {"chip": chip_label or None, "core": core, "flashSize": None, "ramSize": None,
                "workRamAddr": None, "workRamSize": None, "voltage": voltage}

    def halt(self, _params):
        jl = self.ensure()
        jl.halt()
        return "halted"

    def run(self, _params):
        jl = self.ensure()
        # pylink 2.0.0 removed go(); resume via the DLL's Go function directly.
        try:
            jl._dll.JLINKARM_Go()
        except Exception as e:
            raise DriverError("JLINK_DRIVER_ERROR", "go failed: %s" % e)
        return "running"

    def step(self, _params):
        jl = self.ensure()
        jl.step()
        return "halted"

    def reset(self, _params):
        jl = self.ensure()
        jl.reset()
        jl.halt()
        return None

    def get_cpu_state(self, _params):
        jl = self.ensure()
        try:
            halted = bool(jl.halted())
        except Exception:
            halted = False
        return "halted" if halted else "running"

    def read_memory(self, params):
        jl = self.ensure()
        address = int(params["address"])
        length = int(params["length"])
        if length <= 0 or length > 65536:
            raise DriverError("JLINK_INVALID_PARAMETER", "length out of range")
        data = jl.memory_read8(address, length)
        return {"bytes": bytes(data).hex()}

    def write_memory(self, params):
        jl = self.ensure()
        address = int(params["address"])
        data = _hex_bytes(params["data"])
        jl.memory_write8(address, list(data))
        return None

    def _ensure_registers(self, jl):
        if self._registers is None:
            self._registers = {}
            for idx in jl.register_list():
                try:
                    name = jl.register_name(idx)
                except Exception:
                    name = "R%d" % idx
                self._registers[str(name).upper()] = idx
        return self._registers

    def read_registers(self, params):
        jl = self.ensure()
        regs = self._ensure_registers(jl)
        names = params.get("names") or []
        if not names:
            # Curated core register set when the caller asked for everything.
            names = [n for n in DEFAULT_REGISTERS if n in regs]
        out = {}
        for n in names:
            idx = regs.get(str(n).upper())
            out[n] = int(jl.register_read(idx)) if idx is not None else 0
        return out

    def write_register(self, params):
        jl = self.ensure()
        regs = self._ensure_registers(jl)
        idx = regs.get(str(params["name"]).upper())
        if idx is None:
            raise DriverError("JLINK_INVALID_PARAMETER", "unknown register: %s" % params["name"])
        jl.register_write(idx, int(params["value"]))
        return None

    def set_breakpoint(self, params):
        jl = self.ensure()
        addr = int(params["address"])
        if addr in self._breakpoints:
            return None
        handle = jl.breakpoint_set(addr)
        self._breakpoints[addr] = handle
        return None

    def clear_breakpoint(self, params):
        jl = self.ensure()
        addr = int(params["address"])
        handle = self._breakpoints.pop(addr, None)
        if handle is None:
            raise DriverError("JLINK_NOT_FOUND", "breakpoint not found: 0x%x" % addr)
        jl.breakpoint_clear(handle)
        return None

    def rtt_start(self, params):
        jl = self.ensure()
        jl.rtt_start(int(params.get("bufSize") or 1024))
        return None

    def rtt_stop(self, _params):
        jl = self.ensure()
        try:
            jl.rtt_stop()
        except Exception:
            pass
        return None

    def rtt_read(self, params):
        jl = self.ensure()
        since = int(params.get("since") or 0)
        lines = []
        try:
            data = jl.rtt_read(0, 1024)
            if data:
                text = bytes(data).decode("utf-8", errors="replace").rstrip()
                if text:
                    lines.append({"seq": since + 1, "text": text, "at": 0})
        except Exception:
            pass
        return {"lines": lines}

    def rtt_write(self, params):
        jl = self.ensure()
        jl.rtt_write(0, str(params.get("text") or "").encode("utf-8"))
        return None

    def erase_flash(self, params):
        raise DriverError("JLINK_UNSUPPORTED", "flash erase requires jlink_mcp flash pipeline (Phase 3 wiring)")

    def program_flash(self, params):
        raise DriverError("JLINK_UNSUPPORTED", "flash program requires jlink_mcp flash pipeline (Phase 3 wiring)")

    def verify_flash(self, params):
        raise DriverError("JLINK_UNSUPPORTED", "flash verify requires jlink_mcp flash pipeline (Phase 3 wiring)")


BACKEND = JLinkBackend()


def dispatch(method: str, params: dict):
    fn = getattr(BACKEND, method, None)
    if fn is None:
        raise DriverError("JLINK_UNSUPPORTED", "unknown method: " + method)
    return fn(params)


def main() -> None:
    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue
        try:
            req = json.loads(raw)
        except Exception as e:
            _respond(None, error={"code": "JLINK_INVALID_PARAMETER", "message": "bad request: %s" % e})
            continue
        req_id = req.get("id")
        try:
            result = dispatch(req.get("method", ""), req.get("params") or {})
            _respond(req_id, result=result)
        except DriverError as e:
            _respond(req_id, error={"code": e.code, "message": str(e)})
        except Exception as e:  # pragma: no cover
            log(traceback.format_exc())
            _respond(req_id, error={"code": "JLINK_DRIVER_ERROR", "message": str(e)})


def _respond(req_id, result=None, error=None) -> None:
    payload = {"id": req_id}
    if error is not None:
        payload["error"] = error
    else:
        payload["result"] = result
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
