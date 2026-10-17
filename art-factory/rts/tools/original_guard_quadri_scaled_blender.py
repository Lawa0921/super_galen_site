"""Single Blender 5.2 QuadriFlow attempt with exact mesh-data unit scaling."""

import gc
import hashlib
import json
import sys
import time
import traceback
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_quadri_blender import create_mesh, render, sampled_surface_distance, topology
from original_guard_quadri_scaled_math import (BLENDER_EDGE_EPSILON,
                                               blender_near_edge_mask,
                                               scale_float32_exact,
                                               unique_triangle_edges)


ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-quadri-scaled/2026-10-05"
SOURCE = ROOT / "art-factory/rts/runs/original-guard-shape/2026-10-05/candidate/candidate-body.glb"
PREPARED = ROOT / "art-factory/rts/runs/original-guard-quadri/2026-10-05/candidate/source-primary-exact.npz"
QA = RUN / "qa"
RENDERS = QA / "renders"
FACTOR = 2048
GROUND_NATIVE_Y = -0.9685986638069153
CANONICAL_SCALE = 0.9481278155956246
SOURCE_SHA = "b2a94ddd3c7f66ea8e1edf993fce13ce4c24a795b9106076648e773ebffecdfd"
PREPARED_SHA = "7851c7d91364e773b4e32e358740f37f43660e2d0cfbc9159f13245470a86edd"


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def mark(stage, **values):
    payload = {"stage": stage, "utc_epoch": time.time(), **values}
    write_json(QA / "progress.json", payload)
    print("SCALED_QUADRI_STAGE " + json.dumps(payload), flush=True)


def mesh_positions(obj):
    output = np.empty(len(obj.data.vertices) * 3, dtype=np.float32)
    obj.data.vertices.foreach_get("co", output)
    return output.reshape(-1, 3)


def canonical_from_native(native):
    p = np.asarray(native, dtype=np.float64)
    return (np.stack((-p[:, 0], p[:, 2], p[:, 1] - GROUND_NATIVE_Y), axis=1)
            * CANONICAL_SCALE).astype(np.float32)


def set_positions(obj, positions):
    obj.data.vertices.foreach_set("co", np.asarray(positions, dtype=np.float32).reshape(-1))
    obj.data.update()


