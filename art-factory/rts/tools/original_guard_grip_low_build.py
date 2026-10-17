"""One protected quadric-collapse pass on the original fitted grip mesh."""
from pathlib import Path
import hashlib
import json
import sys
import time

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_grip_low_math import protected_channel_mask, protected_failure_neighborhood_mask

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / "art-factory/rts/runs"
SOURCE = BASE / "original-guard-grip-fit/2026-10-05/candidate/original-guard-grip-fit.blend"
EXPECTED_SOURCE = "123ad986465e79a26a685eefa9c5da9043f27ce984036ce178b783c103213281"
RUN = BASE / "original-guard-grip-low/2026-10-05"
CHANNEL_ORIGIN = [.0696278259687629, .020799771149057955, .17]
CHANNEL_AXIS = [-.011295106135510071, .0011887328837747986, .9999355016657416]
CHANNEL_RADIUS = .02728495049705316
PROTECTED_TOLERANCE = .00025
PROTECTED_Z = (.065, .28)
DECIMATE_RATIO = .0189
FAILURE_NEIGHBORHOOD_RADIUS = .002
FIRST_PASS_GEOMETRY = RUN / "rejected/attempt-1/geometry.json"


def mesh_fingerprint(mesh):
    vertices = np.asarray([tuple(vertex.co) for vertex in mesh.vertices], dtype=np.float32)
    loops = np.asarray([loop.vertex_index for loop in mesh.loops], dtype=np.int32)
    layout = np.asarray([(polygon.loop_start, polygon.loop_total) for polygon in mesh.polygons], dtype=np.int32)
    return hashlib.sha256(vertices.tobytes() + loops.tobytes() + layout.tobytes()).hexdigest()


def main():
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != EXPECTED_SOURCE:
        raise ValueError("Frozen fit source changed")
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    glove = bpy.data.objects["OriginalGripRigidFitReviewOnly"]
    sword = bpy.data.objects["KingdomSteelSword_LOD0"]
    source_sword_mesh = mesh_fingerprint(sword.data)
    source_glove_mesh = mesh_fingerprint(glove.data)
    source_transform = [list(row) for row in glove.matrix_world]
    old_mesh = glove.data
    glove.data = old_mesh.copy()
    local = np.asarray([tuple(vertex.co) for vertex in glove.data.vertices], dtype=np.float64)
    first = json.loads(FIRST_PASS_GEOMETRY.read_text(encoding="utf-8"))
    if first["verdict"]["pass"] or first["source_fit_blend_sha256"] != EXPECTED_SOURCE:
        raise ValueError("First-pass rejection evidence is absent or mismatched")
    failure_centres = ([record["source_local_center_m"] for record in first["metrics"]["local_face_flip_records"]]
                       + [record["low_source_local_center_m"] for record in first["crossing_records"]])
    channel = protected_channel_mask(local, CHANNEL_ORIGIN, CHANNEL_AXIS, CHANNEL_RADIUS,
                                     PROTECTED_TOLERANCE, PROTECTED_Z)
    failure = protected_failure_neighborhood_mask(local, failure_centres, FAILURE_NEIGHBORHOOD_RADIUS)
    protected = channel | failure
    protected_points = {tuple(point) for point in local[protected].astype(np.float32)}
    group = glove.vertex_groups.new(name="PreserveMeasuredBoreWall")
    indices = np.flatnonzero(protected).tolist()
    for start in range(0, len(indices), 1000):
        group.add(indices[start:start + 1000], 1., "REPLACE")
    bpy.ops.object.select_all(action="DESELECT")
    glove.select_set(True)
    bpy.context.view_layer.objects.active = glove
    modifier = glove.modifiers.new("ProtectedQuadricCollapse", "DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = DECIMATE_RATIO
    modifier.vertex_group = group.name
    modifier.invert_vertex_group = True
    modifier.vertex_group_factor = 1.
    modifier.use_collapse_triangulate = True
    glove.data.calc_loop_triangles()
    source_triangles = len(glove.data.loop_triangles)
    started = time.perf_counter()
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    collapse_seconds = time.perf_counter() - started
    glove.data.calc_loop_triangles()
    reduced_triangles = len(glove.data.loop_triangles)
    reduced_points = {tuple(vertex.co) for vertex in glove.data.vertices}
    protected_kept = len(protected_points.intersection(reduced_points))
    # The source UV contains repeated values from the neural source. Unwrap the
    # new mesh into a dedicated editable baking layout; this does not alter shape.
    uv = glove.data.uv_layers.new(name="GripLowBakeUV")
    glove.data.uv_layers.active = uv
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(island_margin=.005)
    bpy.ops.object.mode_set(mode="OBJECT")
    glove.name = "OriginalGripLowCandidate"
    candidate = RUN / "candidate"
    qa = RUN / "qa"
    candidate.mkdir(parents=True, exist_ok=True)
    qa.mkdir(parents=True, exist_ok=True)
    blend = candidate / "original-guard-grip-low.blend"
    glb = candidate / "original-guard-grip-low.glb"
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.wm.open_mainfile(filepath=str(blend))
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", use_selection=False, export_animations=False)
    glove = bpy.data.objects["OriginalGripLowCandidate"]
    sword = bpy.data.objects["KingdomSteelSword_LOD0"]
    report = {"status": "built_pending_geometry_qa", "runtime_publish_allowed": False,
              "source_fit_blend_sha256": EXPECTED_SOURCE,
              "source_glove_local_mesh_sha256": source_glove_mesh,
              "source_sword_local_mesh_sha256": source_sword_mesh,
              "candidate_sword_local_mesh_sha256": mesh_fingerprint(sword.data),
              "original_glove_matrix_world": source_transform,
              "candidate_glove_matrix_world": [list(row) for row in glove.matrix_world],
              "method": "Blender 5.2.1 collapse quadric, inverted bore-wall vertex group, one pass",
              "decimate_ratio": DECIMATE_RATIO, "channel_origin_m": CHANNEL_ORIGIN,
              "channel_axis": CHANNEL_AXIS, "channel_radius_m": CHANNEL_RADIUS,
              "protected_radial_tolerance_m": PROTECTED_TOLERANCE,
              "protected_source_z_m": list(PROTECTED_Z),
              "first_pass_rejection_sha256": hashlib.sha256(FIRST_PASS_GEOMETRY.read_bytes()).hexdigest(),
              "failure_neighborhood_radius_m": FAILURE_NEIGHBORHOOD_RADIUS,
              "first_pass_failure_centres": len(failure_centres),
              "failure_neighborhood_vertices": int(failure.sum()),
              "channel_vertices": int(channel.sum()),
              "source_triangles": source_triangles, "reduced_triangles": reduced_triangles,
              "protected_input_vertices": len(protected_points), "protected_vertices_kept_exact": protected_kept,
              "collapse_seconds": collapse_seconds, "uv_layer": glove.data.uv_layers.active.name,
              "sha256": {"blend": hashlib.sha256(blend.read_bytes()).hexdigest(),
                         "glb": hashlib.sha256(glb.read_bytes()).hexdigest()}}
    (qa / "build.json").write_bytes((json.dumps(report, indent=2) + "\n").encode("utf-8"))
    print("GRIP_LOW_BUILD " + json.dumps(report), flush=True)


if __name__ == "__main__":
    main()
