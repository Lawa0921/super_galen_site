"""Original +X arm proof rig, editable checkpoint, pose QA and review renders."""
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[3]
TOOLS = Path(__file__).parent
sys.path.insert(0, str(TOOLS))
from original_guard_solid_arm import AXIS, AXIS_LENGTH, AXIS_START, RUN


def material(name, rgb, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    p = mat.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*rgb, 1)
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Roughness"].default_value = .67
    return mat


def make_mesh(name, data, mat):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(data["vertices"], [], data["faces"])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj


def centerline(stations, centers, t):
    stations = np.asarray(stations)
    centers = np.asarray(centers)
    if t <= stations[0]:
        return centers[0] + (t - stations[0]) / (stations[1] - stations[0]) * (centers[1] - centers[0])
    if t >= stations[-1]:
        return centers[-1] + (t - stations[-1]) / (stations[-1] - stations[-2]) * (centers[-1] - centers[-2])
    return np.array([np.interp(t, stations, centers[:, i]) for i in range(3)])


def bend_fraction(t):
    return float(np.clip((t - .37) / .32, 0, 1))


def rotation(axis, degrees):
    return Quaternion(Vector(axis), math.radians(degrees)).to_matrix()


def mapped_centers(stations, centers, bend):
    bend_axis = np.cross(AXIS, [0., 1., 0.])
    bend_axis /= np.linalg.norm(bend_axis)
    mapped = [np.asarray(centers[0])]
    for i in range(1, len(stations)):
        step = np.asarray(centers[i]) - np.asarray(centers[i - 1])
        fraction = bend_fraction((stations[i - 1] + stations[i]) / 2)
        mapped.append(mapped[-1] + np.asarray(rotation(bend_axis, bend * fraction) @ Vector(step)))
    return np.asarray(mapped)


def posed_center(stations, centers, mapped, t, bend):
    if t <= stations[0]:
        return centerline(stations, centers, t)
    if t >= stations[-1]:
        distal = centerline(stations, centers, t) - centers[-1]
        bend_axis = np.cross(AXIS, [0., 1., 0.])
        return mapped[-1] + np.asarray(rotation(bend_axis, bend) @ Vector(distal))
    return np.array([np.interp(t, stations, mapped[:, i]) for i in range(3)])


def make_rig(components):
    sleeve = components["FlexibleSleeve"]
    stations = sleeve["stations"]
    centers = sleeve["centers"]
    armature = bpy.data.armatures.new("OriginalSolidSectionArmature")
    rig = bpy.data.objects.new("OriginalSolidSectionArmature", armature)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    assignments = {"UpperArmArmor": .32, "ElbowArmor": .50, "ForearmArmor": .80}
    assignments.update({f"SleeveRing_{i:02d}": float(t) for i, t in enumerate(stations)})
    for name, t in assignments.items():
        bone = armature.edit_bones.new(name)
        bone.head = Vector(centerline(stations, centers, t))
        bone.tail = bone.head + Vector(AXIS) * .045
        bone.align_roll(Vector((0, 1, 0)))
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.select_set(False)
    return rig, assignments


def skin(obj, rig, names, component):
    if len(names) == 1:
        group = obj.vertex_groups.new(name=names[0])
        group.add(list(range(len(obj.data.vertices))), 1., "REPLACE")
    else:
        stations = np.asarray(component["stations"])
        vertices = np.asarray(component["vertices"])
        t = ((vertices - AXIS_START) @ AXIS) / AXIS_LENGTH
        nearest = np.argmin(abs(t[:, None] - stations[None, :]), axis=1)
        for index, name in enumerate(names):
            ids = np.flatnonzero(nearest == index).tolist()
            if ids:
                group = obj.vertex_groups.new(name=name)
                group.add(ids, 1., "REPLACE")
    modifier = obj.modifiers.new("OriginalArmatureDeformation", "ARMATURE")
    modifier.object = rig
    modifier.use_deform_preserve_volume = False
    obj.parent = rig


def pose_rig(rig, assignments, sleeve, bend, roll):
    stations = np.asarray(sleeve["stations"])
    centers = np.asarray(sleeve["centers"])
    mapped = mapped_centers(stations, centers, bend)
    bend_axis = np.cross(AXIS, [0., 1., 0.])
    bend_axis /= np.linalg.norm(bend_axis)
    for name, t in assignments.items():
        # The source elbow couter is attached to the upper-arm section. Its
        # fixed hinge side clears the upper plate through the full bend.
        fraction = 0. if name == "ElbowArmor" else bend_fraction(t)
        b = rotation(bend_axis, bend * fraction)
        if name == "ForearmArmor" or name.startswith("SleeveRing_"):
            local_axis = np.asarray(b @ Vector(AXIS))
            twist = rotation(local_axis, roll * fraction)
            r = twist @ b
        else:
            r = b
        rest = centerline(stations, centers, t)
        position = rest if name == "ElbowArmor" else posed_center(stations, centers, mapped, t, bend)
        transform = Matrix.Translation(Vector(position)) @ r.to_4x4() @ Matrix.Translation(-Vector(rest))
        bone = rig.pose.bones[name]
        bone.matrix = transform @ bone.bone.matrix_local
    bpy.context.view_layer.update()


