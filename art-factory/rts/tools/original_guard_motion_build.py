"""Rebuild the original guard's five actions as a bounded candidate.

The mesh, textures, sword and shield come only from the repository's original
production-v1 Blender source. This tool changes animation data and preserves
the candidate-only lifecycle boundary; it never writes to runtime paths.
"""

import hashlib
import json
import math
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from neural_blender_qa import add_area, render_view
from neural_guard_production import set_shield_tint
from original_guard_motion_spec import (
    ATTACK_CONTACT_S,
    CLIP_DURATIONS_S,
    JOG_CYCLE_S,
    JOG_SPEED_MPS,
    JOG_STRIDE_M,
    guarded_jog_foot,
)


FPS = 30
ARMATURE_NAME = "GuardRig20"
CLIP_END_FRAMES = {name: round(duration * FPS) for name, duration in CLIP_DURATIONS_S.items()}
ACTION_ORDER = ("Idle", "Walk", "Attack", "Hurt", "Death")
TARGET_PLANE_Y_M = 0.62
TARGET_MIN_Z_M = 0.62
TARGET_MAX_Z_M = 1.32


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def reset_pose(armature):
    for pose in armature.pose.bones:
        pose.rotation_mode = "QUATERNION"
        pose.rotation_quaternion = Quaternion((1.0, 0.0, 0.0, 0.0))
        pose.location = Vector((0.0, 0.0, 0.0))
        pose.scale = Vector((1.0, 1.0, 1.0))


def local_axis(pose_bone, world_axis):
    """Resolve an intended joint axis against the actual rest-bone matrix."""

    return (pose_bone.bone.matrix_local.to_3x3().inverted() @ Vector(world_axis)).normalized()


def rotate(armature, bone_name, axis, degrees):
    pose = armature.pose.bones[bone_name]
    quaternion = Quaternion(local_axis(pose, axis), math.radians(degrees))
    pose.rotation_quaternion = quaternion @ pose.rotation_quaternion


def set_root_offset(armature, offset):
    root = armature.pose.bones["Root"]
    root.location = root.bone.matrix_local.to_3x3().inverted() @ Vector(offset)


def smoothstep(value):
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def keyed_value(frame, keys):
    if frame <= keys[0][0]:
        return keys[0][1]
    for (start_frame, start_value), (end_frame, end_value) in zip(keys, keys[1:]):
        if frame <= end_frame:
            amount = smoothstep((frame - start_frame) / (end_frame - start_frame))
            return start_value + (end_value - start_value) * amount
    return keys[-1][1]


def apply_channels(armature, frame, channels):
    for (bone_name, axis_name), keys in channels.items():
        axis = {"X": (1, 0, 0), "Y": (0, 1, 0), "Z": (0, 0, 1)}[axis_name]
        rotate(armature, bone_name, axis, keyed_value(frame, keys))


def solve_leg(armature, side, target_forward, target_lift, root_offset, foot_pitch=0.0):
    """Analytic sagittal two-link IK using measured source-bone dimensions."""

    thigh_name, shin_name, foot_name = (f"Thigh_{side}", f"Shin_{side}", f"Foot_{side}")
    thigh = armature.data.bones[thigh_name]
    shin = armature.data.bones[shin_name]
    foot = armature.data.bones[foot_name]
    length_1 = abs(thigh.tail_local.z - thigh.head_local.z)
    length_2 = abs(shin.tail_local.z - shin.head_local.z)
    hip_y = thigh.head_local.y + root_offset[1]
    hip_z = thigh.head_local.z + root_offset[2]
    target_y = target_forward
    target_z = foot.head_local.z + target_lift
    delta_y = target_y - hip_y
    delta_z = target_z - hip_z
    distance = math.hypot(delta_y, delta_z)
    minimum = abs(length_1 - length_2) + 1e-5
    maximum = length_1 + length_2 - 1e-5
    distance = max(minimum, min(maximum, distance))
    target_angle = math.atan2(delta_y, -delta_z)
    shoulder = math.acos(max(-1.0, min(1.0, (length_1**2 + distance**2 - length_2**2) / (2.0 * length_1 * distance))))
    bend = math.acos(max(-1.0, min(1.0, (distance**2 - length_1**2 - length_2**2) / (2.0 * length_1 * length_2))))
    thigh_angle = target_angle + shoulder
    rotate(armature, thigh_name, (1, 0, 0), math.degrees(thigh_angle))
    rotate(armature, shin_name, (1, 0, 0), -math.degrees(bend))
    # Child-local angle subtraction is not sufficient here because the source
    # thigh, shin and foot have different measured roll bases. Resolve the
    # final foot matrix in armature space so a planted foot preserves the
    # exact source orientation while its analytically solved ankle moves.
    bpy.context.view_layer.update()
    foot_pose = armature.pose.bones[foot_name]
    head = foot_pose.head.copy()
    orientation = Matrix.Rotation(math.radians(foot_pitch), 3, "X") @ foot.matrix_local.to_3x3()
    target_matrix = orientation.to_4x4()
    target_matrix.translation = head
    foot_pose.matrix = target_matrix


