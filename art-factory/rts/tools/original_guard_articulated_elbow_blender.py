"""Editable local armature, original source context, animated GLB and visual QA."""
import hashlib
import json
import math
import sys

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

TOOLS = __import__("pathlib").Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
from original_guard_solid_arm import AXIS, AXIS_LENGTH, AXIS_START, source_geometry
from original_guard_arm_hinge import center_at, source_axes

RUN = TOOLS.parents[2] / "art-factory/rts/runs/original-guard-articulated-elbow/2026-10-05"


def station(points):
    return (np.asarray(points, float) - AXIS_START) @ AXIS / AXIS_LENGTH

COMPONENTS = ("UpperArmArmor", "ElbowArmor", "ForearmArmor", "FlexibleSleeve")
POSES = (("idle", 0, 0, 0), ("bend60", 20, 60, 0), ("bend75", 25, 75, 0),
         ("bend90", 30, 90, 0), ("combined", 40, 90, 45), ("rest", 50, 0, 0))


def material(name, rgb, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = (*rgb, 1)
    node.inputs["Metallic"].default_value = metallic
    node.inputs["Roughness"].default_value = .67
    return mat


def mesh_object(name, part, mat, collection):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(part["vertices"], [], part["faces"])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    mesh.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj


def rig_setup(candidate, objects, collection):
    sleeve = candidate["components"]["FlexibleSleeve"]
    stations, centers = np.asarray(sleeve["stations"]), np.asarray(sleeve["centers"])
    pivot = center_at(stations, centers, .48)
    armature = bpy.data.armatures.new("ArticulatedElbowLocalRig")
    rig = bpy.data.objects.new("ArticulatedElbowLocalRig", armature)
    collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for name in ("UpperArm", "ElbowSupport", "Forearm"):
        bone = armature.edit_bones.new(name)
        bone.head = Vector(pivot)
        bone.tail = Vector(pivot + .085 * AXIS)
        bone.align_roll(Vector((0, 1, 0)))
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.select_set(False)
    for name, obj in objects.items():
        if name == "FlexibleSleeve":
            weights = np.asarray(sleeve["weights"])
            for index, bone in enumerate(("UpperArm", "ElbowSupport", "Forearm")):
                group = obj.vertex_groups.new(name=bone)
                for vertex, weight in enumerate(weights[:, index]):
                    if weight > 1e-8:
                        group.add([vertex], float(weight), "REPLACE")
        else:
            bone = {"UpperArmArmor": "UpperArm", "ElbowArmor": "ElbowSupport",
                    "ForearmArmor": "Forearm"}[name]
            group = obj.vertex_groups.new(name=bone)
            group.add(list(range(len(obj.data.vertices))), 1., "REPLACE")
        mod = obj.modifiers.new("NamedBoneDeformation", "ARMATURE")
        mod.object = rig
        mod.use_deform_preserve_volume = name == "FlexibleSleeve"
        obj.parent = rig
    return rig, stations, centers


def set_pose(rig, stations, centers, bend, roll):
    axes, distal = source_axes(stations, centers)
    hinge = axes["global_anatomical"]
    b = Quaternion(Vector(hinge), math.radians(bend))
    half = Quaternion(Vector(hinge), math.radians(.5*bend))
    bent_roll_axis = b @ Vector(distal)
    twist = Quaternion(bent_roll_axis, math.radians(roll))
    rotations = {"UpperArm": Quaternion(), "ElbowSupport": half,
                 "Forearm": twist @ b}
    for name, rotation in rotations.items():
        bone = rig.pose.bones[name]
        bone.matrix = Matrix.Translation(Vector(center_at(stations, centers, .48))) @ rotation.to_matrix().to_4x4() @ Matrix.Translation(-Vector(center_at(stations, centers, .48))) @ bone.bone.matrix_local
    bpy.context.view_layer.update()


def set_camera(target, offset, span):
    camera_data = bpy.data.cameras.new("QA orthographic")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = span
    camera = bpy.data.objects.new("QA orthographic", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = Vector(target) + Vector(offset)
    camera.rotation_euler = (Vector(target)-camera.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = camera
    return camera


def render(path, target, offset, span, resolution, wire=False):
    scene = bpy.context.scene
    scene.render.resolution_x = scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.engine = "BLENDER_WORKBENCH" if wire else "BLENDER_EEVEE"
    if wire:
        scene.display.shading.light = "STUDIO"
        scene.display.shading.color_type = "MATERIAL"
        scene.display.shading.show_cavity = True
        scene.display.shading.show_shadows = True
    camera = set_camera(target, offset, span)
    overlays = []
    if wire:
        for obj in list(scene.objects):
            if obj.type != "MESH" or obj.hide_render:
                continue
            wire_obj = obj.copy()
            wire_obj.data = obj.data.copy()
            bpy.context.collection.objects.link(wire_obj)
            wire_obj.data.materials.clear()
            wire_obj.data.materials.append(material("QA topology graphite", (.015, .017, .02)))
            modifier = wire_obj.modifiers.new("Surface wire", "WIREFRAME")
            modifier.thickness = .0006
            modifier.use_replace = True
            overlays.append(wire_obj)
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    for obj in overlays:
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.objects.remove(camera, do_unlink=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    candidate = json.loads((RUN / "candidate/original-guard-articulated-elbow-geometry.json").read_text())
    source_vertices, source_faces = source_geometry()
    scene = bpy.context.scene
    scene.world = bpy.data.worlds.new("Original source review world")
    scene.world.color = (.07, .08, .095)
    armor_collection = bpy.data.collections.new("ArticulatedElbowCandidate")
    scene.collection.children.link(armor_collection)
    context_collection = bpy.data.collections.new("OriginalSourceContext")
    scene.collection.children.link(context_collection)
    mats = {"UpperArmArmor": material("Original upper steel", (.50,.55,.60), .30),
            "ElbowArmor": material("Rebuilt convex couter", (.65,.60,.51), .27),
            "ForearmArmor": material("Original forearm steel", (.43,.50,.56), .30),
            "FlexibleSleeve": material("Flexible charcoal cloth", (.09,.105,.12))}
    objects = {name: mesh_object(name, candidate["components"][name], mats[name], armor_collection)
               for name in COMPONENTS}
    rig, stations, centers = rig_setup(candidate, objects, armor_collection)
    source_part = {"vertices": source_vertices.tolist(), "faces": source_faces}
    source_full = mesh_object("Original_Quadri_Source_Unmodified", source_part,
                              material("Original source graphite", (.28,.30,.32)), context_collection)
    source_full.hide_render = True
    source_full.hide_set(True)
    t = station(source_vertices)
    trimmed_faces = [face for face in source_faces if not
                     (source_vertices[face, 0].mean() > .20 and
                      np.mean(t[face]) >= .255 and np.mean(t[face]) <= .97)]
    source_trimmed = mesh_object("Original_Source_Context_RightArm_Occluded",
                                 {"vertices": source_vertices.tolist(), "faces": trimmed_faces},
                                 material("Original source context slate", (.28,.30,.32)), context_collection)
    source_trimmed.hide_render = True
    for position, power, size in (((1.5,2,3),440,2), ((-1.5,1,2),300,2), ((.4,-2,2),360,1.5)):
        data = bpy.data.lights.new("QA softbox", "AREA")
        data.energy = power; data.shape = "DISK"; data.size = size
        obj = bpy.data.objects.new("QA softbox", data)
        scene.collection.objects.link(obj)
        obj.location = position
        obj.rotation_euler = (Vector((.34,-.04,1.17))-obj.location).to_track_quat("-Z","Y").to_euler()
    for name, frame, bend, roll in POSES:
        scene.frame_set(frame)
        set_pose(rig, stations, centers, bend, roll)
        for bone in rig.pose.bones:
            bone.rotation_mode = "QUATERNION"
            bone.keyframe_insert(data_path="location", frame=frame)
            bone.keyframe_insert(data_path="rotation_quaternion", frame=frame)
            bone.keyframe_insert(data_path="scale", frame=frame)
        scene.timeline_markers.new(name, frame=frame)
    scene.frame_start = 0; scene.frame_end = 50; scene.render.fps = 30
    scene.frame_set(0)
    set_pose(rig, stations, centers, 0, 0)
    out = RUN / "candidate"
    out.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    blend = out / "original-guard-articulated-elbow.blend"
    glb = out / "original-guard-articulated-elbow-localanimated.glb"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    for obj in objects.values(): obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", use_selection=True,
                              export_animations=True, export_materials="EXPORT")
    report = {"status": "candidate_pending_visual_qa", "runtime_publish_allowed": False,
              "blend_sha256": hashlib.sha256(blend.read_bytes()).hexdigest(),
              "glb_sha256": hashlib.sha256(glb.read_bytes()).hexdigest(),
              "original_context_collection": context_collection.name,
              "original_source_object": source_full.name,
              "named_bones": [bone.name for bone in rig.data.bones],
              "pose_markers": [marker.name for marker in scene.timeline_markers],
              "local_animated_glb": str(glb.relative_to(RUN)).replace("\\","/"),
              "full_character_five_clips_complete": False}
    (RUN/"qa").mkdir(exist_ok=True)
    (RUN/"qa/export-report.json").write_bytes((json.dumps(report, indent=2)+"\n").encode())
    print("ARTICULATED_ELBOW_EXPORT", blend, glb, flush=True)
    renders = RUN / "qa/renders"
    renders.mkdir(parents=True, exist_ok=True)
    for name, frame, bend, roll in POSES[:-1]:
        scene.frame_set(frame)
        set_pose(rig, stations, centers, bend, roll)
        render(renders/f"{name}-side-smooth.png", (.34,-.04,1.17), (1.6,0,.2), .58, 720)
        render(renders/f"{name}-side-wire.png", (.34,-.04,1.17), (1.6,0,.2), .58, 720, True)
        render(renders/f"{name}-close-smooth.png", (.36,-.04,1.20), (1.6,0,.2), .18, 900)
    source_trimmed.hide_render = False
    for name, frame, bend, roll in (POSES[0], POSES[2], POSES[4]):
        scene.frame_set(frame)
        set_pose(rig, stations, centers, bend, roll)
        for size in (144, 216):
            render(renders/f"{name}-world24m-{size}px.png", (0,0,.92), (3,1,1.4), 24, size)
        for size in (96, 144):
            render(renders/f"{name}-portrait088m-{size}px.png", (.17,-.02,1.36), (1.2,1.4,.4), .88, size)
    print("ARTICULATED_ELBOW_RENDER_DONE", flush=True)


if __name__ == "__main__":
    main()
