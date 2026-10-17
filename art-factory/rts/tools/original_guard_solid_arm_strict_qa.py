"""Exact edge/triangle follow-up to Blender BVH broad-phase overlap counts."""
import json
import sys
from collections import Counter
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).parent))
from original_guard_solid_arm import AXIS, AXIS_LENGTH, AXIS_START, RUN
from original_guard_solid_arm_blender import evaluated


def strict_crossing(first, second):
    """Interior segment/triangle crossing; excludes mere touching at edges."""
    for a, b in ((first, second), (second, first)):
        e1, e2 = b[1] - b[0], b[2] - b[0]
        for i in range(3):
            start, end = a[i], a[(i + 1) % 3]
            direction = end - start
            p = np.cross(direction, e2)
            determinant = np.dot(e1, p)
            if abs(determinant) < 1e-11:
                continue
            inverse = 1. / determinant
            distance = start - b[0]
            u = np.dot(distance, p) * inverse
            q = np.cross(distance, e1)
            v = np.dot(direction, q) * inverse
            t = np.dot(e2, q) * inverse
            if 1e-6 < u < 1 - 1e-6 and 1e-6 < v < 1 - u - 1e-6 and 1e-6 < t < 1 - 1e-6:
                return True
    return False


def face_types(part):
    base = part.get("pre_cap_exterior_polygon_count", 0)
    return ["surface" if i < base else ("cloth" if not base else "cap")
            for i, polygon in enumerate(part["faces"])
            for _ in range(len(polygon) - 2)]


def bvh(vertices, faces):
    return BVHTree.FromPolygons([Vector(v) for v in vertices],
                                [tuple(face) for face in faces], all_triangles=True)


def verify_pair(a, b, same=False, rest_a=None, rest_b=None):
    va, fa, ta = a
    vb, fb, tb = b
    broad = bvh(va, fa).overlap(bvh(vb, fb))
    exact = []
    for i, j in broad:
        if same and (i >= j or set(fa[i]).intersection(fb[j])):
            continue
        if strict_crossing(va[fa[i]], vb[fb[j]]):
            exact.append((int(i), int(j)))
    category = Counter("/".join(sorted((ta[i], tb[j]))) for i, j in exact)
    centers = [(va[fa[i]].mean(axis=0) + vb[fb[j]].mean(axis=0)) / 2 for i, j in exact]
    surface_pairs = [(i, j) for i, j in exact if ta[i] == tb[j] == "surface"]
    surface_centers = [(va[fa[i]].mean(axis=0) + vb[fb[j]].mean(axis=0)) / 2
                       for i, j in surface_pairs]
    stations = [((((rest_a[fa[i]].mean(axis=0) - AXIS_START) @ AXIS) / AXIS_LENGTH),
                 (((rest_b[fb[j]].mean(axis=0) - AXIS_START) @ AXIS) / AXIS_LENGTH))
                for i, j in surface_pairs] if rest_a is not None and rest_b is not None else []
    return {"bvh_candidate_pairs": len(broad), "strict_crossing_pairs": len(exact),
            "by_surface_type": dict(category),
            "crossing_bounds_m": [np.asarray(centers).min(axis=0).tolist(),
                                  np.asarray(centers).max(axis=0).tolist()] if centers else None,
            "surface_surface_crossing_bounds_m": [np.asarray(surface_centers).min(axis=0).tolist(),
                                                   np.asarray(surface_centers).max(axis=0).tolist()] if surface_centers else None,
            "surface_surface_source_station_ranges": [np.asarray(stations).min(axis=0).tolist(),
                                                       np.asarray(stations).max(axis=0).tolist()] if stations else None,
            "samples": [center.tolist() for center in centers[:5]]}


def main():
    geometry = json.loads((RUN / "candidate/original-guard-solid-arm-geometry.json").read_text(encoding="utf-8"))
    bpy.ops.wm.open_mainfile(filepath=str(RUN / "candidate/original-guard-solid-arm.blend"))
    frames = {"neutral": 0, "bend90": 30, "roll45": 60, "combined": 90,
              "transition15": 15, "transition45": 45, "transition75": 75}
    result = {"status": "qa_failed", "runtime_publish_allowed": False,
              "method": "Blender BVH broad phase followed by strict interior segment/triangle crossings",
              "poses": {}}
    names = ("UpperArmArmor", "ElbowArmor", "ForearmArmor", "FlexibleSleeve")
    for pose, frame in frames.items():
        bpy.context.scene.frame_set(frame)
        meshes = {}
        for name in names:
            vertices, faces = evaluated(bpy.data.objects[name])
            types = face_types(geometry["components"][name])
            if len(types) != len(faces):
                raise ValueError(f"Face mapping mismatch: {name}: {len(types)} != {len(faces)}")
            meshes[name] = vertices, faces, types
        record = {"frame": frame, "self": {}, "cross": {}}
        for name in names:
            record["self"][name] = verify_pair(meshes[name], meshes[name], same=True)
        for index, first in enumerate(names):
            for second in names[index + 1:]:
                record["cross"][f"{first}/{second}"] = verify_pair(
                    meshes[first], meshes[second],
                    rest_a=np.asarray(geometry["components"][first]["vertices"]),
                    rest_b=np.asarray(geometry["components"][second]["vertices"]))
        result["poses"][pose] = record
        print("STRICT_QA", pose,
              {k: v["strict_crossing_pairs"] for k, v in record["cross"].items()}, flush=True)
    path = RUN / "qa/strict-collision-report.json"
    path.write_bytes((json.dumps(result, indent=2) + "\n").encode("utf-8"))
    print("STRICT_QA_WRITTEN", str(path), flush=True)


if __name__ == "__main__":
    main()
