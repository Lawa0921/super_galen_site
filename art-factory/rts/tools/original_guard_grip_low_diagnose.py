"""Read-only source-vertex counts around first-pass failures."""
from pathlib import Path
import json
import sys

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_grip_low_build import SOURCE, RUN, CHANNEL_ORIGIN, CHANNEL_AXIS, CHANNEL_RADIUS
from original_guard_grip_low_math import protected_channel_mask

bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
mesh = bpy.data.objects["OriginalGripRigidFitReviewOnly"].data
vertices = np.asarray([tuple(vertex.co) for vertex in mesh.vertices], dtype=np.float64)
report = json.loads((RUN / "rejected/attempt-1/geometry.json").read_text(encoding="utf-8"))
flips = np.asarray([record["source_local_center_m"] for record in report["metrics"]["local_face_flip_records"]])
crossings = np.asarray([record["low_source_local_center_m"] for record in report["crossing_records"]])
old = protected_channel_mask(vertices, CHANNEL_ORIGIN, CHANNEL_AXIS, CHANNEL_RADIUS, .00025, (.065, .28))
print("OLD", int(old.sum()), flush=True)
for radius in (.0006, .001, .0015, .002):
    flip_mask = np.zeros(len(vertices), dtype=bool)
    for point in flips:
        flip_mask |= (np.sum((vertices-point)**2, axis=1) < radius**2)
    cross_mask = np.zeros(len(vertices), dtype=bool)
    for point in crossings:
        cross_mask |= (np.sum((vertices-point)**2, axis=1) < radius**2)
    print("RADIUS", radius, "flip", int(flip_mask.sum()), "cross", int(cross_mask.sum()),
          "total", int((old | flip_mask | cross_mask).sum()), flush=True)

bpy.ops.wm.open_mainfile(filepath=str(RUN / "rejected/attempt-1/original-guard-grip-low.blend"))
mesh = bpy.data.objects["OriginalGripLowCandidate"].data
mesh.calc_loop_triangles()
layer = mesh.uv_layers.active
positions = np.asarray([tuple(vertex.co) for vertex in mesh.vertices], dtype=np.float64)
areas = []
uv_areas = []
for triangle in mesh.loop_triangles:
    a, b, c = positions[list(triangle.vertices)]
    areas.append(float(np.linalg.norm(np.cross(b-a,c-a))*.5))
    u, v, w = [np.asarray(layer.data[index].uv) for index in triangle.loops]
    uv_areas.append(float(abs(np.cross(v-u,w-u))*.5))
areas = np.asarray(areas)
uv_areas = np.asarray(uv_areas)
print("UV_RAW", "nonzero_exact", int((uv_areas>0).sum()), "nonzero_1e-10", int((uv_areas>1e-10).sum()),
      "geo_zero_exact", int((areas==0).sum()), "uv_zero_exact", int((uv_areas==0).sum()), flush=True)
for threshold in (1e-11,1e-10,1e-9,1e-8):
    count = int((areas<threshold).sum())
    uvgood = float(np.mean(uv_areas[areas>=threshold]>1e-10))
    print("GEO_THRESHOLD", threshold, "excluded",count,"uv_good",uvgood,flush=True)
print("GEO_ZERO_EXAMPLES", np.flatnonzero(areas==0)[:20].tolist(),flush=True)
print("GEO_MIN", float(areas.min()), "GEO_LT_1E14",int((areas<1e-14).sum()),
      "GEO_LT_1E12",int((areas<1e-12).sum()),flush=True)
