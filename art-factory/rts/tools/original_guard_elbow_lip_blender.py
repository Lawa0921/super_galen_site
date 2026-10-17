"""Editable elbow-lip candidate and matched camera proof, with original shell intact."""
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
import original_guard_arm_hinge_visibility_blender as baseline_view
from original_guard_arm_hinge import load_source
from original_guard_arm_hinge_visibility import all_pose_meshes
from original_guard_elbow_lip import RUN

OUT = RUN / "candidate"
POSES = baseline_view.POSES
PARTS = baseline_view.PARTS


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    OUT.mkdir(parents=True, exist_ok=True)
    (RUN / "qa/renders").mkdir(parents=True, exist_ok=True)
    geometry = json.loads((OUT / "original-guard-elbow-lip-geometry.json").read_text())
    components = geometry["components"]
    sweep = json.loads((baseline_view.RUN / "qa/sweep-report.json").read_text())
    config = sweep["configurations"][0]
    if (config["pivot_t"], config["axis_mode"], config["elbow_follow"]) != (.48, "global_anatomical", 0.):
        raise ValueError("Frozen hinge changed")
    parts, stations, centers = load_source()
    parts["ForearmArmor"]["vertices"] = np.asarray(components["ForearmArmor"]["vertices"], float)
    parts["FlexibleSleeve"] = {"vertices": np.asarray(components["FlexibleSleeve"]["vertices"], float)}
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.world = bpy.data.worlds.new("Elbow lip proof world")
    scene.world.color = (.07, .08, .095)
    colors = {"UpperArmArmor": ((.50, .55, .60), .30),
              "ElbowArmor": ((.68, .59, .44), .27),
              "ForearmArmor": ((.43, .50, .56), .30),
              "FlexibleSleeve": ((.10, .12, .14), 0.)}
    mats = {name: baseline_view.material("QA " + name, *colors[name]) for name in PARTS}
    objects = {}
    max_error = 0.
    face_count = {}
    for pose_name, (bend, roll) in POSES.items():
        posed = all_pose_meshes(parts, stations, centers, config, bend, roll)
        collection = bpy.data.collections.new("Pose_" + pose_name)
        scene.collection.children.link(collection)
        objects[pose_name] = {}
        for name in PARTS:
            data = components[name]
            vertices = posed[name]
            mesh = bpy.data.meshes.new(f"{pose_name}_{name}_original_topology_local_cap")
            mesh.from_pydata(vertices.tolist(), [], data["faces"])
            mesh.update()
            obj = bpy.data.objects.new(f"{pose_name}_{name}", mesh)
            collection.objects.link(obj)
            mesh.materials.append(mats[name])
            for polygon in mesh.polygons:
                polygon.use_smooth = True
            objects[pose_name][name] = obj
            actual = np.asarray([vertex.co[:] for vertex in mesh.vertices])
            max_error = max(max_error, float(np.max(abs(actual - vertices))))
            face_count[f"{pose_name}/{name}"] = len(mesh.polygons)
            if len(mesh.polygons) != len(data["faces"]):
                raise ValueError("Pose topology changed")
    if max_error >= 1e-6:
        raise ValueError(f"Blender/CPU pose drift {max_error}")
    for position, power, size in [((1.5, 2, 3), 440, 2), ((-1.5, 1, 2), 300, 2), ((.4, -2, 2), 360, 1.5)]:
        light = bpy.data.lights.new("QA softbox", "AREA")
        light.energy = power
        light.shape = "DISK"
        light.size = size
        obj = bpy.data.objects.new("QA softbox", light)
        bpy.context.collection.objects.link(obj)
        obj.location = position
        obj.rotation_euler = (Vector((.34, -.04, 1.17)) - obj.location).to_track_quat("-Z", "Y").to_euler()
    baseline_view.activate_pose(objects, "combined")
    bpy.context.preferences.filepaths.save_version = 0
    blend = OUT / "original-guard-elbow-lip.blend"
    glb = OUT / "original-guard-elbow-lip-combined.glb"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects["combined"].values():
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects["combined"]["UpperArmArmor"]
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", use_selection=True,
                              export_animations=False, export_materials="EXPORT")
    report = {"status": "qa_failed", "runtime_publish_allowed": False,
              "pose_mesh_representation": "Four editable discrete-pose collections; GLB combined only",
              "blender_vs_cpu_max_vertex_error_m": max_error, "face_count": face_count,
              "blend_sha256": hashlib.sha256(blend.read_bytes()).hexdigest(),
              "glb_sha256": hashlib.sha256(glb.read_bytes()).hexdigest()}
    (RUN / "qa/export-report.json").write_bytes((json.dumps(report, indent=2) + "\n").encode())
    print("ELBOW_LIP_SAVED", blend, glb, max_error, flush=True)
    baseline_view.OUT = RUN / "qa"
    standard_target = (.34, -.04, 1.17)
    for pose in POSES:
        baseline_view.render(objects, pose, "front", standard_target, (0, 1.6, .25), .58)
        baseline_view.render(objects, pose, "side", standard_target, (1.6, 0, .2), .58)
    target = (.375, .036, 1.195)
    baseline_view.render(objects, "combined", "cap-elbow-fore-side-close", target,
                         (1.6, 0, .2), .11)
    baseline_view.render(objects, "combined", "cap-elbow-fore-side-close", target,
                         (1.6, 0, .2), .11, wire=True)
    print("ELBOW_LIP_RENDER_DONE", flush=True)


if __name__ == "__main__":
    main()
