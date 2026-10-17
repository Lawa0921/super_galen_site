"""Launch the one background Blender QuadriFlow job with a persistent PID/log."""

import json
import subprocess
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-quadri/2026-10-05"
SCRIPT = ROOT / "art-factory/rts/tools/original_guard_quadri_blender.py"
BLENDER = Path("C:/Program Files/Blender Foundation/Blender 5.2/blender.exe")


def main():
    qa = RUN / "qa"
    qa.mkdir(parents=True, exist_ok=True)
    correction = "--correction" in sys.argv
    handle = qa / ("blender-handle-correction.json" if correction else "blender-handle.json")
    if handle.exists():
        raise RuntimeError("QuadriFlow launch handle already exists; do not restart")
    if correction and "CANCELLED" not in qa.joinpath("blender-console.log").read_text(encoding="utf-8"):
        raise RuntimeError("First run did not record cancellation")
    log = qa / ("blender-console-correction.log" if correction else "blender-console.log")
    with log.open("w", encoding="utf-8") as stream:
        proc = subprocess.Popen([str(BLENDER), "--background", "--factory-startup",
                                 "--python", str(SCRIPT)], cwd=ROOT, stdout=stream,
                                stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW)
    result = {"pid": proc.pid, "started_utc_epoch": time.time(),
              "attempt": "single_targeted_cap_correction" if correction else "initial",
              "script": str(SCRIPT), "stdout_log": str(log),
              "blender_executable": str(BLENDER)}
    handle.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