def extended_topology(obj):
    result = topology(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    result["inconsistent_winding_edges"] = sum(
        edge.is_manifold and not edge.is_contiguous for edge in bm.edges)
    result["nonmanifold_vertices"] = sum(not vertex.is_manifold for vertex in bm.verts)
    visited = set()
    components = 0
    for vertex in bm.verts:
        if vertex in visited:
            continue
        components += 1
        stack = [vertex]
        visited.add(vertex)
        while stack:
            current = stack.pop()
            for edge in current.link_edges:
                neighbor = edge.other_vert(current)
                if neighbor not in visited:
                    visited.add(neighbor)
                    stack.append(neighbor)
    result["vertex_components"] = components
    bm.free()
    return result


def actual_blender_preflight(obj, expected, faces):
    actual = mesh_positions(obj)
    if not np.array_equal(actual.view(np.uint32), expected.view(np.uint32)):
        raise ValueError("Blender mesh-data coordinates differ from exact ×2048 float32 input")
    edges = unique_triangle_edges(faces)
    first, second = actual[edges[:, 0]], actual[edges[:, 1]]
    near = blender_near_edge_mask(first, second, BLENDER_EDGE_EPSILON)
    minimum_linf = float(np.min(np.max(np.abs(first - second), axis=1)))
    graph = extended_topology(obj)
    assert graph["boundary_edges"] == 0, graph
    assert graph["nonmanifold_edges"] == 0, graph
    assert graph["nonmanifold_vertices"] == 0, graph
    assert graph["inconsistent_winding_edges"] == 0, graph
    assert graph["vertex_components"] == 1, graph
    assert not np.any(near), int(np.sum(near))
    if not np.array_equal((actual / np.float32(FACTOR)).view(np.uint32),
                          (expected / np.float32(FACTOR)).view(np.uint32)):
        raise ValueError("Actual Blender mesh-data inverse scale is not bit-identical")
    return {"mesh_data_scale": FACTOR, "mesh_object_scale": list(obj.scale),
            "edge_count": int(len(edges)), "near_edge_count": int(np.sum(near)),
            "minimum_linf_scaled_edge_m": minimum_linf,
            "threshold_componentwise_inclusive": float(BLENDER_EDGE_EPSILON),
            "mesh_data_bits_equal_expected": True, "inverse_bits_equal_source": True,
            "topology": graph}


def setup_render():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.world.color = (.15, .15, .15)
    scene.view_settings.view_transform = "AgX"
    material = bpy.data.materials.new("DiagnosticNeutralGray_NotProductionArt")
    material.use_nodes = True
    material.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = (.55, .56, .57, 1)
    for position, energy in [((-3, 4, 5), 900), ((3, -2, 4), 650)]:
        data = bpy.data.lights.new("QALight", "AREA")
        data.energy, data.shape, data.size = energy, "DISK", 4
        light = bpy.data.objects.new("QALight", data)
        bpy.context.collection.objects.link(light)
        light.location = position
        light.rotation_euler = (Vector((0, 0, .95)) - light.location).to_track_quat("-Z", "Y").to_euler()
    return material


def main():
    started = time.perf_counter()
    QA.mkdir(parents=True, exist_ok=True)
    RUN.joinpath("candidate").mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != SOURCE_SHA:
        raise ValueError("Original GLB source hash changed")
    if hashlib.sha256(PREPARED.read_bytes()).hexdigest() != PREPARED_SHA:
        raise ValueError("Prepared exact-primary source hash changed")
    data = np.load(PREPARED)
    native, faces = data["vertices"], data["triangles"]
    scaled = scale_float32_exact(native, FACTOR)
    body = create_mesh("OriginalGuardQuadriScaledInput", scaled, faces)
    preflight = actual_blender_preflight(body, scaled, faces)
    write_json(QA / "blender-preflight.json", preflight)
    mark("blender_preflight_pass", near_edges=preflight["near_edge_count"],
         minimum_linf=preflight["minimum_linf_scaled_edge_m"])
    if "--preflight-only" in sys.argv:
        print("SCALED_BLENDER_PREFLIGHT_ONLY_PASS", flush=True)
        return
    del scaled
    gc.collect()

    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    operator = {"mode": "FACES", "target_faces": 12000,
                "use_preserve_sharp": True, "use_preserve_boundary": True,
                "use_mesh_symmetry": False, "preserve_attributes": False, "seed": 0}
    mark("quadriflow_running", operator=operator)
    quadri_start = time.perf_counter()
    result = bpy.ops.object.quadriflow_remesh(**operator)
    quadri_seconds = time.perf_counter() - quadri_start
    mark("quadriflow_finished", result=list(result), seconds=quadri_seconds)
    if "FINISHED" not in result:
        raise RuntimeError(f"Scaled QuadriFlow returned {result}")

    # Solver output is immediately returned from computational units to the
    # established source-native frame, then to canonical 1.86 m coordinates.
    solved_scaled = mesh_positions(body)
    solved_native = solved_scaled / np.float32(FACTOR)
    solved_canonical = canonical_from_native(solved_native)
    set_positions(body, solved_canonical)
    body.name = "OriginalGuardQuadriCanonicalCandidate"
    candidate_topology = extended_topology(body)
    mark("canonicalized", topology=candidate_topology,
         canonical_bounds=np.array([solved_canonical.min(axis=0),
                                    solved_canonical.max(axis=0)]).tolist())
    del solved_scaled, solved_native, solved_canonical
    gc.collect()

    reference = create_mesh("AcceptedOriginalSourceReference", canonical_from_native(native), faces)
    source_topology = extended_topology(reference)
    del native, faces, data
    gc.collect()
    source_to_candidate = sampled_surface_distance(reference, body)
    candidate_to_source = sampled_surface_distance(body, reference)
    mark("surface_distance_complete", source_to_candidate=source_to_candidate,
         candidate_to_source=candidate_to_source)

    RENDERS.mkdir(parents=True, exist_ok=True)
    gray = setup_render()
    body.data.materials.append(gray)
    reference.data.materials.append(gray)
    views = {
        "front": ((0, 0, .93), (0, 4, .93), 2.25),
        "side": ((0, 0, .93), (4, 0, .93), 2.25),
        "back": ((0, 0, .93), (0, -4, .93), 2.25),
        "head-shoulders": ((0, 0, 1.54), (0, 2.4, 1.54), .92),
        "left-hand": ((-.39, 0, .86), (-.39, 1.6, .86), .43),
        "right-hand": ((.39, 0, .86), (.39, 1.6, .86), .43),
        "right-arm-edge": ((.32, 0, 1.18), (1.5, 2.2, 1.4), .76),
        "skirt-edge": ((0, 0, .6), (1.1, 2.2, .8), .85),
    }
    reference.hide_render = True
    body.hide_render = True
    for name, (target, location, scale) in views.items():
        render(RENDERS / f"source-{name}.png", reference, target, location, scale)
        render(RENDERS / f"retopo-{name}.png", body, target, location, scale)
        mark("rendered_view", view=name)

    reference.hide_render = True
    reference.hide_set(True)
    body.hide_render = False
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    glb = RUN / "candidate/original-guard-quadri-scaled.glb"
    blend = RUN / "candidate/original-guard-quadri-scaled.blend"
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", use_selection=True,
                              export_animations=False, export_materials="NONE")
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    report = {"status": "candidate_pending_independent_visual_review",
              "runtime_publish_allowed": False,
              "source_sha256": SOURCE_SHA, "prepared_sha256": PREPARED_SHA,
              "blender_version": bpy.app.version_string,
              "blender_commit": bpy.app.build_hash.decode("ascii"),
              "operator": operator, "operator_result": list(result),
              "preflight": preflight,
              "source_topology": source_topology,
              "candidate_topology": candidate_topology,
              "source_to_candidate_surface": source_to_candidate,
              "candidate_to_source_surface": candidate_to_source,
              "quadriflow_seconds": quadri_seconds,
              "total_blender_seconds": time.perf_counter() - started,
              "artifacts_sha256": {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                                   for path in (blend, glb)},
              "renders_sha256": {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                                 for path in sorted(RENDERS.glob("*.png"))},
              "limitations": ["No semantic separation of fused fingers, skirt plates, or armor",
                              "No rig, animation, UV, or production material",
                              "BVH distances use sampled actual triangle surface points"]}
    write_json(QA / "quadri-report.json", report)
    mark("complete", status=report["status"], total_seconds=report["total_blender_seconds"])


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        QA.mkdir(parents=True, exist_ok=True)
        write_json(QA / "run-failure.json", {"status": "qa_failed", "runtime_publish_allowed": False,
                                             "error_type": type(exc).__name__, "error": str(exc),
                                             "traceback": traceback.format_exc()})
        raise