def evaluated_min_z(object_name):
    """Return the current evaluated surface minimum for contact solving."""

    obj = bpy.data.objects[object_name]
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    minimum = min((evaluated.matrix_world @ vertex.co).z for vertex in mesh.vertices)
    evaluated.to_mesh_clear()
    return minimum


def settle_equipment_wrist(armature, bone_name, object_name, target_z):
    """Solve a wrist angle that places existing equipment on the QA ground.

    This is a bounded original contact solve over the real skinned sword or
    shield surface.  It avoids a guessed angle and does not add or replace the
    repository-owned equipment mesh.
    """

    pose = armature.pose.bones[bone_name]
    baseline = pose.rotation_quaternion.copy()
    axis = local_axis(pose, (1, 0, 0))
    best = None
    for degrees in range(-120, 121, 4):
        pose.rotation_quaternion = Quaternion(axis, math.radians(degrees)) @ baseline
        bpy.context.view_layer.update()
        height = evaluated_min_z(object_name)
        score = abs(height - target_z) + abs(degrees) * 0.00005
        if best is None or score < best[0]:
            best = (score, pose.rotation_quaternion.copy())
    pose.rotation_quaternion = best[1]
    bpy.context.view_layer.update()


def settle_equipment_arm(armature, forearm_name, hand_name, object_name, target_z):
    """Two-joint surface contact solve used for the broader shield shell."""

    forearm = armature.pose.bones[forearm_name]
    hand = armature.pose.bones[hand_name]
    forearm_base = forearm.rotation_quaternion.copy()
    hand_base = hand.rotation_quaternion.copy()
    forearm_axis = local_axis(forearm, (1, 0, 0))
    hand_axis = local_axis(hand, (1, 0, 0))
    best = None
    for forearm_degrees in range(-48, 49, 8):
        forearm.rotation_quaternion = Quaternion(forearm_axis, math.radians(forearm_degrees)) @ forearm_base
        for hand_degrees in range(-176, 177, 8):
            hand.rotation_quaternion = Quaternion(hand_axis, math.radians(hand_degrees)) @ hand_base
            bpy.context.view_layer.update()
            height = evaluated_min_z(object_name)
            score = abs(height - target_z) + (abs(forearm_degrees) + abs(hand_degrees)) * 0.00002
            if best is None or score < best[0]:
                best = (score, forearm.rotation_quaternion.copy(), hand.rotation_quaternion.copy())
    forearm.rotation_quaternion = best[1]
    hand.rotation_quaternion = best[2]
    bpy.context.view_layer.update()


def settle_equipment_shoulder(armature, bone_name, object_name, target_z):
    """Finish broad-equipment contact by moving the whole arm as one unit."""

    pose = armature.pose.bones[bone_name]
    baseline = pose.rotation_quaternion.copy()
    axis = local_axis(pose, (1, 0, 0))
    best = None
    for degrees in range(-80, 81, 4):
        pose.rotation_quaternion = Quaternion(axis, math.radians(degrees)) @ baseline
        bpy.context.view_layer.update()
        height = evaluated_min_z(object_name)
        score = abs(height - target_z) + abs(degrees) * 0.00002
        if best is None or score < best[0]:
            best = (score, pose.rotation_quaternion.copy())
    pose.rotation_quaternion = best[1]
    bpy.context.view_layer.update()


