"""Read-only one-ring ROI boundary audit around the seven-edge intersecting cap."""

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_quadri_repair_math import oriented_boundary_loops


ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-quadri-repair/2026-10-05"
NPZ = RUN / "candidate/original-guard-quadri-repaired-canonical.npz"
SEVEN_EDGE_LOOP = {8581, 9970, 8688, 8733, 8728, 8683, 8681}


def main():
    data = np.load(NPZ)
    vertices = data["vertices"]
    offsets, indices = data["face_offsets"], data["face_vertex_indices"]
    faces = [indices[offsets[i]:offsets[i + 1]].tolist() for i in range(len(offsets) - 1)]
    patch_ids = data["patch_face_indices"].tolist()
    removed = [index for index, face in enumerate(faces)
               if index in patch_ids[-5:] or (index not in patch_ids and SEVEN_EDGE_LOOP.intersection(face))]
    retained = [face for index, face in enumerate(faces) if index not in set(removed)]
    loops = oriented_boundary_loops(retained)
    report = {"status": "read_only_roi_probe", "runtime_publish_allowed": False,
              "remove_rule": "remove seven-edge temporary cap and retained quads incident to one of its seven vertices",
              "removed_repaired_face_ids": removed,
              "removed_original_solver_quad_ids": data["original_quad_indices"][[i for i in removed if i < len(data["original_quad_indices"])]].tolist(),
              "outer_boundary_loop_count": len(loops),
              "outer_boundary_loops": loops,
              "outer_boundary_positions_canonical_m": [vertices[loop].tolist() for loop in loops],
              "note": "No geometry was modified; expanding ROI requires separate source-guided patch design and intersection QA."}
    (RUN / "qa/one-ring-roi-probe.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"removed_faces": len(removed), "outer_boundary_lengths": list(map(len, loops))}))


if __name__ == "__main__":
    main()
