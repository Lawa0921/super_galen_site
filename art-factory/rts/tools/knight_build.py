"""Mounted kingdom knight candidate from original neural horse and guard art."""

import bpy
import hashlib
import json
import math
from pathlib import Path
from mathutils import Quaternion, Vector


ROOT = Path(__file__).resolve().parents[1]
SOURCE_RUN = ROOT / "runs" / "kingdom-knight" / "2026-10-05-v1"
RUN = ROOT / "runs" / "kingdom-knight" / "2026-10-05-v2"
INPUT = SOURCE_RUN / "raw" / "inputs"
SOURCE_CANDIDATE = SOURCE_RUN / "candidate"
CANDIDATE = RUN / "candidate"
CLIPS = ("Idle", "Walk", "Attack", "Hurt", "Death")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def active(ob):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def triangles(ob):
    return sum(len(face.vertices) - 2 for face in ob.data.polygons)


def decimate(ob, target):
    count = triangles(ob)
    if count <= target:
        return count
    mod = ob.modifiers.new("KnightLODReduction", "DECIMATE")
    mod.ratio = target / count
    mod.use_collapse_triangulate = True
    ob.modifiers.move(len(ob.modifiers) - 1, 0)
    active(ob)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    if ob.vertex_groups:
        active(ob)
        bpy.ops.object.vertex_group_limit_total(limit=4)
        bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    return triangles(ob)