def guard_arms(armature, sword_sway=0.0, shield_sway=0.0):
    # Keep both pieces of equipment in a carried guard instead of leaving the
    # source rest pose hanging beside the boots.  Elbow and wrist compensation
    # make the shield face outward and keep the sword point above ground.
    rotate(armature, "UpperArm_L", (1, 0, 0), 22.0 + shield_sway)
    rotate(armature, "Forearm_L", (1, 0, 0), -35.0 - shield_sway * 0.45)
    rotate(armature, "Hand_L", (1, 0, 0), 12.0 + shield_sway * 0.20)
    rotate(armature, "UpperArm_R", (1, 0, 0), 25.0 + sword_sway)
    rotate(armature, "Forearm_R", (1, 0, 0), -45.0 - sword_sway * 0.35)
    rotate(armature, "Hand_R", (1, 0, 0), 52.0 - sword_sway * 0.25)


def idle_pose(armature, frame):
    phase = frame / CLIP_END_FRAMES["Idle"]
    breath = math.sin(phase * math.tau)
    weight = math.sin(phase * math.tau)
    look = keyed_value(frame, [(0, 0.0), (12, 6.0), (22, 6.0), (36, -4.5), (48, -4.5), (60, 0.0), (72, 0.0)])
    root_offset = (0.018 * weight, 0.006 * math.sin(phase * math.tau * 2.0), 0.008 * breath)
    set_root_offset(armature, root_offset)
    rotate(armature, "Pelvis", (0, 0, 1), 2.0 * weight)
    rotate(armature, "SpineLower", (0, 0, 1), -1.5 * weight)
    rotate(armature, "SpineUpper", (1, 0, 0), -2.8 * breath)
    rotate(armature, "SpineUpper", (0, 0, 1), 2.2 * weight)
    rotate(armature, "Shoulder_L", (0, 1, 0), 2.0 * breath)
    rotate(armature, "Shoulder_R", (0, 1, 0), -2.0 * breath)
    rotate(armature, "Head", (0, 0, 1), look)
    guard_arms(armature, 1.2 * breath, 3.0 * math.sin(phase * math.tau - 0.45))


def walk_pose(armature, frame):
    time_s = frame / FPS
    phase = (time_s / JOG_CYCLE_S) % 1.0
    bounce = math.cos(phase * math.tau * 2.0)
    stride_wave = math.sin(phase * math.tau)
    root_offset = (0.030 * stride_wave, 0.0, -0.115 + 0.014 * bounce)
    set_root_offset(armature, root_offset)
    for side in ("L", "R"):
        foot = guarded_jog_foot(time_s, side)
        solve_leg(armature, side, foot.forward_m, foot.lift_m, root_offset, foot.pitch_deg)
    rotate(armature, "Pelvis", (0, 0, 1), 5.0 * stride_wave)
    rotate(armature, "SpineLower", (1, 0, 0), -5.0)
    rotate(armature, "SpineLower", (0, 0, 1), -4.0 * stride_wave)
    rotate(armature, "SpineUpper", (0, 0, 1), 7.0 * stride_wave)
    rotate(armature, "Head", (1, 0, 0), 2.0)
    guard_arms(
        armature,
        3.0 * math.sin(phase * math.tau + 0.35),
        5.0 * math.sin(phase * math.tau - 0.55),
    )


ATTACK_CHANNELS = {
    ("SpineLower", "X"): [(0, -3), (8, 4), (18, -10), (24, -13), (30, -5), (36, -3)],
    ("SpineUpper", "Z"): [(0, 0), (8, -15), (18, 17), (24, 22), (30, 8), (36, 0)],
    ("Head", "Z"): [(0, 0), (8, 6), (18, -4), (24, -6), (30, -2), (36, 0)],
    ("UpperArm_L", "X"): [(0, 16), (18, 19), (24, 17), (36, 16)],
    ("Forearm_L", "X"): [(0, -18), (18, -22), (24, -19), (36, -18)],
    ("UpperArm_R", "X"): [(0, 18), (8, -62), (18, 62), (24, 72), (30, 28), (36, 18)],
    ("UpperArm_R", "Z"): [(0, 5), (8, -20), (18, 20), (24, 26), (30, 10), (36, 5)],
    ("Forearm_R", "X"): [(0, -34), (8, 48), (18, -42), (24, -48), (30, -25), (36, -34)],
    ("Hand_R", "X"): [(0, 20), (8, -48), (18, 47), (24, 58), (30, 28), (36, 20)],
}