def evaluated(obj):
    ob = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = ob.to_mesh()
    vertices = np.asarray([ob.matrix_world @ vertex.co for vertex in mesh.vertices], float)
    faces = []
    for polygon in mesh.polygons:
        ids = list(polygon.vertices)
        faces.extend([[ids[0], ids[i], ids[i + 1]] for i in range(1, len(ids) - 1)])
    ob.to_mesh_clear()
    return vertices, np.asarray(faces, int)


def nonadjacent_self_intersections(vertices, faces):
    tree = BVHTree.FromPolygons([Vector(v) for v in vertices], [tuple(f) for f in faces], all_triangles=True)
    return sum(1 for a, b in tree.overlap(tree) if a < b and not set(faces[a]).intersection(faces[b]))


def cross_intersections(mesh_a, mesh_b):
    va, fa = mesh_a
    vb, fb = mesh_b
    a = BVHTree.FromPolygons([Vector(v) for v in va], [tuple(f) for f in fa], all_triangles=True)
    b = BVHTree.FromPolygons([Vector(v) for v in vb], [tuple(f) for f in fb], all_triangles=True)
    return len(a.overlap(b))


def rigid_error(rest, posed, faces):
    edges = np.unique(np.sort(np.vstack((faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]])), axis=1), axis=0)
    before = np.linalg.norm(rest[edges[:, 0]] - rest[edges[:, 1]], axis=1)
    after = np.linalg.norm(posed[edges[:, 0]] - posed[edges[:, 1]], axis=1)
    return float(np.max(abs(before - after)))


def camera(target, offset, scale):
    data = bpy.data.cameras.new("QA camera")
    data.type = "ORTHO"
    data.ortho_scale = scale
    obj = bpy.data.objects.new("QA camera", data)
    bpy.context.collection.objects.link(obj)
    obj.location = Vector(target) + Vector(offset)
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = obj
    return obj