def pbr(name, color, roughness, metallic=0, image=None, team=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if image:
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(str(image), check_existing=True)
        if team:
            mix = mat.node_tree.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            next(s for s in mix.inputs if s.identifier == "Factor_Float").default_value = 1
            next(s for s in mix.inputs if s.identifier == "A_Color").default_value = (1, 1, 1, 1)
            mat.node_tree.links.new(tex.outputs["Color"], next(s for s in mix.inputs if s.identifier == "B_Color"))
            mat.node_tree.links.new(next(s for s in mix.outputs if s.identifier == "Result_Color"), bsdf.inputs["Base Color"])
        else:
            mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def mesh(name, vertices, faces, mats, face_materials=None):
    data = bpy.data.meshes.new(name + "Mesh")
    data.from_pydata(vertices, [], faces)
    data.update()
    uv = data.uv_layers.new(name="UVMap")
    for polygon in data.polygons:
        for loop_index in polygon.loop_indices:
            vertex = data.vertices[data.loops[loop_index].vertex_index].co
            uv.data[loop_index].uv = (vertex.y * .5 + .5, vertex.z * .5)
    ob = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(ob)
    for mat in mats:
        data.materials.append(mat)
    if face_materials:
        for face, index in zip(data.polygons, face_materials):
            face.material_index = index
    return ob


def skin_rigid(ob, arm, bone):
    group = ob.vertex_groups.new(name=bone)
    group.add(list(range(len(ob.data.vertices))), 1, "REPLACE")
    ob.parent = arm
    ob.modifiers.new("KnightRigidSkin", "ARMATURE").object = arm


def horse_mesh(lod, mats):
    bpy.ops.wm.obj_import(filepath=str(SOURCE_CANDIDATE / "guard-neural-uv.obj"), forward_axis="Y", up_axis="Z")
    horse = bpy.context.object
    horse.name = f"NeuralWarhorse_LOD{lod}"
    horse.rotation_euler.z = math.pi
    horse.scale = (1.7, 3, 2.7)
    horse.location.z = 0.350668 * 2.7
    active(horse)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    horse.data.materials.clear()
    horse.data.materials.append(mats["horse"])
    for poly in horse.data.polygons:
        poly.use_smooth = True
    decimate(horse, 9900 if lod == 0 else 4800)
    return horse


HORSE_BONES = [
    ("HorseRoot", None, (0, 0, .05), (0, 0, .91)),
    ("HorseBody", "HorseRoot", (0, 0, .91), (0, 0, 1.38)),
    ("Neck", "HorseBody", (0, .65, 1.15), (0, 1.02, 1.65)),
    ("Tail", "HorseBody", (0, -1.02, 1.17), (0, -1.32, .78)),
]
LEG_FOOT_CENTERS = {
    "Front_L": (-.13, .38), "Front_R": (-.01, .63),
    "Rear_L": (.17, -.62), "Rear_R": (.08, -.95),
}
for region in ("Front", "Rear"):
    for side in ("L", "R"):
        x, y = LEG_FOOT_CENTERS[f"{region}_{side}"]
        HORSE_BONES.extend([
            (f"{region}_{side}_Upper", "HorseBody", (x, y, .98), (x, y, .48)),
            (f"{region}_{side}_Lower", f"{region}_{side}_Upper", (x, y, .48), (x, y, .04)),
        ])


def horse_armature(horse):
    data = bpy.data.armatures.new("WarhorseBoneData")
    arm = bpy.data.objects.new("WarhorseRig", data)
    bpy.context.collection.objects.link(arm)
    active(arm)
    bpy.ops.object.mode_set(mode="EDIT")
    for name, parent, head, tail in HORSE_BONES:
        bone = data.edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        if parent:
            bone.parent = data.edit_bones[parent]
            bone.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    horse.parent = arm
    horse.modifiers.new("FourLegSkin", "ARMATURE").object = arm
    names = {name: horse.vertex_groups.new(name=name) for name, _, _, _ in HORSE_BONES}
    for vertex in horse.data.vertices:
        x, y, z = vertex.co
        if y > .82 and z > 1.0:
            weights = {"Neck": min(1.0, max(0.0, (y - .82) / .25)), "HorseBody": max(0.0, 1 - (y - .82) / .25)}
        elif y < -1.0 and z > .54:
            weights = {"Tail": min(1.0, max(0.0, (-y - 1.0) / .25)), "HorseBody": max(0.0, 1 - (-y - 1.0) / .25)}
        elif ((.25 < y < .90) or (-1.03 < y < -.38)) and z < .99:
            region = "Front" if y > 0 else "Rear"
            body = min(1.0, max(0.0, (z - .50) / .35))
            lower = min(1.0, max(0.0, (.47 - z) / .20))
            # The neural horse has two lower-leg shells separated mostly along
            # Y, while their seam crosses X=0. A sign(X) split pulled a 1.6 cm
            # cross-section into a 15 cm skin sheet. Cluster by hoof position;
            # the two lower shells are disconnected and blend into HorseBody
            # at the shoulder rather than blending into one another.
            if region == "Front":
                right = float(y > .50)
            else:
                progress = min(1.0, max(0.0, (y + .88) / .18))
                right = 1 - progress * progress * (3 - 2 * progress)
            weights = {"HorseBody": body}
            for side, fraction in (("L", 1 - right), ("R", right)):
                weights[f"{region}_{side}_Upper"] = (1 - body) * (1 - lower) * fraction
                weights[f"{region}_{side}_Lower"] = (1 - body) * lower * fraction
        else:
            weights = {"HorseBody": 1.0}
        total = sum(max(0.0, value) for value in weights.values())
        for name, value in weights.items():
            if value > 1e-5:
                names[name].add([vertex.index], value / total, "REPLACE")
    active(horse)
    bpy.ops.object.vertex_group_limit_total(limit=4)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    return arm


def load_rider(lod, mats):
    source = INPUT / "guard-production-v1.blend"
    names = ["GuardRig20", f"GuardBody_LOD{lod}", f"KingdomSunShield_LOD{lod}"]
    with bpy.data.libraries.load(str(source), link=False) as (available, loaded):
        assert all(name in available.objects for name in names)
        loaded.objects = names
    for ob in loaded.objects:
        bpy.context.collection.objects.link(ob)
    arm, body, shield = loaded.objects
    arm.name = "MountedKnightRig"
    body.name = f"MountedKnightBody_LOD{lod}"
    shield.name = f"KnightSunShield_LOD{lod}"
    arm.animation_data_clear()
    for bone in arm.pose.bones:
        bone.rotation_mode = "QUATERNION"
        bone.rotation_quaternion = Quaternion((1, 0, 0, 0))
        bone.location = (0, 0, 0)
    for ob in (body, shield):
        ob.parent = arm
        for mod in ob.modifiers:
            if mod.type == "ARMATURE":
                mod.object = arm
    for slot in body.data.materials:
        if slot.name == "GuardArmor":
            slot.node_tree.nodes.get("Principled BSDF").inputs["Roughness"].default_value = .52
            for node in slot.node_tree.nodes:
                if node.type == "TEX_IMAGE":
                    node.image = bpy.data.images.load(str(SOURCE_CANDIDATE / "guard-body-1024-q90.jpg"), check_existing=True)
        elif slot.name.startswith("TeamCloth"):
            slot.name = "TeamCloth_Tabard"
            for node in slot.node_tree.nodes:
                if node.type == "TEX_IMAGE":
                    node.image = bpy.data.images.load(str(SOURCE_CANDIDATE / "teamcloth-neutral-1024-q90.jpg"), check_existing=True)
                elif node.type == "MIX" and node.data_type == "RGBA":
                    next(s for s in node.inputs if s.identifier == "A_Color").default_value = (1, 1, 1, 1)
    for index, slot in enumerate(shield.data.materials):
        if slot and slot.name.startswith("KingdomShieldEnamel"):
            shield.data.materials[index] = mats["shield"]
    decimate(body, 5700 if lod == 0 else 3100)
    if lod == 1:
        decimate(shield, 790)
    arm.location = (0, -.12, .72)
    arm.scale = (.82, .82, .82)
    return arm, body, shield


def saddle_panels(arm, mats, lod):
    result = []
    for side in (-1, 1):
        # Gently curved, thick saddlecloth drape built as a UV surface; it
        # follows the horse's barrel rather than forming a box over the mesh.
        vertices = []
        faces = []
        lower_edge = []
        for row in range(5):
            for column in range(7):
                y = -.48 + column * .145
                center_taper = max(0.0, 1 - abs(column - 3) / 3)
                z = 1.34 - row * .077 - (row / 4) * .12 * center_taper
                x = side * (.315 + .045 * math.sin(math.pi * row / 4))
                vertices.append((x, y, z + .025 * math.sin(math.pi * column / 6)))
                if row == 4:
                    lower_edge.append((x, y, z + .025 * math.sin(math.pi * column / 6)))
        for row in range(4):
            for column in range(6):
                a = row * 7 + column
                faces.extend(((a, a + 1, a + 8), (a, a + 8, a + 7)))
        panel = mesh(f"SaddleTeamCloth_{side}_LOD{lod}", vertices, faces, [mats["saddle"]])
        uv = panel.data.uv_layers.active
        for face in panel.data.polygons:
            for loop_index in face.loop_indices:
                vertex = panel.data.vertices[panel.data.loops[loop_index].vertex_index].co
                uv.data[loop_index].uv = ((vertex.y + .48) / .87, (1.34 - vertex.z) / .38)
        skin_rigid(panel, arm, "HorseBody")
        result.append(panel)
        edging = tube(f"SaddleBrassHem_{side}_LOD{lod}", lower_edge, .012 if lod == 0 else .009, mats["brass"], 6)
        skin_rigid(edging, arm, "HorseBody")
        result.append(edging)
    return result


def tube(name, points, radius, material, sides=8):
    vertices = []
    faces = []
    for index, point in enumerate(points):
        center = Vector(point)
        tangent = Vector(points[min(index + 1, len(points) - 1)]) - Vector(points[max(index - 1, 0)])
        tangent.normalize()
        first = tangent.cross(Vector((0, 0, 1)))
        if first.length < 1e-5:
            first = tangent.cross(Vector((0, 1, 0)))
        first.normalize()
        second = tangent.cross(first).normalized()
        for side in range(sides):
            angle = 2 * math.pi * side / sides
            vertices.append(center + radius * (first * math.cos(angle) + second * math.sin(angle)))
    for row in range(len(points) - 1):
        for side in range(sides):
            a = row * sides + side
            b = row * sides + (side + 1) % sides
            c = b + sides
            d = a + sides
            faces.extend(((a, b, c), (a, c, d)))
    obj = mesh(name, vertices, faces, [material])
    return obj


def tack(arm, mats, lod):
    pieces = []
    for side in (-1, 1):
        stirrup = tube(f"ForgedStirrup_{side}_LOD{lod}", [(side * .31, -.02, 1.38), (side * .38, -.02, 1.04), (side * .43, -.02, .87), (side * .43, .14, .87), (side * .38, .14, 1.04)], .017, mats["brass"], 8 if lod == 0 else 6)
        skin_rigid(stirrup, arm, "HorseBody")
        pieces.append(stirrup)
        rein = tube(f"LeatherRein_{side}_LOD{lod}", [(side * .17, 1.08, 1.62), (side * .29, .76, 1.40), (side * .29, .28, 1.42), (side * .25, -.10, 1.49)], .009, mats["leather"], 6)
        skin_rigid(rein, arm, "HorseBody")
        pieces.append(rein)
    return pieces


def lance(arm, mats, lod):
    stations = [(-.53, .015), (-.45, .039), (-.25, .043), (.18, .048), (.65, .042), (1.38, .031), (2.06, .022)]
    n = 10 if lod == 0 else 7
    vertices = []
    faces = []
    face_mats = []
    for y, radius in stations:
        for side in range(n):
            angle = 2 * math.pi * side / n
            vertices.append((.41 + radius * math.cos(angle), y, 1.17 + radius * math.sin(angle)))
    tip = [(.41, 2.40, 1.17), (.41, 2.12, 1.23), (.47, 2.12, 1.17), (.41, 2.12, 1.11), (.35, 2.12, 1.17)]
    tip_start = len(vertices)
    vertices.extend(tip)
    for segment in range(len(stations) - 1):
        for side in range(n):
            a = segment * n + side
            b = segment * n + (side + 1) % n
            faces.extend(((a, b, b + n), (a, b + n, a + n)))
            face_mats.extend((1 if segment == 1 else 0, 1 if segment == 1 else 0))
    for side in range(1, 5):
        faces.append((tip_start, tip_start + side, tip_start + (side % 4) + 1))
        face_mats.append(2)
    weapon = mesh(f"KnightLance_LOD{lod}", vertices, faces, [mats["lance_wood"], mats["leather"], mats["steel"]], face_mats)
    skin_rigid(weapon, arm, "Hand_R")
    return weapon


def world_rotation(bone, angles):
    result = Quaternion((1, 0, 0, 0))
    for axis, degrees in angles:
        direction = {"X": Vector((1, 0, 0)), "Y": Vector((0, 1, 0)), "Z": Vector((0, 0, 1))}[axis]
        local = bone.bone.matrix_local.to_3x3().inverted() @ direction
        result = result @ Quaternion(local, math.radians(degrees))
    return result


def add_nla_actions(arm, kind):
    arm.animation_data_create()
    arm.animation_data.action = None
    for track in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(track)
    frames = {
        "Idle": [1, 20, 40],
        "Walk": [1, 10, 20, 30, 40],
        "Attack": [1, 8, 16, 26, 40],
        "Hurt": [1, 7, 16, 28],
        "Death": [1, 10, 25, 48],
    }
    for clip in CLIPS:
        action = bpy.data.actions.new(f"{kind}_{clip}")
        arm.animation_data.action = action
        for frame in frames[clip]:
            for bone in arm.pose.bones:
                bone.rotation_mode = "QUATERNION"
                bone.rotation_quaternion = Quaternion((1, 0, 0, 0))
                bone.location = (0, 0, 0)
            if kind == "Horse":
                horse_pose(arm, clip, frame)
            else:
                rider_pose(arm, clip, frame)
            for bone in arm.pose.bones:
                bone.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=bone.name)
                if bone.name in ("HorseRoot", "Root"):
                    bone.keyframe_insert(data_path="location", frame=frame, group=bone.name)
        action.use_fake_user = True
        arm.animation_data.action = None
        track = arm.animation_data.nla_tracks.new()
        track.name = clip
        strip = track.strips.new(clip, frames[clip][0], action)
        strip.blend_type = "REPLACE"
        track.mute = clip != "Idle"