def attack_pose(armature, frame):
    root_offset = (
        keyed_value(frame, [(0, 0.0), (18, 0.018), (36, 0.0)]),
        keyed_value(frame, [(0, 0.0), (8, -0.035), (18, 0.045), (36, 0.0)]),
        keyed_value(frame, [(0, -0.075), (18, -0.095), (36, -0.075)]),
    )
    set_root_offset(armature, root_offset)
    solve_leg(armature, "L", 0.12, 0.0, root_offset)
    solve_leg(armature, "R", -0.12, 0.0, root_offset)
    apply_channels(armature, frame, ATTACK_CHANNELS)


HURT_CHANNELS = {
    ("SpineLower", "X"): [(0, 0), (4, 17), (9, 8), (15, 0)],
    ("SpineUpper", "X"): [(0, 0), (4, 23), (9, 10), (15, 0)],
    ("Head", "X"): [(0, 0), (4, -13), (9, -5), (15, 0)],
    ("UpperArm_L", "X"): [(0, 10), (4, -10), (9, 3), (15, 10)],
    ("UpperArm_R", "X"): [(0, 5), (4, -16), (9, -2), (15, 5)],
    ("Forearm_L", "X"): [(0, -8), (4, 6), (15, -8)],
    ("Forearm_R", "X"): [(0, -12), (4, 8), (15, -12)],
}


def hurt_pose(armature, frame):
    root_offset = (
        keyed_value(frame, [(0, 0.0), (4, -0.015), (15, 0.0)]),
        keyed_value(frame, [(0, 0.0), (4, -0.085), (9, -0.035), (15, 0.0)]),
        keyed_value(frame, [(0, -0.035), (4, -0.09), (9, -0.055), (15, -0.035)]),
    )
    set_root_offset(armature, root_offset)
    solve_leg(armature, "L", 0.06, 0.0, root_offset)
    solve_leg(armature, "R", -0.06, 0.0, root_offset)
    apply_channels(armature, frame, HURT_CHANNELS)


DEATH_CHANNELS = {
    # The collapse travels through pelvis, lower spine and upper spine rather
    # than using one 82 degree lumbar hinge.  Lateral rotation puts one
    # shoulder down first and gives the arms room to settle their equipment.
    ("Pelvis", "X"): [(0, 0), (12, 3), (24, 10), (34, 20), (42, 30), (48, 32)],
    ("Pelvis", "Z"): [(0, 0), (12, -2), (24, -7), (34, -14), (42, -21), (48, -20)],
    ("SpineLower", "X"): [(0, 0), (10, 5), (20, 17), (32, 33), (42, 45), (48, 44)],
    ("SpineLower", "Y"): [(0, 0), (20, -2), (32, -7), (42, -13), (48, -14)],
    ("SpineLower", "Z"): [(0, 0), (12, -3), (24, -8), (34, -15), (42, -22), (48, -20)],
    ("SpineUpper", "X"): [(0, 0), (10, 4), (20, 12), (32, 23), (42, 34), (48, 35)],
    ("SpineUpper", "Y"): [(0, 0), (20, -1), (32, -4), (42, -8), (48, -9)],
    ("SpineUpper", "Z"): [(0, 0), (20, -3), (32, -7), (42, -12), (48, -11)],
    ("Neck", "X"): [(0, 0), (20, -4), (32, -10), (42, -7), (48, -4)],
    ("Head", "X"): [(0, 0), (10, -4), (20, -9), (32, -5), (42, 3), (48, 6)],
    ("UpperArm_L", "X"): [(0, 22), (14, 16), (26, -12), (36, -42), (44, -59), (48, -64)],
    ("UpperArm_L", "Z"): [(0, 0), (20, -6), (34, -15), (48, -22)],
    ("Forearm_L", "X"): [(0, -35), (14, -20), (26, 18), (36, 49), (48, 76)],
    ("Hand_L", "X"): [(0, 12), (26, -4), (36, -24), (48, -48)],
    ("UpperArm_R", "X"): [(0, 25), (14, 16), (26, -15), (36, -48), (44, -67), (48, -74)],
    ("UpperArm_R", "Z"): [(0, 0), (20, 7), (34, 18), (48, 26)],
    ("Forearm_R", "X"): [(0, -45), (14, -20), (26, 22), (36, 58), (48, 86)],
    ("Hand_R", "X"): [(0, 52), (20, 15), (32, -30), (42, -68), (48, -88)],
}


