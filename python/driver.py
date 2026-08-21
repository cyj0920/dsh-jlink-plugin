#!/usr/bin/env python3
"""dsh-jlink Python driver (Phase 3, hardware-verified) / Python 硬件驱动.

ndjson JSON-RPC over stdio:
  request  -> {"id": n, "method": "...", "params": {...}}
  response -> {"id": n, "result": ...} | {"id": n, "error": {"code": "...", "message": "..."}}
  event    -> {"event": "flash_progress", "data": {"phase","percent","address","length","message"}}

Backed by pylink-square 2.0.0 (same library stack as jlink_mcp). API details were
verified empirically against the real J-Link (see scripts/pylink-probe*.py).
Flash: program_flash uses jl.flash() (DLL pipeline: erase affected sectors +
program + progress callbacks); verify_flash is a chunked readback compare;
erase_flash is a FULL CHIP erase (pylink binds JLINK_EraseChip only — there is
no sector-range erase binding). Devices must be known to the J-Link DLL (e.g.
STM32 built-ins); vendor devices like FC7300 need the jlink_mcp loader pipeline.
"""

import json
import sys
import threading
import traceback

# The DLL may invoke flash progress callbacks from another thread; guard stdout.
_STDOUT_LOCK = threading.Lock()

# pylink flash progress action -> our FlashPhase (src/types.ts).
_FLASH_PHASES = {
    "compare": "verifying",
    "erase": "erasing",
    "flash": "programming",
    "verify": "verifying",
}


def log(msg: str) -> None:
    sys.stderr.write("[dsh-jlink:driver] " + msg + "\n")


def _emit_event(event: str, data: dict) -> None:
    with _STDOUT_LOCK:
        sys.stdout.write(json.dumps({"event": event, "data": data}) + "\n")
        sys.stdout.flush()


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
        # Generic-core connect: report the core, never label it as a chip.
        return self._target_info(jl, None)

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
        return {"chip": chip_label, "core": core or None, "flashSize": None, "ramSize": None,
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

    @staticmethod
    def _progress_cb(address: int, length: int):
        """Build a jl.flash() on_progress(action, progress_string, percentage) handler."""
        def _text(v):
            # The DLL hands callbacks bytes (b'Compare'); normalize to str.
            if isinstance(v, (bytes, bytearray)):
                return v.decode("utf-8", errors="replace")
            return "" if v is None else str(v)

        def on_progress(action, progress_str, percentage):
            act = _text(action).strip().lower()
            phase = _FLASH_PHASES.get(act, "programming")
            try:
                pct = max(0, min(100, int(percentage)))
            except (TypeError, ValueError):
                pct = 0
            _emit_event("flash_progress", {
                "phase": phase,
                "percent": pct,
                "address": address,
                "length": length,
                "message": _text(progress_str) or act,
            })
        return on_progress

    @staticmethod
    def _readback_mismatch(jl, address: int, data: bytes):
        """First mismatching byte offset, or None when the ranges are identical."""
        chunk_size = 4096
        for off in range(0, len(data), chunk_size):
            n = min(chunk_size, len(data) - off)
            got = bytes(jl.memory_read8(address + off, n))
            want = data[off:off + n]
            if got != want:
                for i, (a, b) in enumerate(zip(got, want)):
                    if a != b:
                        return off + i
                return off
        return None

    def erase_flash(self, params):
        jl = self.ensure()
        start = int(params.get("start", params.get("start_address", 0)) or 0)
        end = int(params.get("end", params.get("end_address", 0)) or 0)
        span = max(0, end - start)
        # pylink binds JLINK_EraseChip only; a range request degrades to a full
        # chip erase and is reported as such (fullChip: true).
        _emit_event("flash_progress", {"phase": "erasing", "percent": 0, "address": start, "length": span, "message": "chip erase"})
        try:
            erased = int(jl.erase())
        except Exception as e:
            raise DriverError("JLINK_FLASH_ERROR", "flash erase failed: %s" % e)
        _emit_event("flash_progress", {"phase": "idle", "percent": 100, "address": start, "length": span, "message": "erased %d bytes" % erased})
        return {"bytesErased": erased, "fullChip": True}

    def program_flash(self, params):
        jl = self.ensure()
        address = int(params["address"])
        data = _hex_bytes(params["data"])
        verify = bool(params.get("verify", True))
        if not data:
            raise DriverError("JLINK_INVALID_PARAMETER", "empty data")
        try:
            flashed = int(jl.flash(data, address, on_progress=self._progress_cb(address, len(data))))
        except DriverError:
            raise
        except Exception as e:
            raise DriverError("JLINK_FLASH_ERROR", "flash program failed: %s" % e)
        result = {"bytesFlashed": flashed, "length": len(data), "verified": False}
        if verify:
            _emit_event("flash_progress", {"phase": "verifying", "percent": 100, "address": address, "length": len(data), "message": "readback verify"})
            off = self._readback_mismatch(jl, address, data)
            if off is not None:
                raise DriverError("JLINK_VERIFY_FAILED", "verify mismatch at 0x%x (offset %d)" % (address + off, off))
            result["verified"] = True
        return result

    def verify_flash(self, params):
        jl = self.ensure()
        address = int(params["address"])
        data = _hex_bytes(params["data"])
        if not data:
            raise DriverError("JLINK_INVALID_PARAMETER", "empty data")
        off = self._readback_mismatch(jl, address, data)
        if off is not None:
            raise DriverError("JLINK_VERIFY_FAILED", "verify mismatch at 0x%x (offset %d)" % (address + off, off))
        return {"bytesVerified": len(data)}


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
    with _STDOUT_LOCK:
        sys.stdout.write(json.dumps(payload) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
