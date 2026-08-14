#!/usr/bin/env python3
"""dsh-jlink Python driver (Phase 3, hardware-unverified) / Python 硬件驱动.

ndjson JSON-RPC over stdio:
  request  -> {"id": n, "method": "...", "params": {...}}
  response -> {"id": n, "result": ...} | {"id": n, "error": {"code": "...", "message": "..."}}
  event    -> {"event": "flash_progress", "data": {"phase","percent","address","length","message"}}

Backed by pylink-square (same library stack as jlink_mcp). Flash operations are
NOT implemented here yet: they require the vendor flash loader pipeline from
jlink_mcp (Phase 3 wiring). Everything else maps 1:1 to DriverInterface.
"""

import json
import sys
import traceback


def log(msg: str) -> None:
    sys.stderr.write("[dsh-jlink:driver] " + msg + "
")


def _hex_bytes(data: str) -> bytes:
    return bytes.fromhex(data.strip())


class DriverError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class JLinkBackend:
    """Thin pylink wrapper; import is lazy so the process can start without hardware libs."""

    def __init__(self):
        try:
            from pylink import JLink  # pylink-square
        except Exception as e:  # pragma: no cover
            raise DriverError("JLINK_DRIVER_ERROR", "pylink not importable: %s" % e)
        self._jl = None
        self._JLink = JLink

    def ensure(self):
        if self._jl is None:
            self._jl = self._JLink()
            self._jl.open()
        return self._jl

    def list_devices(self):
        try:
            from pylink import Library
            emus = Library().connected_emulators()
            return [{"serial": str(e.serial_number), "description": e.acronym, "mock": False} for e in emus]
        except Exception:
            return []

    def connect(self, params):
        jl = self.ensure()
        iface = (params.get("interfaceKind") or "JTAG").upper()
        jl.set_tif(jl.TIF.SWD if iface == "SWD" else jl.TIF.JTAG)
        chip = params.get("chip")
        if chip:
            jl.connect(chip_name=chip)
        else:
            jl.connect()
        return self._target_info(jl)

    def disconnect(self, _params):
        if self._jl is not None:
            try:
                self._jl.close()
            except Exception:
                pass
            self._jl = None
        return None

    @staticmethod
    def _target_info(jl):
        try:
            core = str(jl.core_name() or "")
        except Exception:
            core = ""
        return {"chip": None, "core": core, "flashSize": None, "ramSize": None,
                "workRamAddr": None, "workRamSize": None, "voltage": None}

    def halt(self, _params):
        jl = self.ensure()
        jl.halt()
        return "halted"

    def run(self, _params):
        jl = self.ensure()
        jl.go()
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
            halted = bool(jl.halt_state() == 0)  # pylink: halted state id
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

    def read_registers(self, params):
        jl = self.ensure()
        names = params.get("names") or ["R0", "R1", "R2", "R3", "R4", "R5", "R6", "R7",
                                        "R8", "R9", "R10", "R11", "R12", "SP", "LR", "PC", "XPSR"]
        out = {}
        for name in names:
            try:
                out[name] = int(jl.register_read(name))
            except Exception:
                out[name] = 0
        return out

    def write_register(self, params):
        jl = self.ensure()
        jl.register_write(params["name"], int(params["value"]))
        return None

    def set_breakpoint(self, params):
        jl = self.ensure()
        jl.set_breakpoint(int(params["address"]))
        return None

    def clear_breakpoint(self, params):
        jl = self.ensure()
        jl.remove_breakpoint(int(params["address"]))
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
            chunk = jl.rtt_read()
            text = chunk.decode("utf-8", errors="replace") if isinstance(chunk, (bytes, bytearray)) else str(chunk)
            if text:
                lines.append({"seq": since + 1, "text": text.rstrip(), "at": 0})
        except Exception:
            pass
        return {"lines": lines}

    def rtt_write(self, params):
        jl = self.ensure()
        jl.rtt_write(str(params.get("text") or "").encode("utf-8"))
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
    sys.stdout.write(json.dumps(payload) + "
")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