def render(path, target, offset, scale, mode="smooth"):
    scene = bpy.context.scene
    cam = camera(target, offset, scale)
    if mode == "smooth":
        scene.render.engine = "BLENDER_EEVEE"
    else:
        scene.render.engine = "BLENDER_WORKBENCH"
        scene.display.shading.light = "STUDIO"
        scene.display.shading.color_type = "MATERIAL"
        scene.display.shading.show_cavity = True
        scene.display.shading.show_shadows = True
        scene.display.shading.show_specular_highlight = True
        scene.display.shading.show_object_outline = mode == "wire"
        scene.display.shading.show_xray = False
    overlays = []
    if mode == "wire":
        for obj in list(scene.objects):
            if obj.type != "MESH" or obj.hide_render:
                continue
            duplicate = obj.copy()
            duplicate.data = obj.data.copy()
            bpy.context.collection.objects.link(duplicate)
            duplicate.data.materials.clear()
            duplicate.data.materials.append(material("QA wire charcoal", (.015, .018, .022)))
            modifier = duplicate.modifiers.new("Surface wire", "WIREFRAME")
            modifier.thickness = .00055
            modifier.use_replace = True
            overlays.append(duplicate)
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    for obj in overlays:
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.objects.remove(cam, do_unlink=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    source = json.loads((RUN / "candidate/original-guard-solid-arm-geometry.json").read_text(encoding="utf-8"))
    components = source["components"]
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 720
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.world = bpy.data.worlds.new("Solid arm QA world")
    scene.world.color = (.075, .08, .09)
    mats = {"UpperArmArmor": material("QA steel upper", (.50, .55, .60), .33),
            "ElbowArmor": material("QA steel elbow", (.61, .65, .68), .33),
            "ForearmArmor": material("QA steel forearm", (.46, .51, .55), .33),
            "FlexibleSleeve": material("QA flexible charcoal", (.09, .11, .13))}
    objects = {name: make_mesh(name, data, mats[name]) for name, data in components.items()}
    rig, assignments = make_rig(components)
    for name, obj in objects.items():
        names = [name] if name != "FlexibleSleeve" else [f"SleeveRing_{i:02d}" for i in range(len(components[name]["stations"]))]
        skin(obj, rig, names, components[name])
    for position, power, size in [((1.5, 2, 3), 440, 2), ((-1.5, 1, 2), 300, 2), ((.4, -2, 2), 360, 1.5)]:
        light = bpy.data.lights.new("QA softbox", "AREA")
        light.energy = power
        light.shape = "DISK"
        light.size = size
        obj = bpy.data.objects.new("QA softbox", light)
        bpy.context.collection.objects.link(obj)
        obj.location = position
        obj.rotation_euler = (Vector((.34, -.04, 1.17)) - obj.location).to_track_quat("-Z", "Y").to_euler()
    poses = [("neutral", 0, 0, 0), ("bend90", 30, 90, 0),
             ("roll45", 60, 0, 45), ("combined", 90, 90, 45), ("return", 120, 0, 0)]
    for name, frame, bend, roll in poses:
        scene.frame_set(frame)
        pose_rig(rig, assignments, components["FlexibleSleeve"], bend, roll)
        for bone in rig.pose.bones:
            bone.keyframe_insert(data_path="location", frame=frame)
            bone.keyframe_insert(data_path="rotation_quaternion", frame=frame)
            bone.keyframe_insert(data_path="scale", frame=frame)
        marker = scene.timeline_markers.new(name, frame=frame)
    scene.frame_start = 0
    scene.frame_end = 120
    scene.render.fps = 30
    if rig.animation_data and rig.animation_data.action:
        rig.animation_data.action.name = "OriginalSolidArmPoseStudy"
    # Save both editable and interchange checkpoints before any render setup.
    scene.frame_set(0)
    pose_rig(rig, assignments, components["FlexibleSleeve"], 0, 0)
    candidate = RUN / "candidate"
    candidate.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    blend = candidate / "original-guard-solid-arm.blend"
    glb = candidate / "original-guard-solid-arm.glb"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    for obj in objects.values():
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", use_selection=True,
                              export_animations=True, export_materials="EXPORT")
    print("SOLID_ARM_CHECKPOINT_SAVED", str(blend), str(glb), flush=True)
    qa = {"status": "candidate_qa", "runtime_publish_allowed": False, "poses": {}}
    rest = {name: evaluated(obj) for name, obj in objects.items()}
    for name, frame, bend, roll in poses[:-1]:
        scene.frame_set(frame)
        pose_rig(rig, assignments, components["FlexibleSleeve"], bend, roll)
        meshes = {part: evaluated(obj) for part, obj in objects.items()}
        pose = {"frame": frame, "bend_degrees": bend, "roll_degrees": roll,
                "self_intersections": {}, "cross_intersections": {}, "armor_max_edge_error_m": {}}
        for part, (v, f) in meshes.items():
            pose["self_intersections"][part] = nonadjacent_self_intersections(v, f)
            if part != "FlexibleSleeve":
                pose["armor_max_edge_error_m"][part] = rigid_error(rest[part][0], v, f)
        names = list(meshes)
        for i, first in enumerate(names):
            for second in names[i + 1:]:
                pose["cross_intersections"][f"{first}/{second}"] = cross_intersections(meshes[first], meshes[second])
        qa["poses"][name] = pose
    # Intermediate samples check continuous movement, not only the four keys.
    qa["transitions"] = {}
    for frame in (5, 10, 15, 20, 25, 35, 40, 45, 50, 55, 65, 70, 75, 80, 85):
        scene.frame_set(frame)
        meshes = {part: evaluated(obj) for part, obj in objects.items()}
        qa["transitions"][str(frame)] = {
            "armor_self_intersections": sum(nonadjacent_self_intersections(*meshes[p]) for p in ("UpperArmArmor", "ElbowArmor", "ForearmArmor")),
            "metal_cross_intersections": sum(cross_intersections(meshes[a], meshes[b]) for a, b in (("UpperArmArmor", "ElbowArmor"), ("UpperArmArmor", "ForearmArmor"), ("ElbowArmor", "ForearmArmor")))}
    qa["status"] = "qa_failed" if any(
        entry["metal_cross_intersections"] for entry in qa["transitions"].values()
    ) else "mechanical_pass_pending_visual_review"
    qa_path = RUN / "qa/pose-report.json"
    qa_path.parent.mkdir(parents=True, exist_ok=True)
    qa_path.write_bytes((json.dumps(qa, indent=2) + "\n").encode("utf-8"))
    renders = RUN / "qa/renders"
    renders.mkdir(parents=True, exist_ok=True)
    for name, frame, bend, roll in poses[:-1]:
        scene.frame_set(frame)
        pose_rig(rig, assignments, components["FlexibleSleeve"], bend, roll)
        for view, offset in (("front", (0, 1.6, .25)), ("side", (1.6, 0, .2)), ("back", (0, -1.6, .25))):
            if name in ("neutral", "combined") or view == "side":
                render(renders / f"{name}-{view}-smooth.png", (.34, -.04, 1.17), offset, .58)
                render(renders / f"{name}-{view}-wire.png", (.34, -.04, 1.17), offset, .58, "wire")
        if name != "neutral":
            render(renders / f"{name}-action-close.png", (.35, -.03, 1.18), (1.1, 1.2, .45), .42)
    print("SOLID_ARM_QA_COMPLETE", qa_path, flush=True)


if __name__ == "__main__":
    main()