def death_pose(armature, frame):
    root_offset = (
        keyed_value(frame, [(0, 0.0), (12, -0.025), (24, -0.08), (34, -0.17), (42, -0.23), (48, -0.25)]),
        keyed_value(frame, [(0, 0.0), (10, -0.02), (20, -0.09), (32, -0.20), (42, -0.30), (48, -0.34)]),
        keyed_value(frame, [(0, 0.0), (10, -0.08), (20, -0.23), (32, -0.33), (42, -0.35), (48, -0.35)]),
    )
    set_root_offset(armature, root_offset)
    left_foot = keyed_value(frame, [(0, 0.10), (14, 0.16), (26, 0.06), (38, -0.08), (48, -0.16)])
    right_foot = keyed_value(frame, [(0, -0.10), (14, -0.04), (26, -0.14), (38, -0.25), (48, -0.31)])
    solve_leg(armature, "L", left_foot, 0.0, root_offset, keyed_value(frame, [(0, 0), (30, 0), (48, 10)]))
    solve_leg(armature, "R", right_foot, 0.0, root_offset, keyed_value(frame, [(0, 0), (30, 0), (48, -7)]))
    apply_channels(armature, frame, DEATH_CHANNELS)
    if frame >= 36:
        contact_target = keyed_value(frame, [(36, 0.20), (42, 0.08), (46, 0.025), (48, 0.015)])
        settle_equipment_arm(armature, "Forearm_L", "Hand_L", "KingdomSunShield_LOD0", contact_target)
        settle_equipment_shoulder(armature, "UpperArm_L", "KingdomSunShield_LOD0", contact_target)
        settle_equipment_wrist(armature, "Hand_R", "KingdomSteelSword_LOD0", contact_target)


POSE_BUILDERS = {
    "Idle": idle_pose,
    "Walk": walk_pose,
    "Attack": attack_pose,
    "Hurt": hurt_pose,
    "Death": death_pose,
}


def create_actions(armature):
    armature.animation_data_create()
    for action in list(bpy.data.actions):
        if action.name in ACTION_ORDER:
            bpy.data.actions.remove(action)
    actions = {}
    for name in ACTION_ORDER:
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        action["duration_seconds"] = CLIP_DURATIONS_S[name]
        if name == "Walk":
            action["speed_mps"] = JOG_SPEED_MPS
            action["stride_length_m"] = JOG_STRIDE_M
        if name == "Attack":
            action["contact_marker_seconds"] = ATTACK_CONTACT_S
        armature.animation_data.action = action
        for frame in range(CLIP_END_FRAMES[name] + 1):
            reset_pose(armature)
            POSE_BUILDERS[name](armature, frame)
            for pose in armature.pose.bones:
                pose.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=pose.name)
                if pose.name == "Root":
                    pose.keyframe_insert(data_path="location", frame=frame, group=pose.name)
        actions[name] = action
    armature.animation_data.action = actions["Idle"]
    bpy.context.scene.frame_set(0)
    return actions


def configure_review_scene():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.fps = FPS
    scene.render.fps_base = 1.0
    scene.world.color = (0.012, 0.015, 0.022)
    scene.view_settings.view_transform = "AgX"
    for name in ("GuardBody_LOD0", "KingdomSteelSword_LOD0", "KingdomSunShield_LOD0"):
        bpy.data.objects[name].hide_render = False
    for name in ("GuardBody_LOD1", "KingdomSteelSword_LOD1", "KingdomSunShield_LOD1"):
        bpy.data.objects[name].hide_render = True
    center = Vector((0.0, 0.0, 0.82))
    distance = 5.7
    if not any(obj.type == "LIGHT" for obj in scene.objects):
        add_area("MotionKey", center + Vector((distance, distance, distance)), 700, 5.5, center)
        add_area("MotionFill", center + Vector((-distance, -distance, distance / 2)), 450, 5.5, center)
        add_area("MotionRim", center + Vector((distance, -distance, distance)), 650, 3.8, center)
    return center, distance


def qa_material(name, color, emission_strength=0.0):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1.0)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1.0)
    principled.inputs["Roughness"].default_value = 0.82
    if emission_strength:
        principled.inputs["Emission Color"].default_value = (*color, 1.0)
        principled.inputs["Emission Strength"].default_value = emission_strength
    return material


def qa_box(name, location, scale, material):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(material)
    return obj


def remove_qa_objects(objects):
    for obj in objects:
        if obj and obj.name in bpy.data.objects:
            bpy.data.objects.remove(obj, do_unlink=True)


