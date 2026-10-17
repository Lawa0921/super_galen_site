"""Editable original arm rig, actual evaluated vertices, and diagnostic renders."""
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
from original_guard_solid_arm import AXIS, AXIS_START, AXIS_LENGTH, source_geometry

ROOT = TOOLS.parents[2]
RUN = ROOT / "art-factory/rts/runs/original-guard-arm-production/2026-10-05"
POSES = (("idle", 0, 0, 0), ("bend60", 20, 60, 0), ("bend75", 25, 75, 0),
         ("bend90", 30, 90, 0), ("combined", 40, 90, 45))
NAMES = ("UpperArmArmor", "ElbowArmor", "ForearmArmor", "FlexibleSleeve")


def station(points):
    return (np.asarray(points, float)-AXIS_START) @ AXIS / AXIS_LENGTH


def material(name, color, metallic=0.):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = .64
    return mat


def object_mesh(name, part, mat, collection):
    data = bpy.data.meshes.new(name)
    data.from_pydata(part["vertices"], [], part["faces"])
    data.update()
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    data.materials.append(mat)
    for polygon in data.polygons:
        polygon.use_smooth = True
    return obj


def matrix_pose(pivot, axis, bend, distal, roll_pivot, roll):
    pivot = Vector(pivot)
    bend_matrix = Matrix.Rotation(math.radians(bend), 4, Vector(axis))
    bend_about = Matrix.Translation(pivot) @ bend_matrix @ Matrix.Translation(-pivot)
    if roll == 0:
        return bend_about
    bent_axis = bend_matrix.to_3x3() @ Vector(distal)
    bent_roll_pivot = bend_about @ Vector(roll_pivot)
    twist = Matrix.Translation(bent_roll_pivot) @ Matrix.Rotation(
        math.radians(roll), 4, bent_axis) @ Matrix.Translation(-bent_roll_pivot)
    return twist @ bend_about


def set_pose(rig, mechanism, bend, roll):
    stations, centers, axis, distal = mechanism
    pivot = np.array([np.interp(.48, stations, centers[:, i]) for i in range(3)])
    roll_pivot = np.array([np.interp(.69, stations, centers[:, i]) for i in range(3)])
    matrices = {
        "UpperArm": Matrix.Identity(4),
        "ElbowSupport": matrix_pose(pivot, axis, .5*bend, distal, roll_pivot, 0),
        "Forearm": matrix_pose(pivot, axis, bend, distal, roll_pivot, roll),
    }
    for name, world in matrices.items():
        bone = rig.pose.bones[name]
        bone.matrix = world @ bone.bone.matrix_local
    bpy.context.view_layer.update()


