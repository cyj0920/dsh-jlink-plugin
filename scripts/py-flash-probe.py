"""Probe pylink flash API surface (no hardware connection needed)."""
import inspect
from pylink import JLink

jl = JLink()

print("== flash/erase/verify/download related methods ==")
for m in sorted(dir(jl)):
    low = m.lower()
    if any(k in low for k in ("flash", "erase", "verify", "download", "file", "write")):
        fn = getattr(jl, m, None)
        if callable(fn):
            try:
                sig = str(inspect.signature(fn))
            except (ValueError, TypeError):
                sig = "(?)"
            print(f"{m}{sig}")

print()
print("== signatures of top candidates ==")
for name in ("flash", "flash_file", "erase", "flash_write", "flash_write8",
             "flash_write16", "flash_write32", "verify_data", "download_file",
             "begin_flash", "end_flash"):
    fn = getattr(jl, name, None)
    if fn is None:
        print(name, "-> N/A")
        continue
    try:
        print(name, inspect.signature(fn))
    except (ValueError, TypeError):
        print(name, "(builtin, no sig)")
    doc = (inspect.getdoc(fn) or "").strip().splitlines()
    if doc:
        print("   ", doc[0])