def create_target_ruler():
    material = qa_material("QA_TargetAmber", (1.0, 0.20, 0.035), 2.5)
    half_width = 0.52
    half_height = (TARGET_MAX_Z_M - TARGET_MIN_Z_M) / 2.0
    center_z = (TARGET_MAX_Z_M + TARGET_MIN_Z_M) / 2.0
    pieces = [
        qa_box("QA_Target_Left", (-half_width, TARGET_PLANE_Y_M, center_z), (0.012, 0.012, half_height), material),
        qa_box("QA_Target_Right", (half_width, TARGET_PLANE_Y_M, center_z), (0.012, 0.012, half_height), material),
        qa_box("QA_Target_Top", (0.0, TARGET_PLANE_Y_M, TARGET_MAX_Z_M), (half_width, 0.012, 0.012), material),
        qa_box("QA_Target_Bottom", (0.0, TARGET_PLANE_Y_M, TARGET_MIN_Z_M), (half_width, 0.012, 0.012), material),
        qa_box("QA_Target_Center", (0.0, TARGET_PLANE_Y_M, center_z), (half_width, 0.006, 0.005), material),
    ]
    return pieces


def create_ground_grid():
    floor_material = qa_material("QA_Ground", (0.035, 0.045, 0.055))
    major_material = qa_material("QA_GridMajor", (0.80, 0.34, 0.08), 1.0)
    minor_material = qa_material("QA_GridMinor", (0.18, 0.26, 0.32), 0.35)
    objects = [qa_box("QA_Ground", (0.0, 3.0, -0.035), (1.8, 6.0, 0.025), floor_material)]
    for index in range(-4, 17):
        y = index * 0.5
        material = major_material if index % 2 == 0 else minor_material
        thickness = 0.012 if index % 2 == 0 else 0.006
        objects.append(qa_box(f"QA_Grid_Y_{index}", (0.0, y, 0.002), (1.8, thickness, 0.004), material))
    for index in range(-6, 7):
        x = index * 0.3
        material = major_material if index % 2 == 0 else minor_material
        thickness = 0.010 if index % 2 == 0 else 0.005
        objects.append(qa_box(f"QA_Grid_X_{index}", (x, 3.0, 0.003), (thickness, 6.0, 0.004), material))
    return objects


