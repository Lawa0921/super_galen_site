"""Confirm BVH candidate pairs with explicit segment/triangle intersections."""

import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_quadri_repair_math import segment_triangle_intersection


ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-quadri-repair/2026-10-05"
BLEND = RUN / "candidate/original-guard-quadri-repaired.blend"
NPZ = RUN / "candidate/original-guard-quadri-repaired-canonical.npz"


def main():
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    mesh = bpy.data.objects["OriginalGuardExactLocalRepairTemporaryCaps"].data
    patch_ids = set(np.load(NPZ)["patch_face_indices"].tolist())
    mesh.calc_loop_triangles()
    vertices = np.asarray([v.co[:] for v in mesh.vertices], dtype=np.float64)
    patch = [(tuple(t.vertices), int(t.polygon_index)) for t in mesh.loop_triangles
             if t.polygon_index in patch_ids]
    rest = [(tuple(t.vertices), int(t.polygon_index)) for t in mesh.loop_triangles
            if t.polygon_index not in patch_ids]
    patch_bvh = BVHTree.FromPolygons(vertices.tolist(), [t[0] for t in patch], all_triangles=True)
    rest_bvh = BVHTree.FromPolygons(vertices.tolist(), [t[0] for t in rest], all_triangles=True)
    rows = []
    for pi, ri in patch_bvh.overlap(rest_bvh):
        pids, pface = patch[pi]
        rids, rface = rest[ri]
        if set(pids).intersection(rids):
            continue
        pxyz, rxyz = vertices[list(pids)], vertices[list(rids)]
        hits = []
        for kind, source, target in (("patch_edge_to_retained", pxyz, rxyz),
                                     ("retained_edge_to_patch", rxyz, pxyz)):
            for edge in range(3):
                result = segment_triangle_intersection(source[edge], source[(edge + 1) % 3], target)
                if result is not None:
                    hits.append({"direction": kind, "edge": edge, **result})
        coordinate_duplicates = [(int(a), int(b)) for a in pids for b in rids
                                 if np.array_equal(vertices[a].astype(np.float32).view(np.uint32),
                                                   vertices[b].astype(np.float32).view(np.uint32))]
        rows.append({"patch_triangle_index": int(pi), "patch_face_index": pface,
                     "patch_vertex_ids": pids, "patch_vertices_m": pxyz.tolist(),
                     "retained_triangle_index": int(ri), "retained_face_index": rface,
                     "retained_vertex_ids": rids, "retained_vertices_m": rxyz.tolist(),
                     "same_coordinate_different_id_pairs": coordinate_duplicates,
                     "segment_triangle_hits": hits})
    report = {"status": "diagnostic_only", "runtime_publish_allowed": False,
              "method": "Blender BVH candidate pairs followed by bidirectional finite segment/triangle Moller-Trumbore on float64 positions",
              "epsilon": 1e-12, "bvh_nonincident_pair_count": len(rows),
              "pairs_with_strict_interior_hit": sum(any(h["kind"] == "interior_crossing" for h in row["segment_triangle_hits"]) for row in rows),
              "pairs_with_any_segment_hit": sum(bool(row["segment_triangle_hits"]) for row in rows),
              "pairs": rows}
    (RUN / "qa/patch-intersections.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("PATCH_INTERSECTIONS_DONE " + json.dumps({key: report[key] for key in (
        "bvh_nonincident_pair_count", "pairs_with_strict_interior_hit", "pairs_with_any_segment_hit")}), flush=True)


if __name__ == "__main__":
    main()
