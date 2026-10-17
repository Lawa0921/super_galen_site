"""Editable discrete-pose diagnostic and images for frozen hinge configuration #1."""
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
from original_guard_arm_hinge import RUN, SOURCE_RUN, load_source
from original_guard_arm_hinge_visibility import all_pose_meshes

OUT = RUN / "visibility-review"
POSES = {"neutral": (0, 0), "bend90": (90, 0),
         "roll45": (0, 45), "combined": (90, 45)}
PARTS = ("UpperArmArmor", "ElbowArmor", "ForearmArmor", "FlexibleSleeve")


def material(name, rgb, metallic=0.):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    p = mat.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*rgb, 1)
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Roughness"].default_value = .67
    return mat


def camera(target, offset, scale):
    data = bpy.data.cameras.new("DiagnosticCamera")
    data.type = "ORTHO"
    data.ortho_scale = scale
    obj = bpy.data.objects.new("DiagnosticCamera", data)
    bpy.context.collection.objects.link(obj)
    obj.location = Vector(target) + Vector(offset)
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = obj
    return obj


def activate_pose(objects, pose):
    for pose_name, part_objects in objects.items():
        for obj in part_objects.values():
            visible = pose_name == pose
            obj.hide_render = not visible
            obj.hide_set(not visible)


def render(objects, pose, view, target, offset, scale, wire=False):
    activate_pose(objects, pose)
    scene = bpy.context.scene
    cam = camera(target, offset, scale)
    overlays = []
    if wire:
        for obj in objects[pose].values():
            overlay = obj.copy()
            overlay.data = obj.data.copy()
            bpy.context.collection.objects.link(overlay)
            overlay.hide_set(False)
            overlay.hide_render = False
            overlay.data.materials.clear()
            overlay.data.materials.append(material("Diagnostic wire charcoal", (.01, .013, .018)))
            modifier = overlay.modifiers.new("Diagnostic surface wire", "WIREFRAME")
            modifier.thickness = .0005
            modifier.use_replace = True
            overlays.append(overlay)
    scene.render.filepath = str(OUT / "renders" / f"{pose}-{view}-{'wire' if wire else 'smooth'}.png")
    bpy.ops.render.render(write_still=True)
    for obj in overlays:
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    print("HINGE_RENDER", scene.render.filepath, flush=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "renders").mkdir(exist_ok=True)
    sweep = json.loads((RUN / "qa/sweep-report.json").read_text(encoding="utf-8"))
    config = sweep["configurations"][0]
    if (config["configuration_index"], config["pivot_t"], config["axis_mode"],
            config["elbow_follow"]) != (1, .48, "global_anatomical", 0.):
        raise ValueError("Best frozen hinge configuration changed")
    parts, stations, centers = load_source()
    geometry = json.loads((SOURCE_RUN / "candidate/original-guard-solid-arm-geometry.json").read_text(encoding="utf-8"))
    components = geometry["components"]
    sleeve = components["FlexibleSleeve"]
    parts["FlexibleSleeve"] = {"vertices": np.asarray(sleeve["vertices"], float)}
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.world = bpy.data.worlds.new("Hinge visibility world")
    scene.world.color = (.07, .08, .095)
    colors = {"UpperArmArmor": ((.50, .55, .60), .30),
              "ElbowArmor": ((.68, .59, .44), .27),
              "ForearmArmor": ((.43, .50, .56), .30),
              "FlexibleSleeve": ((.10, .12, .14), 0.)}
    mats = {name: material("QA " + name, *colors[name]) for name in PARTS}
    objects = {}
    max_coordinate_error = 0.
    face_count = {}
    for pose_name, (bend, roll) in POSES.items():
        posed = all_pose_meshes(parts, stations, centers, config, bend, roll)
        collection = bpy.data.collections.new("Pose_" + pose_name)
        scene.collection.children.link(collection)
        objects[pose_name] = {}
        for name in PARTS:
            data = components[name]
            vertices = posed[name]
            mesh = bpy.data.meshes.new(f"{pose_name}_{name}_original_topology")
            mesh.from_pydata(vertices.tolist(), [], data["faces"])
            mesh.update()
            obj = bpy.data.objects.new(f"{pose_name}_{name}", mesh)
            collection.objects.link(obj)
            mesh.materials.append(mats[name])
            for polygon in mesh.polygons:
                polygon.use_smooth = True
            objects[pose_name][name] = obj
            actual = np.asarray([vertex.co[:] for vertex in mesh.vertices])
            max_coordinate_error = max(max_coordinate_error, float(np.max(abs(actual - vertices))))
            face_count[f"{pose_name}/{name}"] = len(mesh.polygons)
            if len(mesh.polygons) != len(data["faces"]):
                raise ValueError("Source topology face count changed")
    if max_coordinate_error >= 1e-6:
        raise ValueError(f"Blender posed vertices differ from CPU by {max_coordinate_error}")
    for position, power, size in [((1.5, 2, 3), 440, 2), ((-1.5, 1, 2), 300, 2), ((.4, -2, 2), 360, 1.5)]:
        light = bpy.data.lights.new("QA softbox", "AREA")
        light.energy = power
        light.shape = "DISK"
        light.size = size
        obj = bpy.data.objects.new("QA softbox", light)
        bpy.context.collection.objects.link(obj)
        obj.location = position
        obj.rotation_euler = (Vector((.34, -.04, 1.17)) - obj.location).to_track_quat("-Z", "Y").to_euler()
    activate_pose(objects, "combined")
    bpy.context.preferences.filepaths.save_version = 0
    blend = OUT / "original-guard-best-hinge-visibility.blend"
    glb = OUT / "original-guard-best-hinge-combined.glb"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects["combined"].values():
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects["combined"]["UpperArmArmor"]
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", use_selection=True,
                              export_animations=False, export_materials="EXPORT")
    report = {"status": "qa_failed_pending_visibility", "runtime_publish_allowed": False,
              "source_geometry_unchanged": True,
              "best_configuration_index": 1, "poses": POSES,
              "pose_mesh_representation": "Four separate editable discrete-pose collections; GLB contains only combined pose",
              "blender_vs_cpu_max_vertex_error_m": max_coordinate_error,
              "face_count": face_count,
              "blend_sha256": hashlib.sha256(blend.read_bytes()).hexdigest(),
              "glb_sha256": hashlib.sha256(glb.read_bytes()).hexdigest()}
    (OUT / "geometry-export-report.json").write_bytes((json.dumps(report, indent=2) + "\n").encode())
    print("HINGE_VISIBILITY_SAVED", blend, glb, max_coordinate_error, flush=True)
    standard_target = (.34, -.04, 1.17)
    for pose in POSES:
        render(objects, pose, "front", standard_target, (0, 1.6, .25), .58)
        render(objects, pose, "side", standard_target, (1.6, 0, .2), .58)
    for view, offset in (("back", (0, -1.6, .25)),
                         ("opposite-side", (-1.6, 0, .2)),
                         ("action-close", (1.1, 1.2, .45))):
        render(objects, "combined", view, (.35, -.03, 1.18) if view == "action-close" else standard_target,
               offset, .42 if view == "action-close" else .58)
    visibility = json.loads((OUT / "ray-visibility.json").read_text(encoding="utf-8"))
    for index, segment in enumerate(visibility["crossing_segments"], 1):
        target = np.mean(segment["crossing_segment_endpoints_xyz_m"], axis=0).tolist()
        render(objects, "combined", f"crossing-{index:02d}-back-close", target,
               (0, -1.6, .25), .09)
        render(objects, "combined", f"crossing-{index:02d}-back-close", target,
               (0, -1.6, .25), .09, wire=True)
    print("HINGE_VISIBILITY_RENDER_DONE", flush=True)


if __name__ == "__main__":
    main()
