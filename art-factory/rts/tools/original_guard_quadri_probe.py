"""Read-only Blender RNA and cancellation diagnostics via a hidden process."""

import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def blender_rna():
    import bpy

    rna = bpy.ops.object.quadriflow_remesh.get_rna_type()
    print("QUADRI_RNA=" + json.dumps([
        {"name": prop.identifier, "type": prop.type,
         "default": getattr(prop, "default", None),
         "description": prop.description}
        for prop in rna.properties
    ]))


if __name__ == "__main__":
    if ("--run-blender" in sys.argv or "--diagnose-blender" in sys.argv or
            "--test-blender" in sys.argv):
        script = (ROOT / "art-factory/rts/tools/original_guard_quadri_blender_test.py"
                  if "--test-blender" in sys.argv else
                  ROOT / "art-factory/rts/tools/original_guard_quadri_blender_diagnose.py"
                  if "--diagnose-blender" in sys.argv else Path(__file__).resolve())
        proc = subprocess.run([
            "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe",
            "--background", "--factory-startup", "--python", str(script),
            "--", "--blender-rna"], creationflags=subprocess.CREATE_NO_WINDOW,
            text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        print(proc.stdout)
        raise SystemExit(proc.returncode or ("Traceback" in proc.stdout))
    if "--blender-rna" in sys.argv:
        blender_rna()
    elif "--run-blender" not in sys.argv and "--diagnose-blender" not in sys.argv and "--test-blender" not in sys.argv:
        raise SystemExit("Choose --run-blender, --diagnose-blender, or --test-blender")