def evaluated_points(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    points = [list(evaluated.matrix_world @ vertex.co) for vertex in mesh.vertices]
    evaluated.to_mesh_clear()
    return points


def render(path, center, direction, span, width=1280, height=720):
    scene = bpy.context.scene
    camera_data = bpy.data.cameras.new("QA ortho")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = span
    camera = bpy.data.objects.new("QA ortho", camera_data)
    scene.collection.objects.link(camera)
    camera.location = Vector(center) + Vector(direction)
    camera.rotation_euler = (Vector(center)-camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_cavity = True
    scene.display.shading.show_shadows = True
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(path)
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera, do_unlink=True)


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    candidate = json.loads((RUN/"candidate/original-guard-arm-production-geometry.json").read_text(encoding="utf-8"))
    source_vertices, source_faces = source_geometry()
    scene = bpy.context.scene
    armor_collection = bpy.data.collections.new("Original production arm")
    scene.collection.children.link(armor_collection)
    context_collection = bpy.data.collections.new("Original complete source context")
    scene.collection.children.link(context_collection)
    mats = {
        "UpperArmArmor": material("Upper steel", (.43, .49, .52), .40),
        "ElbowArmor": material("Couter burnished steel", (.54, .59, .60), .55),
        "ForearmArmor": material("Forearm blue steel", (.33, .40, .48), .42),
        "FlexibleSleeve": material("Recessed charcoal cloth", (.085, .10, .12)),
    }
    objects = {name: object_mesh(name, candidate["components"][name], mats[name], armor_collection)
               for name in NAMES}
    geometry = candidate["mechanism_geometry"]
    mechanism = (np.asarray(geometry["stations"]), np.asarray(geometry["centers"]),
                 np.asarray(geometry["bend_axis"]), np.asarray(geometry["distal_axis"]))
    stations, centers, axis, distal = mechanism
    pivot = np.array([np.interp(.48, stations, centers[:, i]) for i in range(3)])
    armature = bpy.data.armatures.new("OriginalGuardProductionRig")
    rig = bpy.data.objects.new("OriginalGuardProductionRig", armature)
    armor_collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for name in ("UpperArm", "ElbowSupport", "Forearm"):
        bone = armature.edit_bones.new(name)
        bone.head = Vector(pivot)
        bone.tail = Vector(pivot + .085*AXIS)
        bone.align_roll(Vector((0, 1, 0)))
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.select_set(False)
    for name, obj in objects.items():
        part = candidate["components"][name]
        if name == "FlexibleSleeve":
            weights = np.asarray(part["weights"])
            for column, bone in enumerate(("UpperArm", "ElbowSupport", "Forearm")):
                group = obj.vertex_groups.new(name=bone)
                for index, weight in enumerate(weights[:, column]):
                    if weight > 1e-8:
                        group.add([index], float(weight), "REPLACE")
        else:
            bone = {"UpperArmArmor": "UpperArm", "ElbowArmor": "ElbowSupport",
                    "ForearmArmor": "Forearm"}[name]
            group = obj.vertex_groups.new(name=bone)
            group.add(list(range(len(obj.data.vertices))), 1., "REPLACE")
        modifier = obj.modifiers.new("Original named-bone skin", "ARMATURE")
        modifier.object = rig
        modifier.use_deform_preserve_volume = False
        obj.parent = rig
    full_source = object_mesh("Original_Quadri_Source_Unmodified",
                              {"vertices": source_vertices.tolist(), "faces": source_faces},
                              material("Original source slate", (.31, .33, .34)),
                              context_collection)
    full_source.hide_render = True
    full_source.hide_set(True)
    t = station(source_vertices)
    trimmed = [face for face in source_faces if not
               (source_vertices[face, 0].mean() > .20 and
                .255 <= np.mean(t[face]) <= .96)]
    source_context = object_mesh("Original_Source_Context_RightArm_Occluded",
                                 {"vertices": source_vertices.tolist(), "faces": trimmed},
                                 material("Original source context", (.30, .32, .34)),
                                 context_collection)
    source_context.hide_render = False
    source_context.hide_set(False)
    for name, frame, bend, roll in POSES:
        scene.frame_set(frame)
        set_pose(rig, mechanism, bend, roll)
        for bone in rig.pose.bones:
            bone.rotation_mode = "QUATERNION"
            bone.keyframe_insert(data_path="location", frame=frame)
            bone.keyframe_insert(data_path="rotation_quaternion", frame=frame)
            bone.keyframe_insert(data_path="scale", frame=frame)
        scene.timeline_markers.new(name, frame=frame)
    scene.frame_start = 0
    scene.frame_end = 40
    scene.frame_set(0)
    set_pose(rig, mechanism, 0, 0)
    out = RUN/"candidate"
    out.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    blend = out/"original-guard-arm-production.blend"
    glb = out/"original-guard-arm-production-localanimated.glb"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    for obj in objects.values():
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB",
                              use_selection=True, export_animations=True,
                              export_materials="EXPORT")
    bpy.ops.object.select_all(action="DESELECT")
    source_context.select_set(True)
    bpy.context.view_layer.objects.active = source_context
    context_glb = out/"original-guard-arm-production-source-context.glb"
    bpy.ops.export_scene.gltf(filepath=str(context_glb), export_format="GLB",
                              use_selection=True, export_animations=False,
                              export_materials="EXPORT")
    evaluated = {}
    for name, frame, bend, roll in POSES:
        scene.frame_set(frame)
        set_pose(rig, mechanism, bend, roll)
        evaluated[name] = {component: evaluated_points(obj)
                           for component, obj in objects.items()}
    qa = RUN/"qa"
    qa.mkdir(parents=True, exist_ok=True)
    (qa/"blender-evaluated-vertices.json").write_text(json.dumps(
        {"poses": evaluated, "method": "actual depsgraph evaluated mesh"}, separators=(",", ":")),
        encoding="utf-8")
    (qa/"export-report.json").write_text(json.dumps(
        {"status": "candidate_pending_visual_qa", "runtime_publish_allowed": False,
         "blend_sha256": hashlib.sha256(blend.read_bytes()).hexdigest(),
         "glb_sha256": hashlib.sha256(glb.read_bytes()).hexdigest(),
         "context_glb_sha256": hashlib.sha256(context_glb.read_bytes()).hexdigest(),
         "original_full_source_object": full_source.name,
         "visible_full_character_context": source_context.name,
         "rig_bones": [bone.name for bone in rig.data.bones],
         "poses": [row[0] for row in POSES],
         "full_body_five_clips_complete": False}, indent=2)+"\n", encoding="utf-8")
    print("ARM_PRODUCTION_EXPORT", blend, glb, flush=True)
    if "--render" in sys.argv:
        folder = qa/"renders"
        folder.mkdir(parents=True, exist_ok=True)
        diagnostic_poses = (POSES[0], POSES[2], POSES[4])
        for name, frame, bend, roll in diagnostic_poses:
            scene.frame_set(frame)
            set_pose(rig, mechanism, bend, roll)
            for view, direction in (("front", (0, 2, .3)),
                                    ("side", (2, 0, .3)),
                                    ("back", (0, -2, .3))):
                render(folder/f"{name}-{view}-full.png", (0, 0, .95), direction, 2.45)
            render(folder/f"{name}-side-elbow.png", (.35, 0, 1.2),
                   (2, 0, .15), .68)
        print("ARM_PRODUCTION_RENDER", len(diagnostic_poses)*4, flush=True)


if __name__ == "__main__":
    main()
