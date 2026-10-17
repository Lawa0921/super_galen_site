"""Create deterministic gray-model evidence for the bounded Hunyuan guard pilot.

Usage:
  blender --background --python hunyuan_guard_blender_qa.py -- \
    HUNYUAN.glb OLD_TRIPO.glb RUN_DIR

The source GLBs are never modified.  Each mesh is normalized to the same 1.8-unit
height for comparable orthographic renders.  The editable .blend contains only
the Hunyuan candidate plus the neutral review studio.
"""

from __future__ import annotations

import json
import math
import statistics
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


TARGET_HEIGHT = 1.8
FULL_ORTHO_SCALE = 2.15
RENDER_VIEWS = {
    # Hunyuan emits Y-up data. glTF import maps its source-facing +Z to Blender -Y.
    "front": (0.0, -6.0, 0.9),
    "side": (6.0, 0.0, 0.9),
    "back": (0.0, 6.0, 0.9),
}


def mesh_objects() -> list[bpy.types.Object]:
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def world_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    corners = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    low = Vector(tuple(min(point[i] for point in corners) for i in range(3)))
    high = Vector(tuple(max(point[i] for point in corners) for i in range(3)))
    return low, high


def normalize(objects: list[bpy.types.Object]) -> dict:
    low, high = world_bounds(objects)
    source_height = high.z - low.z
    if source_height <= 0:
        raise RuntimeError("Imported mesh has no positive Z height")
    factor = TARGET_HEIGHT / source_height
    center_xy = Vector(((low.x + high.x) / 2, (low.y + high.y) / 2, 0))
    transform = Matrix.Translation(Vector((0, 0, -low.z * factor))) @ Matrix.Scale(factor, 4) @ Matrix.Translation(-center_xy)
    for obj in objects:
        obj.matrix_world = transform @ obj.matrix_world
    normalized_low, normalized_high = world_bounds(objects)
    return {
        "source_bounds": {"minimum": list(low), "maximum": list(high)},
        "normalization_scale": factor,
        "normalized_bounds": {"minimum": list(normalized_low), "maximum": list(normalized_high)},
    }


def remove_objects(objects: list[bpy.types.Object]) -> None:
    for obj in objects:
        bpy.data.objects.remove(obj, do_unlink=True)


def import_mesh(path: Path, prefix: str, z_rotation_degrees: float = 0.0) -> list[bpy.types.Object]:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = [obj for obj in bpy.data.objects if obj not in before]
    meshes = [obj for obj in imported if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"No meshes imported from {path}")
    for index, obj in enumerate(meshes):
        obj.name = f"{prefix}_{index:02d}"
        if z_rotation_degrees:
            obj.matrix_world = Matrix.Rotation(math.radians(z_rotation_degrees), 4, "Z") @ obj.matrix_world
    # Remove any imported cameras/lights/helpers; evidence uses one controlled studio.
    remove_objects([obj for obj in imported if obj.type != "MESH"])
    return meshes


def neutral_material() -> bpy.types.Material:
    material = bpy.data.materials.get("Shape_QA_Neutral_Gray")
    if material:
        return material
    material = bpy.data.materials.new("Shape_QA_Neutral_Gray")
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (0.42, 0.45, 0.49, 1.0)
    principled.inputs["Metallic"].default_value = 0.0
    principled.inputs["Roughness"].default_value = 0.58
    return material


def override_material(objects: list[bpy.types.Object], material: bpy.types.Material) -> None:
    for obj in objects:
        obj.data.materials.clear()
        obj.data.materials.append(material)


def add_area(name: str, location: tuple[float, float, float], energy: float, size: float) -> None:
    light = bpy.data.lights.new(name, "AREA")
    light.energy = energy
    light.shape = "DISK"
    light.size = size
    obj = bpy.data.objects.new(name, light)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector((0, 0, 0.95)) - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup_studio() -> bpy.types.Object:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.resolution_percentage = 100
    scene.render.image_settings.color_depth = "8"
    scene.world.color = (0.035, 0.042, 0.055)
    scene.view_settings.look = "AgX - Medium High Contrast"
    camera_data = bpy.data.cameras.new("Shape_QA_Camera")
    camera_data.type = "ORTHO"
    camera = bpy.data.objects.new("Shape_QA_Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    add_area("Shape_QA_Key", (-3.6, -4.2, 5.2), 850, 4.0)
    add_area("Shape_QA_Fill", (4.5, -1.8, 3.0), 520, 3.5)
    add_area("Shape_QA_Rim", (1.0, 4.5, 4.6), 720, 3.0)
    return camera


def render(camera: bpy.types.Object, location: tuple[float, float, float], target: tuple[float, float, float],
           ortho_scale: float, size: tuple[int, int], output: Path) -> None:
    camera.location = location
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = ortho_scale
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)


