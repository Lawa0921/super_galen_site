"""Actual finite-segment collision audit of source-guided one-ring replacement."""

import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_quadri_repair_math import segment_triangle_intersection


ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-quadri-repair/2026-10-05/revision-one-ring-source-guided"
BLEND = RUN / "candidate/original-guard-quadri-one-ring.blend"
NPZ = RUN / "candidate/one-ring-source-guided-canonical.npz"


def main():
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    mesh = bpy.data.objects["OriginalGuardSourceGuidedOneRingTemporaryPatch"].data
    data = np.load(NPZ)
    patch_ids = set(data["patch_face_indices"].tolist())
    mesh.calc_loop_triangles()
    positions = np.array([v.co[:] for v in mesh.vertices], dtype=np.float64)
    patch = [(tuple(t.vertices), int(t.polygon_index)) for t in mesh.loop_triangles
             if t.polygon_index in patch_ids]
    rest = [(tuple(t.vertices), int(t.polygon_index)) for t in mesh.loop_triangles
            if t.polygon_index not in patch_ids]
    patch_bvh = BVHTree.FromPolygons(positions.tolist(), [p[0] for p in patch], all_triangles=True)
    rest_bvh = BVHTree.FromPolygons(positions.tolist(), [r[0] for r in rest], all_triangles=True)
    rows = []
    for p, r in patch_bvh.overlap(rest_bvh):
        pids, pface = patch[p]
        rids, rface = rest[r]
        shared = set(pids).intersection(rids)
        first, second = positions[list(pids)], positions[list(rids)]
        hits = []
        for direction, source, target in (("patch_to_retained", first, second),
                                          ("retained_to_patch", second, first)):
            for edge in range(3):
                hit = segment_triangle_intersection(source[edge], source[(edge + 1) % 3], target)
                if hit is not None:
                    point = np.asarray(hit["point"])
                    near_shared_vertex = bool(shared) and any(
                        np.linalg.norm(point - positions[v]) < 1e-8 for v in shared)
                    hits.append({"direction": direction, "edge": edge,
                                 "near_shared_vertex": near_shared_vertex, **hit})
        strict = [h for h in hits if h["kind"] == "interior_crossing" and not h["near_shared_vertex"]]
        if strict or not shared:
            rows.append({"patch_triangle_index": int(p), "retained_triangle_index": int(r),
                         "patch_face_index": pface, "retained_face_index": rface,
                         "patch_vertex_ids": pids, "retained_vertex_ids": rids,
                         "shared_vertex_ids": sorted(shared),
                         "strict_interior_hits": strict, "all_hits": hits})
    disjoint = [row for row in rows if not row["shared_vertex_ids"]]
    strict = [row for row in rows if row["strict_interior_hits"]]
    self_rows = []
    for a, b in patch_bvh.overlap(patch_bvh):
        if a >= b:
            continue
        first_ids, first_face = patch[a]
        second_ids, second_face = patch[b]
        shared = set(first_ids).intersection(second_ids)
        first, second = positions[list(first_ids)], positions[list(second_ids)]
        hits = []
        for direction, source, target in (("first_to_second", first, second),
                                          ("second_to_first", second, first)):
            for edge in range(3):
                hit = segment_triangle_intersection(source[edge], source[(edge + 1) % 3], target)
                if hit is not None and hit["kind"] == "interior_crossing":
                    point = np.asarray(hit["point"])
                    if not any(np.linalg.norm(point - positions[v]) < 1e-8 for v in shared):
                        hits.append({"direction": direction, "edge": edge, **hit})
        if hits:
            self_rows.append({"triangle_indices": [int(a), int(b)],
                              "face_indices": [first_face, second_face],
                              "shared_vertex_ids": sorted(shared), "strict_hits": hits})
    report = {"status": "qa_failed" if strict or self_rows else "patch_strict_crossings_pass",
              "runtime_publish_allowed": False,
              "method": "Blender triangle BVH overlap, then bidirectional float64 finite segment/triangle crossing; shared-vertex contact removed only at that exact vertex",
              "patch_triangles": len(patch), "retained_triangles": len(rest),
              "nonincident_bvh_pairs": len(disjoint),
              "pairs_with_strict_interior_crossing": len(strict),
              "pairs_with_strict_interior_crossing_details": strict[:40],
              "patch_self_pairs_with_strict_interior_crossing": len(self_rows),
              "patch_self_strict_crossing_details": self_rows[:40],
              "other_nonincident_bvh_pairs": [row for row in disjoint if not row["strict_interior_hits"]][:40],
              "limitation": "Coplanar overlap is not classified by finite-segment intersections."}
    (RUN / "qa/patch-intersections.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("ROI_INTERSECTIONS_DONE " + json.dumps({key: report[key] for key in (
        "nonincident_bvh_pairs", "pairs_with_strict_interior_crossing")}), flush=True)


if __name__ == "__main__":
    main()