def render_moving_walk(run_dir, armature, action, center, distance):
    """Render an actual 3 m/s translation against a fixed QA grid."""

    scene = bpy.context.scene
    camera = scene.camera
    grid = create_ground_grid()
    output = run_dir / "qa" / "walk-3mps-side.mp4"
    original_location = armature.location.copy()
    original_action = armature.animation_data.action
    frame_count = 60
    with tempfile.TemporaryDirectory(prefix="guard-motion-grid-") as folder:
        frames = Path(folder)
        scene.render.image_settings.media_type = "IMAGE"
        scene.render.image_settings.file_format = "PNG"
        scene.render.resolution_x = 480
        scene.render.resolution_y = 360
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = 2.55
        armature.animation_data.action = action
        for output_frame in range(frame_count):
            pose_frame = output_frame % CLIP_END_FRAMES["Walk"]
            scene.frame_set(pose_frame)
            travel = JOG_SPEED_MPS * output_frame / FPS
            armature.location = Vector((0.0, travel, 0.0))
            target = Vector((0.0, travel, 0.82))
            camera.location = target + Vector((distance, 0.0, 0.18))
            camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
            scene.render.filepath = str(frames / f"{output_frame:04d}.png")
            bpy.ops.render.render(write_still=True)
        creation_flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        subprocess.run(
            [
                "ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS),
                "-i", str(frames / "%04d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-movflags", "+faststart", str(output),
            ],
            check=True,
            creationflags=creation_flags,
        )
    armature.location = original_location
    armature.animation_data.action = original_action
    remove_qa_objects(grid)
    return str(output)


def render_evidence(run_dir, armature, actions):
    qa = run_dir / "qa"
    center, distance = configure_review_scene()
    shield_material = bpy.data.materials.get("TeamCloth_Shield")
    if shield_material:
        set_shield_tint(shield_material, (0.045, 0.10, 0.33))
    stills = {}
    review_frames = {
        "Idle": (0, 18, 36, 54),
        "Walk": (0, 3, 6, 10, 13, 16),
        "Attack": (0, 8, 14, 18, 24, 30, 35),
        "Hurt": (0, 4, 9, 14),
        "Death": (0, 10, 20, 32, 40, 47),
    }
    for name, frames in review_frames.items():
        armature.animation_data.action = actions[name]
        for frame in frames:
            bpy.context.scene.frame_set(frame)
            path = qa / f"{name.lower()}-{frame:02d}.png"
            render_view(path.stem, center + Vector((distance, distance, distance * 0.70)), center, 2.35, 384, 480, path)
            stills[f"{name}:{frame}"] = str(path)
    armature.animation_data.action = actions["Idle"]
    bpy.context.scene.frame_set(0)
    for label, position in {
        "front": center + Vector((0, distance, 0.15)),
        "side": center + Vector((distance, 0, 0.15)),
        "back": center + Vector((0, -distance, 0.15)),
    }.items():
        path = qa / f"idle-{label}.png"
        render_view(path.stem, position, center, 2.35, 384, 480, path)
        stills[f"Idle:{label}"] = str(path)

    target_objects = create_target_ruler()
    armature.animation_data.action = actions["Attack"]
    contact_frame = round(ATTACK_CONTACT_S * FPS)
    bpy.context.scene.frame_set(contact_frame)
    contact_path = qa / f"attack-target-contact-{contact_frame:02d}.png"
    render_view(contact_path.stem, center + Vector((distance, distance, distance * 0.70)), center, 2.35, 480, 480, contact_path)
    stills[f"Attack:target-contact-{contact_frame}"] = str(contact_path)
    remove_qa_objects(target_objects)

    scene = bpy.context.scene
    camera = scene.camera
    camera.location = center + Vector((distance, distance, distance * 0.70))
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.35
    scene.render.film_transparent = False
    scene.render.resolution_x = 384
    scene.render.resolution_y = 480
    scene.render.resolution_percentage = 100
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.media_type = "VIDEO"
    scene.render.image_settings.file_format = "FFMPEG"
    scene.render.ffmpeg.format = "MPEG4"
    scene.render.ffmpeg.codec = "H264"
    scene.render.ffmpeg.constant_rate_factor = "MEDIUM"
    scene.render.ffmpeg.audio_codec = "NONE"
    videos = {}
    for name in ACTION_ORDER:
        armature.animation_data.action = actions[name]
        scene.frame_start = 0
        scene.frame_end = CLIP_END_FRAMES[name] - 1
        output = qa / f"{name.lower()}.mp4"
        scene.render.filepath = str(output)
        bpy.ops.render.render(animation=True)
        videos[name] = str(output)
    target_objects = create_target_ruler()
    armature.animation_data.action = actions["Attack"]
    scene.frame_start = 0
    scene.frame_end = CLIP_END_FRAMES["Attack"] - 1
    target_video = qa / "attack-target.mp4"
    scene.render.filepath = str(target_video)
    bpy.ops.render.render(animation=True)
    videos["AttackTargetQA"] = str(target_video)
    remove_qa_objects(target_objects)
    videos["Walk3mpsSideQA"] = render_moving_walk(run_dir, armature, actions["Walk"], center, distance)
    if shield_material:
        set_shield_tint(shield_material, (1.0, 1.0, 1.0))
    armature.animation_data.action = actions["Idle"]
    scene.frame_start = 0
    scene.frame_end = CLIP_END_FRAMES["Idle"]
    scene.frame_set(0)
    return {"stills": stills, "videos": videos}


def render_attack_revision_evidence(run_dir, armature, actions):
    """Render only the bounded Attack marker revision evidence."""

    qa = run_dir / "qa"
    center, distance = configure_review_scene()
    shield_material = bpy.data.materials.get("TeamCloth_Shield")
    if shield_material:
        set_shield_tint(shield_material, (0.045, 0.10, 0.33))
    target_objects = create_target_ruler()
    armature.animation_data.action = actions["Attack"]
    contact_frame = round(ATTACK_CONTACT_S * FPS)
    bpy.context.scene.frame_set(contact_frame)
    contact_path = qa / f"attack-target-contact-{contact_frame:02d}.png"
    render_view(contact_path.stem, center + Vector((distance, distance, distance * 0.70)), center, 2.35, 480, 480, contact_path)
    scene = bpy.context.scene
    camera = scene.camera
    camera.location = center + Vector((distance, distance, distance * 0.70))
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.35
    scene.render.film_transparent = False
    scene.render.resolution_x = 384
    scene.render.resolution_y = 480
    scene.render.resolution_percentage = 100
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.media_type = "VIDEO"
    scene.render.image_settings.file_format = "FFMPEG"
    scene.render.ffmpeg.format = "MPEG4"
    scene.render.ffmpeg.codec = "H264"
    scene.render.ffmpeg.constant_rate_factor = "MEDIUM"
    scene.render.ffmpeg.audio_codec = "NONE"
    scene.frame_start = 0
    scene.frame_end = CLIP_END_FRAMES["Attack"] - 1
    target_video = qa / "attack-target.mp4"
    scene.render.filepath = str(target_video)
    bpy.ops.render.render(animation=True)
    remove_qa_objects(target_objects)
    if shield_material:
        set_shield_tint(shield_material, (1.0, 1.0, 1.0))
    armature.animation_data.action = actions["Idle"]
    scene.frame_set(0)
    return {
        "stills": {f"Attack:target-contact-{contact_frame}": str(contact_path)},
        "videos": {"AttackTargetQA": str(target_video)},
        "unchanged_clip_evidence": "../revision-v2/qa",
    }


def select_export(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def export_candidates(run_dir, armature):
    candidate = run_dir / "candidate"
    groups = {
        "lod0": [bpy.data.objects[name] for name in ("GuardBody_LOD0", "KingdomSteelSword_LOD0", "KingdomSunShield_LOD0")],
        "lod1": [bpy.data.objects[name] for name in ("GuardBody_LOD1", "KingdomSteelSword_LOD1", "KingdomSunShield_LOD1")],
    }
    results = {}
    for label, meshes in groups.items():
        for obj in groups["lod0"] + groups["lod1"]:
            obj.hide_render = obj not in meshes
        select_export([armature, *meshes])
        path = candidate / f"guard-original-motion-{label}.glb"
        bpy.ops.export_scene.gltf(
            filepath=str(path),
            export_format="GLB",
            use_selection=True,
            export_animations=True,
            export_animation_mode="ACTIONS",
            export_image_format="JPEG",
            export_jpeg_quality=90,
            export_skins=True,
            export_yup=True,
            export_def_bones=True,
        )
        results[label] = {"path": str(path), "bytes": path.stat().st_size, "sha256": sha256(path)}
    return results


def main():
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    attack_only = "--attack-only-evidence" in arguments
    arguments = [value for value in arguments if value != "--attack-only-evidence"]
    source, run_dir = [Path(value).resolve() for value in arguments]
    for folder in (run_dir / "candidate", run_dir / "qa"):
        folder.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(source))
    armature = bpy.data.objects[ARMATURE_NAME]
    actions = create_actions(armature)
    evidence = render_attack_revision_evidence(run_dir, armature, actions) if attack_only else render_evidence(run_dir, armature, actions)
    blend_path = run_dir / "candidate" / "guard-original-motion.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    exports = export_candidates(run_dir, armature)
    result = {
        "status": "candidate",
        "runtime_publish_allowed": False,
        "source": str(source),
        "source_sha256": sha256(source),
        "editable_source": {"path": str(blend_path), "bytes": blend_path.stat().st_size, "sha256": sha256(blend_path)},
        "exports": exports,
        "fps": FPS,
        "clips": {
            name: {
                "frame_start": 0,
                "frame_end": CLIP_END_FRAMES[name],
                "duration_s": CLIP_DURATIONS_S[name],
            }
            for name in ACTION_ORDER
        },
        "locomotion": {"speed_mps": JOG_SPEED_MPS, "stride_length_m": JOG_STRIDE_M, "cycle_s": JOG_CYCLE_S},
        "attack": {"contact_marker_s": ATTACK_CONTACT_S, "contact_frame": round(ATTACK_CONTACT_S * FPS)},
        "rig_method": "Per-frame bake from original procedural curves; measured-rest-axis rotations plus analytic sagittal two-link leg IK",
        "authorship": "All animation curves are original for this run; no downloaded character, motion capture, animation, or third-party motion asset was used",
        "mesh_scope": "Existing original prototype mesh is retained unchanged; this run does not solve its character-model visual-quality limitations",
        "evidence": evidence,
    }
    (run_dir / "qa" / "build-report.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8", newline="\n")
    print("ORIGINAL_GUARD_MOTION_BUILD=" + json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