def actual_hand_centers(objects: list[bpy.types.Object]) -> dict[str, Vector]:
    """Locate hands from real mesh vertices in the lower-arm height band."""
    points = [obj.matrix_world @ vertex.co for obj in objects for vertex in obj.data.vertices]
    band = [point for point in points if TARGET_HEIGHT * 0.38 <= point.z <= TARGET_HEIGHT * 0.66]
    if len(band) < 100:
        raise RuntimeError("Insufficient mesh vertices in hand search band")

    centers: dict[str, Vector] = {}
    for label, side in (("left-hand", -1), ("right-hand", 1)):
        half = [point for point in band if point.x * side > 0]
        ordered = sorted(half, key=lambda point: point.x * side, reverse=True)
        outer = ordered[: max(50, len(ordered) // 7)]
        centers[label] = Vector(tuple(statistics.median(point[index] for point in outer) for index in range(3)))
    return centers


def render_set(label: str, objects: list[bpy.types.Object], camera: bpy.types.Object, output_dir: Path) -> dict:
    low, high = world_bounds(objects)
    distance = 6.0
    outputs: dict[str, str] = {}
    for view, location in RENDER_VIEWS.items():
        path = output_dir / f"{label}-{view}.png"
        render(camera, location, (0, 0, TARGET_HEIGHT / 2), FULL_ORTHO_SCALE, (720, 900), path)
        outputs[view] = str(path)

    head_path = output_dir / f"{label}-head-shoulders.png"
    render(camera, (0, -distance, 1.52), (0, 0, 1.52), 0.68, (720, 720), head_path)
    outputs["head_shoulders"] = str(head_path)

    hand_centers = actual_hand_centers(objects)
    for side, center in hand_centers.items():
        path = output_dir / f"{label}-{side}.png"
        render(camera, (center.x, -distance, center.z), (center.x, center.y, center.z), 0.48, (640, 640), path)
        outputs[side.replace("-", "_")] = str(path)
        if label == "hunyuan":
            back_path = output_dir / f"{label}-{side}-back.png"
            render(camera, (center.x, distance, center.z), (center.x, center.y, center.z), 0.48, (640, 640), back_path)
            outward = -distance if center.x < 0 else distance
            outer_path = output_dir / f"{label}-{side}-outer.png"
            render(camera, (outward, -distance, center.z), (center.x, center.y, center.z), 0.48, (640, 640), outer_path)
            outputs[f"{side.replace('-', '_')}_back"] = str(back_path)
            outputs[f"{side.replace('-', '_')}_outer"] = str(outer_path)
    outputs["hand_centers_blender_xyz"] = {name: list(center) for name, center in hand_centers.items()}
    return outputs


def mesh_stats(objects: list[bpy.types.Object]) -> dict:
    return {
        "mesh_count": len(objects),
        "vertices": sum(len(obj.data.vertices) for obj in objects),
        "triangles": sum(sum(len(poly.vertices) - 2 for poly in obj.data.polygons) for obj in objects),
    }


def main() -> None:
    args = sys.argv[sys.argv.index("--") + 1 :]
    if len(args) != 3:
        raise SystemExit("Expected HUNYUAN.glb OLD_TRIPO.glb RUN_DIR")
    candidate_path, old_path, run_dir = [Path(value).resolve() for value in args]
    candidate_dir, qa_dir = run_dir / "candidate", run_dir / "qa"
    render_dir = qa_dir / "renders"
    candidate_dir.mkdir(parents=True, exist_ok=True)
    render_dir.mkdir(parents=True, exist_ok=True)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    camera = setup_studio()
    gray = neutral_material()

    candidate_objects = import_mesh(candidate_path, "HunyuanCandidate")
    candidate_normalization = normalize(candidate_objects)
    override_material(candidate_objects, gray)
    candidate_stats = mesh_stats(candidate_objects)
    candidate_renders = render_set("hunyuan", candidate_objects, camera, render_dir)
    bpy.ops.wm.save_as_mainfile(filepath=str(candidate_dir / "original-guard-shape.blend"))

    remove_objects(candidate_objects)
    # The earlier pilot's canonical front was Blender +X. Rotate it to the same
    # source-facing Blender -Y used by the Hunyuan evidence.
    old_objects = import_mesh(old_path, "OldTripoV3", z_rotation_degrees=-90.0)
    old_normalization = normalize(old_objects)
    override_material(old_objects, gray)
    old_stats = mesh_stats(old_objects)
    old_renders = render_set("tripo-v3", old_objects, camera, render_dir)
    remove_objects(old_objects)

    report = {
        "status": "evidence_rendered_manual_review_required",
        "candidate_only": True,
        "runtime_publish_allowed": False,
        "blender_version": bpy.app.version_string,
        "comparison_rule": "Both imported GLBs normalized to 1.8 units tall; identical orthographic camera, neutral gray material, lights, resolution, and AgX look.",
        "camera_axes": {"front": "Blender -Y", "side": "Blender +X", "back": "Blender +Y"},
        "old_tripo_alignment": "Rotated -90 degrees around Blender Z because the v3 pilot's documented front was +X.",
        "candidate": {**candidate_stats, **candidate_normalization, "renders": candidate_renders},
        "old_tripo_v3": {**old_stats, **old_normalization, "renders": old_renders},
        "limitations": [
            "Gray-model renders assess shape only; no texture was generated or evaluated.",
            "The original Hunyuan GLB and highest-detail PLY remain unchanged; transforms exist only in the review .blend.",
            "The empty-handed source cannot demonstrate weapon grip or weapon/body separation.",
            "Render completion does not imply rig suitability or visual QA approval.",
        ],
    }
    (qa_dir / "blender-qa.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n"
    )
    print("HUNYUAN_GUARD_BLENDER_QA=" + json.dumps(report))


if __name__ == "__main__":
    main()
