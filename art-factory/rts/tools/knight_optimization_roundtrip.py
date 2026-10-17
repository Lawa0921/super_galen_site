"""Import v3 GLBs and reuse the unchanged v2 knight rendering rig for QA."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RUN = ROOT / "runs" / "kingdom-knight" / "2026-10-05-v3"
SOURCE = ROOT / "tools" / "knight_verify_import.py"
spec = importlib.util.spec_from_file_location("knight_v2_verify_readonly", SOURCE)
if spec is None or spec.loader is None:
    raise ImportError(SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.RUN = RUN
module.OUT = RUN / "qa" / "roundtrip"
rows = [module.inspect(0), module.inspect(1)]
out = RUN / "qa" / "roundtrip.json"
out.write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")
print(json.dumps([{"lod": row["lod"], "triangles": row["triangles"],
                   "mesh_objects": row["mesh_objects"], "clips": row["clips"],
                   "uv0_all_meshes": row["uv0_all_meshes"]} for row in rows], indent=2), flush=True)
