"""Exact-ID weld plus four local temporary caps on saved original QuadriFlow output."""

import hashlib
import json
from pathlib import Path

import numpy as np

from original_guard_quadri_repair_math import (collapse_exact_groups,
                                                oriented_boundary_loops,
                                                triangulate_boundary_loop)


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "art-factory/rts/runs/original-guard-quadri-scaled/2026-10-05/revision-v2-checkpointed/candidate/raw-solver-scaled.npz"
RUN = ROOT / "art-factory/rts/runs/original-guard-quadri-repair/2026-10-05"
WELD_GROUPS = [[6335, 7149], [6547, 7158], [6593, 7155], [6597, 7148],
               [8157, 9980], [8390, 9976, 9984], [8593, 9983],
               [8649, 9975, 9985, 9991]]
DELETE_FACES = [4864, 4867, 4875, 4876, 8013, 8062, 8063, 8064, 8110, 8174, 8101]
EXPECTED_HOLES = [{1970, 2104, 2124}, {2125, 2144, 2470},
                  {7141, 7142, 7143}, {8585, 8685, 8687, 8692, 8732, 8737, 9974}]
GROUND = -0.9685986638069153
SCALE = 0.9481278155956246


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical(scaled):
    native = scaled.astype(np.float64) / 2048.0
    return (np.stack((-native[:, 0], native[:, 2], native[:, 1] - GROUND), axis=1) * SCALE).astype(np.float32)


def main():
    if sha256(SOURCE) != "7afee7965c9167299c5fa13df914acec97b83af2db4aa3d228d1b75622614542":
        raise ValueError("Frozen solver source hash mismatch")
    RUN.joinpath("candidate").mkdir(parents=True, exist_ok=True)
    RUN.joinpath("qa").mkdir(parents=True, exist_ok=True)
    data = np.load(SOURCE)
    scaled = data["vertices_scaled_float32"]
    offsets = data["face_offsets"]
    indices = data["face_vertex_indices"]
    if len(scaled) != 10694 or len(offsets) != 10697 or not np.all(np.diff(offsets) == 4):
        raise ValueError("Unexpected frozen solver topology")
    quads = indices.reshape(-1, 4)
    # The named exception has identical coordinates, but it is outside the zero-area repair.
    if not np.array_equal(scaled[[6505, 7146]].view(np.uint32)[0],
                          scaled[[6505, 7146]].view(np.uint32)[1]):
        raise ValueError("Expected excluded exact-coordinate pair changed")
    welded, mapped, old_to_welded = collapse_exact_groups(scaled, quads, WELD_GROUPS)
    keep_face = np.ones(len(quads), dtype=bool)
    keep_face[DELETE_FACES] = False
    retained = mapped[keep_face]
    if np.any([len(set(face)) != 4 for face in retained]):
        raise ValueError("Unexpected collapsed quad outside named zero-area removals")
    loops = oriented_boundary_loops(retained)
    expected_mapped = [set(old_to_welded[list(ids)].tolist()) for ids in EXPECTED_HOLES]
    if sorted(map(frozenset, loops), key=lambda x: (len(x), min(x))) != sorted(map(frozenset, expected_mapped), key=lambda x: (len(x), min(x))):
        raise ValueError("Remaining four holes differ from independent audit")
    caps = [triangulate_boundary_loop(welded, loop) for loop in loops]
    polygons = [face.tolist() for face in retained] + [tri for cap in caps for tri in cap]
    if oriented_boundary_loops(polygons):
        raise ValueError("Temporary patches did not close every boundary")
    # Collapse only named groups and compact unused vertices without moving any coordinate.
    used = sorted({v for face in polygons for v in face})
    compact = np.full(len(welded), -1, dtype=np.int32)
    compact[used] = np.arange(len(used), dtype=np.int32)
    vertices = canonical(welded[used])
    remapped = [compact[list(face)].tolist() for face in polygons]
    face_offsets = np.concatenate(([0], np.cumsum([len(face) for face in remapped]))).astype(np.int32)
    face_indices = np.array([v for face in remapped for v in face], dtype=np.int32)
    patch_face_indices = list(range(len(retained), len(remapped)))
    output = RUN / "candidate/original-guard-quadri-repaired-canonical.npz"
    np.savez_compressed(output, vertices=vertices, face_offsets=face_offsets,
                        face_vertex_indices=face_indices,
                        old_vertex_to_repaired=compact[old_to_welded],
                        patch_face_indices=np.array(patch_face_indices, dtype=np.int32),
                        original_quad_indices=np.flatnonzero(keep_face).astype(np.int32))
    report = {
        "status": "diagnostic_candidate_pending_blender_qa", "runtime_publish_allowed": False,
        "frozen_raw_sha256": sha256(SOURCE), "repaired_npz_sha256": sha256(output),
        "weld_groups_original_ids": WELD_GROUPS,
        "welded_distinct_vertices_removed": sum(len(g) - 1 for g in WELD_GROUPS),
        "preserved_same_coordinate_exception": [6505, 7146],
        "deleted_zero_area_quad_indices": DELETE_FACES,
        "temporary_patch_loops_original_ids": [next(sorted(ids) for ids in EXPECTED_HOLES
                                                   if set(old_to_welded[list(ids)]) == set(loop)) for loop in loops],
        "temporary_patch_loops_repaired_ids": [compact[loop].tolist() for loop in loops],
        "temporary_patch_faces_repaired_ids": [compact[list(tri)].tolist() for cap in caps for tri in cap],
        "temporary_patch_face_indices": patch_face_indices,
        "vertex_count": len(vertices), "retained_quad_count": len(retained),
        "temporary_triangle_count": len(patch_face_indices),
        "boundary_edges_after_patch": 0,
        "note": "Caps are temporary ROI replacements for future hand/skirt-junction reconstruction; not rig-ready."
    }
    (RUN / "qa/preparation.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("vertex_count", "retained_quad_count",
                                             "temporary_triangle_count", "boundary_edges_after_patch")}, indent=2))


if __name__ == "__main__":
    main()
