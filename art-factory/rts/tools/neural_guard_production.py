"""One guard production candidate: 20-bone rig, modeled equipment, five clips, two LODs.

This is a bounded art-factory experiment. It never writes to runtime paths.
Run inside Blender 5.2: blender -b --python neural_guard_production.py -- UV_OBJ RUN_DIR
"""

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from neural_guard_production_spec import BONE_SPECS, CLIP_FRAMES, transformed_point
from neural_blender_qa import add_area, render_view


def active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def material(name, color, metallic=0.0, roughness=0.5, image_path=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if image_path:
        image = bpy.data.images.load(str(image_path.resolve()), check_existing=True)
        image.colorspace_settings.name = "sRGB"
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = image
        if name.startswith("TeamCloth"):
            # Blender ignores the BSDF socket default once it is linked. A
            # Mix/Multiply node is both visible in Blender and recognized by
            # Blender's glTF exporter as baseColorFactor * baseColorTexture.
            tint = mat.node_tree.nodes.new("ShaderNodeMix")
            tint.data_type = "RGBA"
            tint.blend_type = "MULTIPLY"
            next(socket for socket in tint.inputs if socket.identifier == "Factor_Float").default_value = 1.0
            next(socket for socket in tint.inputs if socket.identifier == "A_Color").default_value = (*color, 1.0)
            mat.node_tree.links.new(tex.outputs["Color"], next(socket for socket in tint.inputs if socket.identifier == "B_Color"))
            mat.node_tree.links.new(next(socket for socket in tint.outputs if socket.identifier == "Result_Color"), bsdf.inputs["Base Color"])
        else:
            mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def set_shield_tint(material, rgb):
    """Use a review tint in Blender; exported TeamCloth_Shield stays neutral."""
    material.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = (*rgb, 1.0)


def mesh_object(name, vertices, faces, mat):
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def apply_transforms(obj):
    active(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def cylinder(name, radius, depth, location, mat, vertices=12, rotation=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation or (0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return apply_transforms(obj)


def sphere(name, radius, location, mat, segments=10, rings=6, scale=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    if scale:
        obj.scale = scale
    obj.data.materials.append(mat)
    return apply_transforms(obj)


def cube(name, location, size, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    apply_transforms(obj)
    if bevel:
        mod = obj.modifiers.new("MachinedEdge", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.materials.append(mat)
    return obj


def join_meshes(objects, name):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    result = bpy.context.object
    result.name = name
    return result


def rigid_skin(obj, armature, bone):
    group = obj.vertex_groups.new(name=bone)
    group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    obj.parent = armature
    obj.modifiers.new("RigidBoneSkin", "ARMATURE").object = armature


def make_sword(mats, armature):
    steel, gold, leather = mats["steel"], mats["gold"], mats["leather"]
    cx, cy = 0.45, 0.075
    # Six diamond-section stations form a taper with a genuine raised center
    # ridge and cutting edges; the blade is not a flat card.
    stations = [(0.74, 0.043, 0.014), (0.65, 0.049, 0.015), (0.50, 0.044, 0.013), (0.34, 0.034, 0.010), (0.18, 0.018, 0.006), (0.055, 0.001, 0.001)]
    vertices = []
    for z, width, depth in stations:
        vertices.extend([(cx - width, cy, z), (cx, cy + depth, z), (cx + width, cy, z), (cx, cy - depth, z)])
    faces = []
    for i in range(len(stations) - 1):
        for side in range(4):
            a = i * 4 + side
            b = i * 4 + (side + 1) % 4
            c = (i + 1) * 4 + (side + 1) % 4
            d = (i + 1) * 4 + side
            faces.extend([(a, b, c), (a, c, d)])
    faces.extend([(0, 1, 2), (0, 2, 3)])
    parts = [mesh_object("SwordDiamondBlade", vertices, faces, steel)]
    # Bronze quillons curve upward at the ends; leather grip has visible bands.
    parts.append(cube("SwordRicasso", (cx, cy, 0.765), (0.06, 0.035, 0.055), steel, 0.006))
    parts.append(cube("SwordCrossguard", (cx, cy, 0.792), (0.255, 0.042, 0.034), gold, 0.012))
    for sign in (-1, 1):
        parts.append(sphere("SwordQuillonTip", 0.019, (cx + sign * 0.131, cy, 0.817), gold, 10, 6, (0.75, 0.8, 1.3)))
    parts.append(cylinder("SwordGrip", 0.022, 0.195, (cx, cy, 0.904), leather, 12))
    for index in range(7):
        parts.append(cylinder("SwordGripWrap", 0.024, 0.008, (cx, cy, 0.824 + index * 0.026), gold, 12))
    parts.append(cylinder("SwordPommelCollar", 0.03, 0.025, (cx, cy, 1.014), gold, 12))
    parts.append(sphere("SwordFacetedPommel", 0.037, (cx, cy, 1.05), gold, 10, 6, (1, 0.7, 0.9)))
    sword = join_meshes(parts, "KingdomSteelSword_LOD0")
    rigid_skin(sword, armature, "Hand_R")
    return sword


def shield_ring(name, contour, cx, cy, cz, front_y, back_y, mat):
    vertices = [(cx + x, front_y, cz + z) for x, z in contour]
    vertices += [(cx + x, back_y, cz + z) for x, z in contour]
    n = len(contour)
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    faces.extend([(0, i, i + 1) for i in range(1, n - 1)])
    faces.extend([(n, n + i + 1, n + i) for i in range(1, n - 1)])
    return mesh_object(name, vertices, faces, mat)


def make_shield(mats, armature):
    cx, cy, cz = -0.455, 0.115, 1.065
    contour = [(-0.17, 0.30), (-0.105, 0.36), (0.105, 0.36), (0.17, 0.30), (0.17, -0.08), (0.105, -0.23), (0, -0.34), (-0.105, -0.23), (-0.17, -0.08)]
    inner = [(x * 0.88, z * 0.87) for x, z in contour]
    parts = [shield_ring("ShieldForgedShell", contour, cx, cy, cz, cy + 0.020, cy - 0.028, mats["steel"])]
    parts.append(shield_ring("ShieldRoyalBlueFace", inner, cx, cy, cz, cy + 0.030, cy + 0.021, mats["shield_team"]))
    # Raised bronze perimeter and rivets are physical geometry, not printed lines.
    for index, (x, z) in enumerate(contour):
        x2, z2 = contour[(index + 1) % len(contour)]
        p0 = Vector((cx + x, cy + 0.039, cz + z))
        p1 = Vector((cx + x2, cy + 0.039, cz + z2))
        segment = p1 - p0
        parts.append(cylinder("ShieldBrassRim", 0.008, segment.length, (p0 + p1) / 2, mats["gold"], 8, segment.to_track_quat("Z", "Y").to_euler()))
        parts.append(sphere("ShieldRivet", 0.010, (cx + x * 0.9, cy + 0.046, cz + z * 0.9), mats["gold"], 8, 5))
    # Eight pointed sun rays and a boss give the kingdom crest a real silhouette.
    for index in range(8):
        theta = index * math.tau / 8
        direction = Vector((math.cos(theta), math.sin(theta)))
        tangent = Vector((-direction.y, direction.x))
        tip = direction * 0.123
        left = direction * 0.045 + tangent * 0.022
        right = direction * 0.045 - tangent * 0.022
        ray = mesh_object(
            "ShieldSunRay",
            [(cx + left.x, cy + 0.051, cz + left.y), (cx + right.x, cy + 0.051, cz + right.y), (cx + tip.x, cy + 0.057, cz + tip.y), (cx + direction.x * 0.055, cy + 0.073, cz + direction.y * 0.055)],
            [(0, 1, 3), (1, 2, 3), (2, 0, 3)], mats["gold"]
        )
        parts.append(ray)
    parts.append(sphere("ShieldSunBoss", 0.051, (cx, cy + 0.062, cz), mats["gold"], 16, 8, (1, 0.28, 1)))
    parts.append(cube("ShieldBackGrip", (cx, cy - 0.05, cz), (0.18, 0.025, 0.055), mats["leather"], 0.009))
    shield = join_meshes(parts, "KingdomSunShield_LOD0")
    rigid_skin(shield, armature, "Forearm_L")
    return shield


def armature_object(source_ground, scale):
    data = bpy.data.armatures.new("Guard20BoneData")
    arm = bpy.data.objects.new("GuardRig20", data)
    bpy.context.collection.objects.link(arm)
    active(arm)
    bpy.ops.object.mode_set(mode="EDIT")
    for name, parent, head, tail in BONE_SPECS:
        bone = data.edit_bones.new(name)
        bone.head = transformed_point(head, source_ground, scale)
        bone.tail = transformed_point(tail, source_ground, scale)
        if parent:
            bone.parent = data.edit_bones[parent]
            bone.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    arm.show_in_front = True
    return arm


def apply_decimate(obj, target):
    triangles = sum(len(poly.vertices) - 2 for poly in obj.data.polygons)
    if triangles <= target:
        return triangles
    mod = obj.modifiers.new("BoundedGeometryReduction", "DECIMATE")
    mod.ratio = target / triangles
    mod.use_collapse_triangulate = True
    obj.modifiers.move(len(obj.modifiers) - 1, 0)
    active(obj)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return sum(len(poly.vertices) - 2 for poly in obj.data.polygons)


def bind_body(obj, arm):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO", keep_transform=True)
    active(obj)
    bpy.ops.object.vertex_group_limit_total(limit=4)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)


def duplicate_lod(source, name, target, armor_mat, cloth_mat):
    obj = source.copy()
    obj.data = source.data.copy()
    bpy.context.collection.objects.link(obj)
    obj.name = name
    apply_decimate(obj, target)
    # Collapse interpolation can introduce a fifth small influence even though
    # the source skin was capped at four. Re-cap after each LOD reduction.
    active(obj)
    bpy.ops.object.vertex_group_limit_total(limit=4)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    # Replace slots in place: clearing them would silently reset every
    # decimated polygon to material 0 and erase TeamCloth on LOD1.
    obj.data.materials[0] = armor_mat
    obj.data.materials[1] = cloth_mat
    return obj


def duplicate_equipment(source, name):
    obj = source.copy()
    obj.data = source.data.copy()
    bpy.context.collection.objects.link(obj)
    obj.name = name
    return obj


def make_actions(arm):
    arm.animation_data_create()
    actions = {}
    for clip, frames in CLIP_FRAMES.items():
        # ModelInstance looks up these five exact case-sensitive clip names.
        action = bpy.data.actions.new(clip)
        arm.animation_data.action = action
        for frame, state in frames:
            for bone in arm.pose.bones:
                bone.rotation_mode = "QUATERNION"
                bone.rotation_quaternion = Quaternion((1, 0, 0, 0))
                bone.location = (0, 0, 0)
            for name, value in state.items():
                if name == "$root_z":
                    # Root is Z-directed in rest; local Y is along the bone.
                    root = arm.pose.bones["Root"]
                    world_up_local = root.bone.matrix_local.to_3x3().inverted() @ Vector((0, 0, 1))
                    root.location = world_up_local * value
                    continue
                axis_name, degrees = value
                pose = arm.pose.bones[name]
                world_axis = {"X": Vector((1, 0, 0)), "Y": Vector((0, 1, 0)), "Z": Vector((0, 0, 1))}[axis_name]
                local_axis = pose.bone.matrix_local.to_3x3().inverted() @ world_axis
                pose.rotation_quaternion = Quaternion(local_axis, math.radians(degrees))
            for bone in arm.pose.bones:
                bone.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=bone.name)
                if bone.name == "Root":
                    bone.keyframe_insert(data_path="location", frame=frame, group=bone.name)
        action.use_fake_user = True
        actions[clip] = action
    arm.animation_data.action = actions["Idle"]
    return actions


def weight_metrics(obj):
    unweighted, max_influences, max_error = 0, 0, 0.0
    for vertex in obj.data.vertices:
        weights = [group.weight for group in vertex.groups if group.weight > 1e-6]
        if not weights:
            unweighted += 1
        max_influences = max(max_influences, len(weights))
        max_error = max(max_error, abs(sum(weights) - 1.0))
    return {"vertices": len(obj.data.vertices), "unweighted": unweighted, "max_influences": max_influences, "max_weight_sum_error": round(max_error, 6)}


def triangles(obj):
    return sum(len(poly.vertices) - 2 for poly in obj.data.polygons)


def select_export(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def main():
    uv_path, run_dir = [Path(value).resolve() for value in sys.argv[sys.argv.index("--") + 1 :]]
    raw, candidate, qa = (run_dir / name for name in ("raw", "candidate", "qa"))
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.wm.obj_import(filepath=str(uv_path), forward_axis="Y", up_axis="Z")
    body = bpy.context.object
    if body.type != "MESH" or len(body.data.polygons) != 24804:
        raise RuntimeError("Expected fixed v2 UV guard OBJ with 24,804 triangles")
    source_ground = min(vertex.co.z for vertex in body.data.vertices)
    source_top = max(vertex.co.z for vertex in body.data.vertices)
    scale = 1.86 / (source_top - source_ground)
    for vertex in body.data.vertices:
        vertex.co = transformed_point(tuple(vertex.co), source_ground, scale)
    body.data.update()
    cloth_faces = set(json.loads((candidate / "cloth-faces.json").read_text(encoding="utf-8")))
    mats = {
        "armor": material("GuardArmor", (1, 1, 1), 0.12, 0.52, candidate / "body-1024-q90.jpg"),
        "cloth": material("TeamCloth", (0.24, 0.45, 0.95), 0.0, 0.78, candidate / "teamcloth-neutral-1024-q90.jpg"),
        "steel": material("ForgedSteel", (0.57, 0.62, 0.67), 0.82, 0.29),
        "gold": material("WarmBrass", (0.62, 0.40, 0.13), 0.72, 0.34),
        "leather": material("WornLeather", (0.18, 0.095, 0.055), 0.02, 0.72),
        "shield_team": material("TeamCloth_Shield", (1, 1, 1), 0.25, 0.42),
    }
    body.data.materials.clear()
    body.data.materials.append(mats["armor"])
    body.data.materials.append(mats["cloth"])
    for index, polygon in enumerate(body.data.polygons):
        polygon.material_index = 1 if index in cloth_faces else 0
        polygon.use_smooth = True
    body.name = "GuardBody_LOD0"
    apply_decimate(body, 16600)
    arm = armature_object(source_ground, scale)
    bind_body(body, arm)
    body_lod1 = duplicate_lod(body, "GuardBody_LOD1", 7300, mats["armor"], mats["cloth"])
    sword = make_sword(mats, arm)
    shield = make_shield(mats, arm)
    sword_lod1 = duplicate_equipment(sword, "KingdomSteelSword_LOD1")
    shield_lod1 = duplicate_equipment(shield, "KingdomSunShield_LOD1")
    actions = make_actions(arm)
    lod0 = [body, sword, shield]
    lod1 = [body_lod1, sword_lod1, shield_lod1]
    counts = {"lod0": {obj.name: triangles(obj) for obj in lod0}, "lod1": {obj.name: triangles(obj) for obj in lod1}}
    counts["lod0_total"] = sum(counts["lod0"].values())
    counts["lod1_total"] = sum(counts["lod1"].values())
    if counts["lod0_total"] >= 20000 or not 7000 <= counts["lod1_total"] <= 10000:
        raise RuntimeError(f"Triangle budgets failed: {counts}")
    weights = {"lod0_body": weight_metrics(body), "lod1_body": weight_metrics(body_lod1), "sword": weight_metrics(sword), "shield": weight_metrics(shield)}
    if any(item["unweighted"] or item["max_influences"] > 4 or item["max_weight_sum_error"] > 0.01 for item in weights.values()):
        raise RuntimeError(f"Skin weights failed: {weights}")

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.world.color = (0.45, 0.45, 0.45)
    scene.view_settings.view_transform = "AgX"
    center = Vector((0, 0, 0.93))
    distance = 6.51
    span = 1.86
    add_area("Key", center + Vector((distance, distance, distance)), 700, span * 3, center)
    add_area("Fill", center + Vector((-distance, -distance, distance / 2)), 450, span * 3, center)
    add_area("Rim", center + Vector((distance, -distance, distance)), 650, span * 2, center)
    body_lod1.hide_render = sword_lod1.hide_render = shield_lod1.hide_render = True
    set_shield_tint(mats["shield_team"], (0.045, 0.10, 0.33))
    arm.animation_data.action = actions["Idle"]
    scene.frame_set(0)
    renders = {
        "front-positive-y": render_view("front", center + Vector((0, distance, 0)), center, span * 1.18, 640, 800, qa / "front.png"),
        "side-positive-x": render_view("side", center + Vector((distance, 0, 0)), center, span * 1.18, 640, 800, qa / "side.png"),
        "back-negative-y": render_view("back", center + Vector((0, -distance, 0)), center, span * 1.18, 640, 800, qa / "back.png"),
        "game-64px": render_view("game-64px", center + Vector((distance, distance, distance * 0.75)), center, span * 1.18 * 1.15, 64, 64, qa / "game-64px.png"),
    }
    for clip, frames in CLIP_FRAMES.items():
        if clip not in ("Walk", "Attack", "Hurt", "Death"):
            continue
        arm.animation_data.action = actions[clip]
        selected = frames if clip in ("Walk", "Attack") else [frames[1], frames[-1]]
        for frame, _ in selected:
            scene.frame_set(frame)
            render_view(f"{clip}-{frame}", center + Vector((distance, distance, distance * 0.75)), center, span * 1.18 * 1.15, 320, 400, qa / f"{clip.lower()}-{frame:02d}.png")
    arm.animation_data.action = actions["Idle"]
    scene.frame_set(0)
    # Review stills use blue-team tint; editable source and both GLBs retain a
    # neutral white factor so the runtime can recolor the shield together with cloth.
    set_shield_tint(mats["shield_team"], (1, 1, 1))
    bpy.ops.wm.save_as_mainfile(filepath=str(candidate / "guard-production-v1.blend"))
    exports = {}
    for label, objects in (("lod0", lod0), ("lod1", lod1)):
        for obj in lod0 + lod1:
            obj.hide_render = obj not in objects
        select_export([arm, *objects])
        path = candidate / f"guard-production-{label}.glb"
        bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True, export_animations=True, export_animation_mode="ACTIONS", export_image_format="JPEG", export_jpeg_quality=90, export_skins=True, export_yup=True, export_def_bones=True)
        exports[label] = {"file": str(path), "bytes": path.stat().st_size}
    result = {
        "source_uv": str(uv_path), "scale_to_1_86m": scale, "source_ground": source_ground,
        "forward": "Blender +Y, glTF -Z", "bone_names": [item[0] for item in BONE_SPECS],
        "triangles": counts, "skin_weights": weights,
        "cloth_face_count_before_decimation": len(cloth_faces),
        "material_names": [mat.name for mat in mats.values()],
        "shield_review_factor": [0.045, 0.10, 0.33, 1.0],
        "shield_export_factor": [1.0, 1.0, 1.0, 1.0],
        "clips": {name: [frame for frame, _ in frames] for name, frames in CLIP_FRAMES.items()},
        "renders": renders, "exports": exports,
    }
    (qa / "production-build.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8", newline="\n")
    print("GUARD_PRODUCTION_BUILD=" + json.dumps(result))


if __name__ == "__main__":
    main()
