"""Roundtrip render and actual rig-motion checks for mounted knight GLBs."""

import bpy
import hashlib
import json
import math
import os
from pathlib import Path
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
RUN = ROOT / "runs" / "kingdom-knight" / "2026-10-05-v2"
OUT = RUN / "qa" / "roundtrip"
REST = {}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def clear_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    REST.clear()


def select_clip(clip, frame):
    for ob in bpy.context.scene.objects:
        if not ob.animation_data:
            continue
        for track in ob.animation_data.nla_tracks:
            track.mute = True
        ob.animation_data.action = None
        if ob.name in REST:
            location, rotation, scale = REST[ob.name]
            ob.location = location
            ob.rotation_quaternion = rotation
            ob.scale = scale
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()
    for ob in bpy.context.scene.objects:
        if ob.animation_data:
            for track in ob.animation_data.nla_tracks:
                if track.name == clip:
                    track.mute = False
    bpy.context.scene.frame_set(frame)
    for ob in bpy.context.scene.objects:
        if ob.animation_data:
            ob.update_tag(refresh={"OBJECT"})
    bpy.context.view_layer.update()


def setup_render():
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
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 4.15
    scene.camera = camera
    camera_pose("quarter")


def camera_pose(view):
    camera = bpy.context.scene.camera
    camera.location = {
        "quarter": (4.5, 5.4, 3.7),
        "side": (5.6, .2, 3.2),
        "front": (0, 5.6, 3.2),
        "back": (0, -5.6, 3.2),
    }[view]
    camera.rotation_euler = (Vector((0, .2, 1.18)) - camera.location).to_track_quat("-Z", "Y").to_euler()


def render(name):
    if os.environ.get("KNIGHT_VERIFY_DIAGNOSTIC") == "1":
        return
    OUT.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.render.filepath = str(OUT / name)
    bpy.ops.render.render(write_still=True)


def color_component(value):
    value /= 255
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4


def set_team_color(hex_color):
    rgb = tuple(color_component(c) for c in bytes.fromhex(hex_color[1:]))
    meshes = [ob for ob in bpy.context.scene.objects if ob.type == "MESH" and ob.parent and ob.parent.type == "ARMATURE"]
    materials = {mat for ob in meshes for mat in ob.data.materials if mat and "teamcloth" in mat.name.lower()}
    assert len(materials) >= 3
    for mat in materials:
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        source = next((node for node in mat.node_tree.nodes if node.type == "TEX_IMAGE" and node.image), None)
        if source:
            mix = next((node for node in mat.node_tree.nodes if node.name == "QA_TeamMultiply"), None)
            if not mix:
                mix = mat.node_tree.nodes.new("ShaderNodeMixRGB")
                mix.name = "QA_TeamMultiply"
                mix.blend_type = "MULTIPLY"
                mix.inputs[0].default_value = 1
                mat.node_tree.links.new(source.outputs["Color"], mix.inputs[1])
                mat.node_tree.links.new(mix.outputs["Color"], bsdf.inputs["Base Color"])
            mix.inputs[2].default_value = (*rgb, 1)
        else:
            bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    return sorted(mat.name for mat in materials)


def evaluated_bounds(objects):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    minimum = [math.inf, math.inf, math.inf]
    maximum = [-math.inf, -math.inf, -math.inf]
    for ob in objects:
        evaluated = ob.evaluated_get(depsgraph)
        data = evaluated.to_mesh()
        for vertex in data.vertices:
            point = evaluated.matrix_world @ vertex.co
            for axis in range(3):
                minimum[axis] = min(minimum[axis], point[axis])
                maximum[axis] = max(maximum[axis], point[axis])
        evaluated.to_mesh_clear()
    return [[round(value, 4) for value in minimum], [round(value, 4) for value in maximum]]


