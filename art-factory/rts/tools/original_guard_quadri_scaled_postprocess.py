"""Review saved QuadriFlow checkpoint without invoking the solver again."""

import hashlib
import json
import sys
import time
import traceback
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_quadri_blender import create_mesh, render, sampled_surface_distance
from original_guard_quadri_scaled_blender import (PREPARED, canonical_from_native,
                                                  extended_topology)


ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-quadri-scaled/2026-10-05/revision-v2-checkpointed"
QA = RUN / "qa"
RENDERS = QA / "renders"
BLEND = RUN / "candidate/original-guard-quadri-scaled-checkpoint.blend"
GLB = RUN / "candidate/original-guard-quadri-scaled-checkpoint.glb"


def setup_render(resolution=900):
    scene = bpy.context.scene
    if scene.world is None:
        scene.world = bpy.data.worlds.new("DiagnosticQAWorld")
    scene.world.color = (.15, .15, .15)
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = resolution
    scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
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


def smoke():
    QA.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    material = setup_render(resolution=64)
    bpy.ops.mesh.primitive_cube_add(size=.4, location=(0, 0, .9))
    cube = bpy.context.object
    cube.name = "DiagnosticRenderSmokeOnly"
    cube.data.materials.append(material)
    camera_data = bpy.data.cameras.new("SmokeCamera")
    camera = bpy.data.objects.new("SmokeCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (0, 2, 1.1)
    camera.rotation_euler = (Vector((0, 0, .9)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = camera
    output = QA / "render-world-smoke.png"
    bpy.context.scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)
    report = {"status": "pass", "scene_world_created": bpy.context.scene.world is not None,
              "diagnostic_only": True, "render_sha256": hashlib.sha256(output.read_bytes()).hexdigest()}
    (QA / "render-world-smoke.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("RENDER_WORLD_SMOKE_PASS " + json.dumps(report), flush=True)


def main():
    if "--smoke" in sys.argv:
        smoke()
        return
    started = time.perf_counter()
    if not BLEND.exists() or not GLB.exists():
        raise FileNotFoundError("Checkpoint Blend and GLB must exist before postprocess")
    RENDERS.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    body = bpy.data.objects["OriginalGuardQuadriCanonicalCandidate"]
    data = np.load(PREPARED)
    reference = create_mesh("AcceptedOriginalSourceReference", canonical_from_native(data["vertices"]),
                            data["triangles"])
    source_topology, candidate_topology = extended_topology(reference), extended_topology(body)
    source_to_candidate = sampled_surface_distance(reference, body)
    candidate_to_source = sampled_surface_distance(body, reference)
    print("POSTPROCESS_DISTANCES_DONE", flush=True)
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
    body.hide_render, reference.hide_render = True, True
    for name, (target, location, scale) in views.items():
        render(RENDERS / f"source-{name}.png", reference, target, location, scale)
        render(RENDERS / f"retopo-{name}.png", body, target, location, scale)
        print("POSTPROCESS_RENDERED " + name, flush=True)
    reference.hide_render = True
    reference.hide_set(True)
    body.hide_render = False
    review_blend = RUN / "candidate/original-guard-quadri-review.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(review_blend))
    report = {"status": "qa_failed_pending_visual_diagnosis",
              "runtime_publish_allowed": False,
              "checkpoint_blend_sha256": hashlib.sha256(BLEND.read_bytes()).hexdigest(),
              "checkpoint_glb_sha256": hashlib.sha256(GLB.read_bytes()).hexdigest(),
              "review_blend_sha256": hashlib.sha256(review_blend.read_bytes()).hexdigest(),
              "source_topology": source_topology, "candidate_topology": candidate_topology,
              "source_to_candidate_surface": source_to_candidate,
              "candidate_to_source_surface": candidate_to_source,
              "elapsed_seconds": time.perf_counter() - started,
              "renders_sha256": {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                                 for p in sorted(RENDERS.glob("*.png"))},
              "distance_method": "12k actual triangle-centroid points each direction to nearest target polygons using Blender BVHTree; no AABB shortcut"}
    (QA / "postprocess-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("POSTPROCESS_COMPLETE " + json.dumps(report), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        QA.mkdir(parents=True, exist_ok=True)
        (QA / "postprocess-failure.json").write_text(json.dumps({
            "status": "qa_failed", "runtime_publish_allowed": False,
            "error": str(exc), "error_type": type(exc).__name__,
            "traceback": traceback.format_exc()}, indent=2) + "\n", encoding="utf-8")
        raise
