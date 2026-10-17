"""Blender diagnostic rig and four-pose evidence for original right-arm shell."""
import hashlib
import json
import math
import os
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-arm-articulation/2026-10-05"
BASE = ROOT / "art-factory/rts/runs/original-guard-arm-cage/2026-10-05/candidate/source-fit-arm.json"
sys.path.insert(0, str(Path(__file__).parent))
from original_guard_arm_articulate import posed_centers, minimum_longitudinal_spacing, vertex_bone_assignments


def color(name, rgb, metal=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = .68
    return mat


def make_mesh(name, component, material):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(component["vertices"], [], component["faces"])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(material)
    for poly in mesh.polygons:
        poly.use_smooth = True
    return obj


def make_rig(components, base):
    data = bpy.data.armatures.new("OriginalRightArmMethodRig")
    rig = bpy.data.objects.new("OriginalRightArmMethodRig", data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    ts = np.asarray(base["ts"])
    centers = np.asarray(base["centers"])
    placements = {}
    for name in ("UpperArmArmor", "ElbowArmor", "ForearmArmor"):
        stations = np.asarray(components[name]["stations"])
        station = float(stations[len(stations) // 2])
        idx = int(np.argmin(abs(ts - station)))
        placements[name] = (idx, centers[idx])
    for i, station in enumerate(components["FlexibleElbowSleeve"]["stations"]):
        idx = int(np.argmin(abs(ts - station)))
        placements[f"SleeveRing_{i:02d}"] = (idx, centers[idx])
    axis = Vector(base["axis"])
    for name, (_, center) in placements.items():
        bone = data.edit_bones.new(name)
        bone.head = Vector(center)
        bone.tail = Vector(center) + axis * .055
        bone.align_roll(Vector((0, 1, 0)))
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.select_set(False)
    return rig, placements


def skin_object(obj, rig, bone_names):
    groups = vertex_bone_assignments(len(obj.data.vertices), bone_names, len(bone_names))
    for bone, vertices in groups.items():
        group = obj.vertex_groups.new(name=bone)
        group.add(vertices, 1.0, "REPLACE")
    modifier = obj.modifiers.new("ActualSkinning", "ARMATURE")
    modifier.object = rig
    modifier.use_deform_preserve_volume = False
    obj.parent = rig


def set_pose(rig, placements, base, forearm_distal_axis, bend, twist):
    ts = np.asarray(base["ts"])
    centers = np.asarray(base["centers"])
    mapped = posed_centers(centers, ts, bend)
    bend_axis = Vector(base["axis"]).cross(Vector((0, 1, 0))).normalized()
    for name, (idx, center) in placements.items():
        pb = rig.pose.bones[name]
        fraction = float(np.clip((ts[idx] - .4) / .3, 0, 1))
        angle = bend * fraction
        bend_rotation = Quaternion(bend_axis, math.radians(angle))
        if name.startswith("SleeveRing") or name == "ForearmArmor":
            tangent = (forearm_distal_axis if name == "ForearmArmor" else
                       centers[min(idx + 1, len(centers) - 1)] - centers[max(idx - 1, 0)])
            tangent = bend_rotation @ Vector(tangent)
            roll = twist * fraction if name.startswith("SleeveRing") else twist
            rotation = Quaternion(tangent, math.radians(roll)) @ bend_rotation
        else:
            rotation = bend_rotation
        transform = Matrix.Translation(Vector(mapped[idx])) @ rotation.to_matrix().to_4x4() @ Matrix.Translation(-Vector(center))
        pb.matrix = transform @ pb.bone.matrix_local
    bpy.context.view_layer.update()


def evaluated_mesh(obj):
    actual = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = actual.to_mesh()
    vertices = np.asarray([actual.matrix_world @ vertex.co for vertex in mesh.vertices], float)
    faces = np.asarray([tuple(poly.vertices) for poly in mesh.polygons], int)
    actual.to_mesh_clear()
    return vertices, faces


def edge_error(rest, posed, faces):
    edges = set()
    for face in faces:
        for a, b in zip(face, np.roll(face, -1)):
            edges.add(tuple(sorted((int(a), int(b)))))
    edges = np.asarray(sorted(edges), int)
    a = np.linalg.norm(rest[edges[:, 0]] - rest[edges[:, 1]], axis=1)
    b = np.linalg.norm(posed[edges[:, 0]] - posed[edges[:, 1]], axis=1)
    return float(np.max(abs(a - b)))


def collision_pairs(vertices_a, faces_a, vertices_b, faces_b):
    a = BVHTree.FromPolygons([Vector(v) for v in vertices_a], [tuple(f) for f in faces_a], all_triangles=True)
    b = BVHTree.FromPolygons([Vector(v) for v in vertices_b], [tuple(f) for f in faces_b], all_triangles=True)
    return len(a.overlap(b))


def self_collision_pairs(vertices, faces):
    tree = BVHTree.FromPolygons([Vector(v) for v in vertices], [tuple(f) for f in faces], all_triangles=True)
    collisions = tree.overlap(tree)
    return sum(1 for i, j in collisions if i < j and not set(faces[i]).intersection(faces[j]))


def self_collision_examples(vertices, faces, limit=8):
    tree = BVHTree.FromPolygons([Vector(v) for v in vertices], [tuple(f) for f in faces], all_triangles=True)
    return [[int(i), int(j)] for i, j in tree.overlap(tree)
            if i < j and not set(faces[i]).intersection(faces[j])][:limit]


def distal_roll_degrees(reference, rolled, rows):
    width = len(reference) // (2 * rows)
    def ring(points, row):
        p = points[row * width:(row + 1) * width]
        return p.mean(axis=0), p[0] - p.mean(axis=0)
    a_center, a_radial = ring(reference, rows - 1)
    b_center, b_radial = ring(rolled, rows - 1)
    earlier, _ = ring(reference, rows - 2)
    axis = a_center - earlier
    axis /= np.linalg.norm(axis)
    a = a_radial - np.dot(a_radial, axis) * axis
    b = b_radial - np.dot(b_radial, axis) * axis
    return float(math.degrees(math.atan2(np.dot(axis, np.cross(a, b)), np.dot(a, b))))


def camera(target, offset, scale):
    data = bpy.data.cameras.new("QA Camera")
    data.type = "ORTHO"
    data.ortho_scale = scale
    cam = bpy.data.objects.new("QA Camera", data)
    bpy.context.collection.objects.link(cam)
    cam.location = Vector(target) + Vector(offset)
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam
    return cam


def render(path, target, wire=False):
    cam = camera(target, (1.1, 1.9, .45), .47)
    overlays = []
    if wire:
        for ob in list(bpy.context.scene.objects):
            if ob.type != "MESH" or ob.hide_render:
                continue
            duplicate = ob.copy()
            duplicate.data = ob.data.copy()
            bpy.context.collection.objects.link(duplicate)
            duplicate.data.materials.clear()
            duplicate.data.materials.append(color("QA control wire", (.015, .025, .03)))
            modifier = duplicate.modifiers.new("QA wire", "WIREFRAME")
            modifier.thickness = .00065
            modifier.use_replace = True
            overlays.append(duplicate)
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    for ob in overlays:
        bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.objects.remove(cam, do_unlink=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    candidate = json.loads((RUN / "candidate/original-guard-arm-articulation.json").read_text(encoding="utf8"))
    base = json.loads(BASE.read_text(encoding="utf8"))
    components = candidate["components"]
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 850
    scene.render.resolution_y = 850
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.world = bpy.data.worlds.new("QA World")
    scene.world.color = (.045, .055, .065)
    mats = {"UpperArmArmor": color("QA neutral gray upper metal", (.50, .53, .56), .35),
            "ElbowArmor": color("QA neutral gray elbow metal", (.62, .65, .67), .35),
            "ForearmArmor": color("QA neutral gray forearm metal", (.44, .47, .50), .35),
            "FlexibleElbowSleeve": color("QA charcoal flexible sleeve", (.11, .14, .17))}
    objects = {name: make_mesh(name, component, mats[name]) for name, component in components.items()}
    rig, placements = make_rig(components, base)
    forearm_component = components["ForearmArmor"]
    forearm_rows = len(forearm_component["stations"])
    forearm_width = len(forearm_component["vertices"]) // (2 * forearm_rows)
    forearm_outer = np.asarray(forearm_component["vertices"][:forearm_rows * forearm_width]).reshape(
        forearm_rows, forearm_width, 3)
    forearm_distal_axis = forearm_outer[-1].mean(axis=0) - forearm_outer[-2].mean(axis=0)
    for name, obj in objects.items():
        names = [name]
        if name == "FlexibleElbowSleeve":
            names = [f"SleeveRing_{i:02d}" for i in range(len(components[name]["stations"]))]
        skin_object(obj, rig, names)
    for position, power, size in [((1.5, 2.6, 3), 520, 2), ((-2, .8, 2), 280, 2), ((.5, -2, 2.5), 350, 1.6)]:
        data = bpy.data.lights.new("QA softbox", "AREA")
        data.energy = power
        data.shape = "DISK"
        data.size = size
        lamp = bpy.data.objects.new("QA softbox", data)
        bpy.context.collection.objects.link(lamp)
        lamp.location = position
        lamp.rotation_euler = (Vector((.35, 0, 1.18)) - lamp.location).to_track_quat("-Z", "Y").to_euler()
    renders = RUN / "qa/renders"
    renders.mkdir(parents=True, exist_ok=True)
    poses = [("neutral", 0, 0), ("bend90", 90, 0), ("twist45", 0, 45), ("combined", 90, 45)]
    result = {"status": "diagnostic_candidate_pending_independent_review", "runtime_publish_allowed": False,
              "scope": "right arm only; gray materials, caps and wire are diagnostics", "poses": {}}
    forearm_positions = {}
    for name, bend, twist in poses:
        set_pose(rig, placements, base, forearm_distal_axis, bend, twist)
        meshes = {part: evaluated_mesh(obj) for part, obj in objects.items()}
        forearm_positions[name] = meshes["ForearmArmor"][0]
        pose_path = RUN / "qa/poses" / f"{name}.json"
        pose_path.parent.mkdir(parents=True, exist_ok=True)
        pose_path.write_bytes((json.dumps({"pose": name, "bend_degrees": bend,
            "twist_degrees": twist, "objects": {part: {"positions": vertices.tolist(),
            "rest_positions": components[part]["vertices"]} for part, (vertices, _) in meshes.items()}},
            indent=2) + "\n").encode("utf8"))
        record = {"armor_max_edge_error_m": {}, "self_collision_pairs": {}, "self_collision_examples": {}, "cross_collision_pairs": {}}
        for part, (v, f) in meshes.items():
            record["self_collision_pairs"][part] = self_collision_pairs(v, f)
            record["self_collision_examples"][part] = self_collision_examples(v, f)
            if part != "FlexibleElbowSleeve":
                record["armor_max_edge_error_m"][part] = edge_error(np.asarray(components[part]["vertices"]), v, f)
        sleeve_v, _ = meshes["FlexibleElbowSleeve"]
        rows = len(components["FlexibleElbowSleeve"]["stations"])
        ring_size = components["FlexibleElbowSleeve"]["ring_size"]
        record["minimum_sleeve_longitudinal_spacing_m"] = minimum_longitudinal_spacing(sleeve_v[:rows * ring_size].reshape(rows, ring_size, 3))
        names = list(meshes)
        for i, a in enumerate(names):
            for b in names[i + 1:]:
                record["cross_collision_pairs"][f"{a}/{b}"] = collision_pairs(*meshes[a], *meshes[b])
        result["poses"][name] = record
        if not os.environ.get("QA_SKIP_RENDER"):
            render(renders / f"{name}.png", (.345, 0, 1.17))
            if name in ("neutral", "combined"):
                render(renders / f"{name}-wire.png", (.345, 0, 1.17), wire=True)
    result["poses"]["twist45"]["forearm_rigid_roll_degrees"] = distal_roll_degrees(
        forearm_positions["neutral"], forearm_positions["twist45"], forearm_rows)
    result["poses"]["combined"]["forearm_rigid_roll_degrees"] = distal_roll_degrees(
        forearm_positions["bend90"], forearm_positions["combined"], forearm_rows)
    result["status"] = ("qa_failed" if any(
        any(count > 0 for count in pose["self_collision_pairs"].values()) or
        any(count > 0 for count in pose["cross_collision_pairs"].values())
        for pose in result["poses"].values()) else "mechanical_pass_pending_independent_review")
    set_pose(rig, placements, base, forearm_distal_axis, 0, 0)
    for frame, bend, twist in [(0, 0, 0), (30, 90, 0), (60, 0, 45), (90, 90, 45), (120, 0, 0)]:
        set_pose(rig, placements, base, forearm_distal_axis, bend, twist)
        for pb in rig.pose.bones:
            pb.rotation_mode = "QUATERNION"
            pb.keyframe_insert(data_path="location", frame=frame)
            pb.keyframe_insert(data_path="rotation_quaternion", frame=frame)
            pb.keyframe_insert(data_path="scale", frame=frame)
    rig.animation_data.action.name = "QA_RightArm_OriginalFourPose"
    scene.frame_start, scene.frame_end, scene.render.fps = 0, 120, 30
    scene.frame_set(0)
    blend = RUN / "candidate/original-guard-arm-articulation.blend"
    glb = RUN / "candidate/original-guard-arm-articulation.glb"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    for obj in objects.values():
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", use_selection=True,
                              export_yup=True, export_animations=True, export_force_sampling=True)
    result["artifacts_sha256"] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (blend, glb)}
    result["renders_sha256"] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in renders.glob("*.png")}
    result["tools_sha256"] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in
                              (Path(__file__), Path(__file__).with_name("original_guard_arm_articulate.py"))}
    report = RUN / "qa/pose-report.json"
    report.write_bytes((json.dumps(result, indent=2) + "\n").encode("utf8"))
    print(json.dumps({pose: {"edge": max(v["armor_max_edge_error_m"].values()),
                             "sleeve_spacing": v["minimum_sleeve_longitudinal_spacing_m"],
                             "self": v["self_collision_pairs"], "cross": v["cross_collision_pairs"]}
                      for pose, v in result["poses"].items()}))


if __name__ == "__main__":
    main()