def horse_pose(arm, clip, frame):
    pose = {}
    if clip == "Idle":
        pose["Neck"] = [("X", 2 if frame == 20 else -2)]
        pose["Tail"] = [("Z", 5 if frame == 20 else -5)]
    elif clip == "Walk":
        phase = {1: 0, 10: 1, 20: 2, 30: 3, 40: 0}[frame]
        wave = [1, 0, -1, 0][phase]
        for region in ("Front", "Rear"):
            for side in ("L", "R"):
                sign = 1 if (region == "Front") == (side == "L") else -1
                pose[f"{region}_{side}_Upper"] = [("X", 7 * sign * wave)]
                pose[f"{region}_{side}_Lower"] = [("X", -4 * sign * wave + (4 if phase in (1, 3) else 0))]
        pose["Neck"] = [("X", 3 * wave)]
    elif clip == "Attack":
        pose["Neck"] = [("X", {1: -1, 8: -7, 16: 10, 26: 2, 40: -1}[frame])]
        pose["HorseBody"] = [("X", {1: 0, 8: -4, 16: 7, 26: 2, 40: 0}[frame])]
        for side in ("L", "R"):
            pose[f"Front_{side}_Upper"] = [("X", {1: 0, 8: -8, 16: 14, 26: 5, 40: 0}[frame])]
    elif clip == "Hurt":
        pose["HorseBody"] = [("Y", {1: 0, 7: 6, 16: -3, 28: 0}[frame])]
        pose["Neck"] = [("Z", {1: 0, 7: 12, 16: -5, 28: 0}[frame])]
    elif clip == "Death":
        lower = {1: 0, 10: -.03, 25: -.24, 48: -.46}[frame]
        root = arm.pose.bones["HorseRoot"]
        root.location = root.bone.matrix_local.to_3x3().inverted() @ Vector((0, 0, lower))
        pose["HorseBody"] = [("Y", {1: 0, 10: 12, 25: 62, 48: 76}[frame])]
        pose["Neck"] = [("X", {1: 0, 10: 9, 25: 34, 48: 42}[frame])]
        for region in ("Front", "Rear"):
            for side in ("L", "R"):
                pose[f"{region}_{side}_Upper"] = [("X", {1: 0, 10: 7, 25: 35, 48: 44}[frame])]
    for name, angles in pose.items():
        arm.pose.bones[name].rotation_quaternion = world_rotation(arm.pose.bones[name], angles)


