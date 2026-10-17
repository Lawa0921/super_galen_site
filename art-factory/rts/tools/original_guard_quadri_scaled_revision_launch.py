"""Hidden process handles for the checkpointed solver and rerunnable postprocess."""

import json
import subprocess
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-quadri-scaled/2026-10-05/revision-v2-checkpointed"
BLENDER = Path("C:/Program Files/Blender Foundation/Blender 5.2/blender.exe")
SOLVER = ROOT / "art-factory/rts/tools/original_guard_quadri_scaled_revision.py"
POST = ROOT / "art-factory/rts/tools/original_guard_quadri_scaled_postprocess.py"


def main():
    QA = RUN / "qa"
    QA.mkdir(parents=True, exist_ok=True)
    if "--smoke" in sys.argv:
        command = [str(BLENDER), "--background", "--factory-startup", "--python", str(POST),
                   "--", "--smoke"]
        result = subprocess.run(command, cwd=ROOT, creationflags=subprocess.CREATE_NO_WINDOW,
                                text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        print(result.stdout)
        raise SystemExit(result.returncode or ("Traceback" in result.stdout))
    post = "--postprocess" in sys.argv
    if not post and not (QA / "render-world-smoke.json").exists():
        raise RuntimeError("Render-world smoke is required before the checkpointed solver")
    if post and not (RUN / "candidate/original-guard-quadri-scaled-checkpoint.blend").exists():
        raise RuntimeError("Saved Blend checkpoint required for postprocess")
    script = POST if post else SOLVER
    handle = QA / ("postprocess-handle.json" if post else "solver-handle.json")
    if handle.exists():
        raise RuntimeError("Launch handle already exists; do not restart this job")
    log = QA / ("postprocess-console.log" if post else "solver-console.log")
    with log.open("w", encoding="utf-8") as stream:
        proc = subprocess.Popen([str(BLENDER), "--background", "--factory-startup",
                                 "--python", str(script)], cwd=ROOT, stdout=stream,
                                stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW)
    payload = {"pid": proc.pid, "started_utc_epoch": time.time(),
               "kind": "checkpoint_postprocess" if post else "one_authorized_checkpoint_rebuild",
               "script": str(script), "stdout_log": str(log),
               "blender_executable": str(BLENDER)}
    handle.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