def inspect(lod):
    clear_scene()
    glb = RUN / "candidate" / f"knight-lod{lod}.glb"
    bpy.ops.import_scene.gltf(filepath=str(glb))
    meshes = [ob for ob in bpy.context.scene.objects if ob.type == "MESH" and ob.parent and ob.parent.type == "ARMATURE"]
    rigs = [ob for ob in bpy.context.scene.objects if ob.type == "ARMATURE"]
    for ob in bpy.context.scene.objects:
        if ob.animation_data:
            for track in ob.animation_data.nla_tracks:
                track.mute = True
            ob.animation_data.action = None
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()
    for ob in bpy.context.scene.objects:
        if ob.animation_data:
            REST[ob.name] = (ob.location.copy(), ob.rotation_quaternion.copy(), ob.scale.copy())
    setup_render()
    clips = sorted({track.name for ob in bpy.context.scene.objects if ob.animation_data for track in ob.animation_data.nla_tracks})
    team_materials = sorted({mat.name for ob in meshes for mat in ob.data.materials if mat and "teamcloth" in mat.name.lower()})
    horse = next(ob for ob in rigs if "Warhorse" in ob.name)
    rider = next(ob for ob in rigs if "MountedKnight" in ob.name)
    select_clip("Idle", 1)
    idle_bounds = evaluated_bounds(meshes)
    render(f"knight-lod{lod}-idle-quarter.png")
    if lod == 0:
        camera_pose("side")
        render("knight-lod0-idle-side.png")
        camera_pose("front")
        render("knight-lod0-idle-front.png")
        camera_pose("back")
        render("knight-lod0-idle-back.png")
        camera_pose("quarter")
        frame_renders = {"Walk": (1, 5, 10, 15, 20, 25, 30, 35, 40), "Attack": (1, 8, 16, 26), "Hurt": (7,), "Death": (10, 25, 48)}
        for clip, frames in frame_renders.items():
            for frame in frames:
                select_clip(clip, frame)
                render(f"knight-{clip.lower()}-{frame:02d}.png")
        select_clip("Walk", 1)
        front_start = (horse.matrix_world @ horse.pose.bones["Front_L_Upper"].matrix).to_quaternion()
        body_start = (horse.matrix_world @ horse.pose.bones["HorseBody"].matrix).to_quaternion()
        select_clip("Walk", 20)
        front_end = (horse.matrix_world @ horse.pose.bones["Front_L_Upper"].matrix).to_quaternion()
        body_end = (horse.matrix_world @ horse.pose.bones["HorseBody"].matrix).to_quaternion()
        leg_angle = front_start.rotation_difference(front_end).angle
        body_angle = body_start.rotation_difference(body_end).angle
        select_clip("Attack", 8)
        arm_start = (rider.matrix_world @ rider.pose.bones["UpperArm_R"].matrix).to_quaternion()
        select_clip("Attack", 16)
        arm_end = (rider.matrix_world @ rider.pose.bones["UpperArm_R"].matrix).to_quaternion()
        arm_angle = arm_start.rotation_difference(arm_end).angle
        select_clip("Death", 48)
        death_bounds = evaluated_bounds(meshes)
        select_clip("Idle", 1)
        camera_pose("quarter")
        tinted = set_team_color("#28577d")
        render("knight-blue-640.png")
        set_team_color("#87382d")
        render("knight-red-640.png")
    else:
        leg_angle = body_angle = arm_angle = None
        death_bounds = None
    result = {
        "lod": lod,
        "glb_sha256": sha(glb),
        "triangles": sum(sum(len(face.vertices) - 2 for face in ob.data.polygons) for ob in meshes),
        "mesh_objects": len(meshes),
        "mesh_diagnostics": [{"name": ob.name, "triangles": sum(len(face.vertices) - 2 for face in ob.data.polygons), "bounds": evaluated_bounds([ob]), "uv": bool(ob.data.uv_layers)} for ob in meshes],
        "animation_structure": [{"rig": ob.name, "active_action": ob.animation_data.action.name if ob.animation_data and ob.animation_data.action else None, "tracks": [(track.name, track.mute, [strip.action.name for strip in track.strips]) for track in ob.animation_data.nla_tracks] if ob.animation_data else []} for ob in rigs],
        "armatures": [ob.name for ob in rigs],
        "clips": clips,
        "team_materials": team_materials,
        "uv0_all_meshes": all(bool(ob.data.uv_layers) for ob in meshes),
        "idle_bounds_blender_xyz_m": idle_bounds,
        "death_frame48_bounds_blender_xyz_m": death_bounds,
        "walk_front_leg_world_rotation_change_rad": round(leg_angle, 4) if leg_angle is not None else None,
        "walk_horse_body_world_rotation_change_rad": round(body_angle, 4) if body_angle is not None else None,
        "attack_rider_arm_world_rotation_change_rad": round(arm_angle, 4) if arm_angle is not None else None,
        "tinted_materials": tinted if lod == 0 else None,
        "runtime_publish_allowed": False,
    }
    return result


if __name__ == "__main__":
    rows = [inspect(0), inspect(1)]
    (RUN / "qa" / "roundtrip.json").write_bytes(json.dumps(rows, indent=2).encode("utf-8"))
    print(json.dumps(rows, indent=2), flush=True)
