"""Run a non-solving Blender preflight, then launch at most one solver job."""

import json
import subprocess
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-quadri-scaled/2026-10-05"
SCRIPT = ROOT / "art-factory/rts/tools/original_guard_quadri_scaled_blender.py"
BLENDER = Path("C:/Program Files/Blender Foundation/Blender 5.2/blender.exe")


def main():
    qa = RUN / "qa"
    qa.mkdir(parents=True, exist_ok=True)
    command = [str(BLENDER), "--background", "--factory-startup", "--python", str(SCRIPT)]
    if "--preflight-only" in sys.argv:
        result = subprocess.run(command + ["--", "--preflight-only"], cwd=ROOT,
                                creationflags=subprocess.CREATE_NO_WINDOW,
                                text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        print(result.stdout)
        raise SystemExit(result.returncode or ("Traceback" in result.stdout))
    if not qa.joinpath("blender-preflight.json").exists():
        raise RuntimeError("Run and inspect non-solving Blender preflight first")
    handle = qa / "blender-handle.json"
    if handle.exists():
        raise RuntimeError("This scaled QuadriFlow job already has a launch handle; no restart")
    log = qa / "blender-console.log"
    with log.open("w", encoding="utf-8") as stream:
        proc = subprocess.Popen(command, cwd=ROOT, stdout=stream,
                                stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW)
    payload = {"pid": proc.pid, "started_utc_epoch": time.time(),
               "one_solver_attempt_only": True, "script": str(SCRIPT),
               "blender_executable": str(BLENDER), "stdout_log": str(log)}
    handle.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
