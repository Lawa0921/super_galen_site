"""Read-only diagnostic of all seven-edge temporary cap triangulations."""

import json
from functools import lru_cache
from pathlib import Path

import bpy
import numpy as np
from mathutils.bvhtree import BVHTree


ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-quadri-repair/2026-10-05"
BLEND = RUN / "candidate/original-guard-quadri-repaired.blend"
NPZ = RUN / "candidate/original-guard-quadri-repaired-canonical.npz"
LOOP = [8581, 9970, 8688, 8733, 8728, 8683, 8681]


@lru_cache(None)
def triangulations(lo, hi):
    if hi - lo == 1:
        return [()]
    return [left + right + ((lo, mid, hi),)
            for mid in range(lo + 1, hi)
            for left in triangulations(lo, mid)
            for right in triangulations(mid, hi)]


def main():
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    body = bpy.data.objects["OriginalGuardExactLocalRepairTemporaryCaps"]
    mesh = body.data
    data = np.load(NPZ)
    patch_ids = set(data["patch_face_indices"].tolist())
    mesh.calc_loop_triangles()
    vertices = [v.co[:] for v in mesh.vertices]
    rest = [tuple(t.vertices) for t in mesh.loop_triangles if t.polygon_index not in patch_ids]
    rest_bvh = BVHTree.FromPolygons(vertices, rest, all_triangles=True)
    points = np.asarray(vertices)[LOOP]
    normal = sum((np.cross(a, b) for a, b in zip(points, np.roll(points, -1, axis=0))),
                 np.zeros(3))
    axis = int(np.argmax(abs(normal)))
    xy = np.delete(points, axis, axis=1)
    def area(a, b, c):
        return float(np.cross(xy[b] - xy[a], xy[c] - xy[a]))
    polygon_area = abs(sum(area(0, i, i + 1) for i in range(1, 6)))
    rows = []
    for triangulation in triangulations(0, 6):
        positive_areas = [area(*t) for t in triangulation]
        if abs(sum(abs(a) for a in positive_areas) - polygon_area) > 1e-8:
            continue
        if not (all(a > 1e-12 for a in positive_areas) or all(a < -1e-12 for a in positive_areas)):
            continue
        tris = [tuple(LOOP[i] for i in t) for t in triangulation]
        patch_bvh = BVHTree.FromPolygons(vertices, tris, all_triangles=True)
        overlaps = patch_bvh.overlap(rest_bvh)
        nonincident = [(int(p), int(r)) for p, r in overlaps if not set(tris[p]).intersection(rest[r])]
        rows.append({"triangles": tris, "nonincident_crossings": len(nonincident),
                     "pairs": nonincident[:12],
                     "total_triangle_area_m2": float(sum(np.linalg.norm(np.cross(points[b] - points[a], points[c] - points[a])) / 2
                                                         for a, b, c in triangulation))})
    rows.sort(key=lambda row: (row["nonincident_crossings"], row["total_triangle_area_m2"]))
    report = {"status": "read_only_local_triangulation_probe", "runtime_publish_allowed": False,
              "loop": LOOP, "all_catalan_cases": len(triangulations(0, 6)),
              "valid_projected_triangulations": len(rows),
              "minimum_nonincident_crossings": min((row["nonincident_crossings"] for row in rows), default=None),
              "candidates": rows}
    (RUN / "qa/seven-hole-probe.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("SEVEN_HOLE_PROBE_DONE " + json.dumps({k: report[k] for k in (
        "all_catalan_cases", "valid_projected_triangulations", "minimum_nonincident_crossings")}), flush=True)


if __name__ == "__main__":
    main()
