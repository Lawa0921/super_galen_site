"""Prepare one-ring replacement topology while freezing its 21 outer coordinates."""

import hashlib
import json
from pathlib import Path

import numpy as np

from original_guard_quadri_repair_math import harmonic_disk_triangulation, oriented_boundary_loops


ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-quadri-repair/2026-10-05"
SOURCE = RUN / "candidate/original-guard-quadri-repaired-canonical.npz"
ROI = RUN / "qa/one-ring-roi-probe.json"
REV = RUN / "revision-one-ring-source-guided"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    source = np.load(SOURCE)
    vertices = source["vertices"]
    offsets, indices = source["face_offsets"], source["face_vertex_indices"]
    faces = [indices[offsets[i]:offsets[i + 1]].tolist() for i in range(len(offsets) - 1)]
    roi = json.loads(ROI.read_text(encoding="utf-8"))
    removed_ids = roi["removed_repaired_face_ids"]
    outer = roi["outer_boundary_loops"][0]
    if len(removed_ids) != 19 or len(outer) != 21:
        raise ValueError("One-ring frozen 19-face/21-boundary contract changed")
    old_patch = [faces[i] for i in removed_ids]
    new_patch, uv = harmonic_disk_triangulation(vertices, old_patch, outer)
    if len(new_patch) != 33:
        raise ValueError("One-ring disk must have 33 triangles with its 28 existing vertices")
    removed = set(removed_ids)
    retained = [face for i, face in enumerate(faces) if i not in removed]
    all_faces = retained + new_patch
    if oriented_boundary_loops(all_faces):
        raise ValueError("One-ring topology still has an open boundary")
    patch_indices = np.arange(len(retained), len(all_faces), dtype=np.int32)
    new_offsets = np.concatenate(([0], np.cumsum([len(face) for face in all_faces]))).astype(np.int32)
    new_indices = np.array([v for face in all_faces for v in face], dtype=np.int32)
    inner = sorted({v for face in old_patch for v in face} - set(outer))
    if len(inner) != 7:
        raise ValueError("Expected exactly seven original interior points")
    candidate = REV / "candidate"
    qa = REV / "qa"
    candidate.mkdir(parents=True, exist_ok=True)
    qa.mkdir(parents=True, exist_ok=True)
    output = candidate / "one-ring-topology-proposal.npz"
    np.savez_compressed(output, vertices_initial=vertices, face_offsets=new_offsets,
                        face_vertex_indices=new_indices, patch_face_indices=patch_indices,
                        outer_vertex_ids=np.array(outer, dtype=np.int32),
                        inner_vertex_ids=np.array(inner, dtype=np.int32))
    report = {"status": "proposal_pending_source_bvh_projection", "runtime_publish_allowed": False,
              "previous_candidate_npz_sha256": sha(SOURCE), "proposal_npz_sha256": sha(output),
              "removed_previous_face_indices": removed_ids,
              "fixed_outer_vertex_ids": outer, "inner_vertex_ids_for_source_bvh": inner,
              "new_patch_face_indices": patch_indices.tolist(),
              "new_patch_triangles": new_patch,
              "uv_by_vertex_id": {str(v): uv[v].tolist() for v in outer + inner},
              "outer_coordinates_initial_m": vertices[outer].tolist(),
              "initial_boundary_edges": 0, "note": "Only topology proposal; no source-guided point motion yet."}
    (qa / "topology-proposal.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"removed": len(removed_ids), "new_triangles": len(new_patch),
                      "outer": len(outer), "inner": len(inner)}))


if __name__ == "__main__":
    main()