RIDER_BASE = {
    "Thigh_L": [("X", 61), ("Z", -16)],
    "Thigh_R": [("X", 61), ("Z", 16)],
    "Shin_L": [("X", -67)],
    "Shin_R": [("X", -67)],
    "Foot_L": [("X", 7)],
    "Foot_R": [("X", 7)],
    "UpperArm_L": [("X", -28)],
    "Forearm_L": [("X", 32)],
    "UpperArm_R": [("X", -27)],
    "Forearm_R": [("X", 35)],
    "Hand_R": [("X", -20)],
}


def rider_pose(arm, clip, frame):
    states = {name: list(angles) for name, angles in RIDER_BASE.items()}
    if clip == "Idle":
        states["SpineUpper"] = [("X", 1.5 if frame == 20 else -1.5)]
    elif clip == "Walk":
        wave = {1: 1, 10: 0, 20: -1, 30: 0, 40: 1}[frame]
        states["SpineUpper"] = [("Y", 2.5 * wave)]
        states["UpperArm_L"] = [("X", -28 + 3 * wave)]
        states["UpperArm_R"] = [("X", -27 - 3 * wave)]
    elif clip == "Attack":
        angle = {1: 0, 8: -26, 16: 31, 26: 12, 40: 0}[frame]
        states["SpineUpper"] = [("X", -angle * .35)]
        states["UpperArm_R"] = [("X", -27 + angle)]
        states["Forearm_R"] = [("X", 35 - angle * .65)]
        states["Hand_R"] = [("X", -20 + angle * .3)]
    elif clip == "Hurt":
        angle = {1: 0, 7: 19, 16: -7, 28: 0}[frame]
        states["SpineLower"] = [("Y", angle)]
        states["Head"] = [("Y", -angle * .4)]
    elif clip == "Death":
        angle = {1: 0, 10: -17, 25: -48, 48: -76}[frame]
        fall = {1: 0, 10: .25, 25: .65, 48: 1}[frame]
        lower = {1: 0, 10: -.03, 25: -.24, 48: -.46}[frame]
        root = arm.pose.bones["Root"]
        root.location = root.bone.matrix_local.to_3x3().inverted() @ Vector((0, 0, lower / .82))
        states["SpineLower"] = [("Y", angle)]
        states["SpineUpper"] = [("Y", angle * .4)]
        states["UpperArm_R"] = [("Z", 30 * fall), ("X", -27 + abs(angle) * .35)]
        states["UpperArm_L"] = [("Y", 90 * fall), ("X", -28)]
    for name, angles in states.items():
        arm.pose.bones[name].rotation_quaternion = world_rotation(arm.pose.bones[name], angles)


def add_lights_camera():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.world.color = (.24, .25, .27)
    scene.view_settings.view_transform = "AgX"
    for location, energy, size in [((3, 3, 5), 850, 4), ((-3, -2, 4), 600, 4)]:
        bpy.ops.object.light_add(type="AREA", location=location)
        bpy.context.object.data.energy = energy
        bpy.context.object.data.size = size
    bpy.ops.object.camera_add(location=(4.5, 5.4, 3.7))
    camera = bpy.context.object
    camera.rotation_euler = (Vector((0, .2, 1.18)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 4.15
    scene.camera = camera


def build(lod):
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    mats = {
        "horse": pbr("HorseChestnutPBR", (1, 1, 1), .78, 0, SOURCE_CANDIDATE / "horse-body-1024-q90.jpg"),
        "saddle": pbr("TeamCloth_Saddle", (1, 1, 1), .8, 0, SOURCE_CANDIDATE / "teamcloth-saddle-weave-1024-q90.jpg", True),
        "shield": pbr("TeamCloth_Shield", (.78, .78, .78), .44, .20),
        "brass": pbr("AgedBrassTack", (.53, .34, .12), .36, .69),
        "steel": pbr("ForgedLanceSteel", (.48, .53, .57), .3, .8),
        "leather": pbr("DarkSaddleLeather", (.18, .10, .06), .72),
        "lance_wood": pbr("AshLanceShaft", (.40, .23, .10), .68),
    }
    horse = horse_mesh(lod, mats)
    horse_rig = horse_armature(horse)
    rider_rig, rider, shield = load_rider(lod, mats)
    cloth = saddle_panels(horse_rig, mats, lod)
    gear = tack(horse_rig, mats, lod)
    weapon = lance(rider_rig, mats, lod)
    root = bpy.data.objects.new("KnightRoot", None)
    bpy.context.collection.objects.link(root)
    root["unit_id"] = "knight"
    root["forward_glb"] = "-Z"
    root["runtime_publish_allowed"] = False
    for arm in (horse_rig, rider_rig):
        arm.parent = root
    add_nla_actions(horse_rig, "Horse")
    add_nla_actions(rider_rig, "KnightRider")
    add_lights_camera()
    bpy.context.scene.frame_set(1)
    meshes = [horse, rider, shield, *cloth, *gear, weapon]
    preview = RUN / "qa" / f"knight-lod{lod}-source.png"
    preview.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.render.filepath = str(preview)
    bpy.ops.render.render(write_still=True)
    # The copied guard .blend retains relative image paths from its old run.
    # Retarget even otherwise unused source datablocks before packing.
    for image in bpy.data.images:
        if image.name.startswith("body-1024-q90.jpg"):
            image.filepath = str(SOURCE_CANDIDATE / "guard-body-1024-q90.jpg")
        elif image.name.startswith("teamcloth-neutral-1024-q90.jpg"):
            image.filepath = str(SOURCE_CANDIDATE / "teamcloth-neutral-1024-q90.jpg")
    bpy.ops.file.pack_all()
    blend = RUN / "raw" / f"knight-lod{lod}.blend"
    blend.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    for arm in (horse_rig, rider_rig):
        for track in arm.animation_data.nla_tracks:
            track.mute = False
        arm.animation_data.action = None
    bpy.ops.object.select_all(action="DESELECT")
    for ob in [root, horse_rig, rider_rig, *meshes]:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = root
    target = CANDIDATE / f"knight-lod{lod}.glb"
    target.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(target), export_format="GLB", use_selection=True,
                              export_yup=True, export_normals=True, export_texcoords=True,
                              export_materials="EXPORT", export_extras=True, export_skins=True,
                              export_def_bones=True, export_animations=True,
                              export_animation_mode="NLA_TRACKS", export_nla_strips=True,
                              export_anim_slide_to_zero=True, export_image_format="JPEG",
                              export_jpeg_quality=90)
    return {"lod": lod, "triangles": {ob.name: triangles(ob) for ob in meshes},
            "triangles_total": sum(triangles(ob) for ob in meshes),
            "glb_bytes": target.stat().st_size, "glb_sha256": sha(target),
            "blend_sha256": sha(blend), "horse_bones": [bone.name for bone in horse_rig.data.bones],
            "rider_bones": [bone.name for bone in rider_rig.data.bones],
            "runtime_publish_allowed": False}


if __name__ == "__main__":
    rows = [build(lod) for lod in (0, 1)]
    (RUN / "qa" / "build.json").write_bytes(json.dumps(rows, indent=2).encode("utf-8"))
    print(json.dumps(rows, indent=2), flush=True)
