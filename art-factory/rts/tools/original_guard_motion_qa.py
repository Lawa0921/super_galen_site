"""Mechanical QA for the original guard motion candidate."""

import hashlib
import json
import math
import statistics
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
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
TARGET_PLANE_Y_M = 0.62
TARGET_MIN_Z_M = 0.62
TARGET_MAX_Z_M = 1.32
WALK_SWORD_CLEARANCE_M = 0.035
MESH_NAMES = (
    "GuardBody_LOD0",
    "GuardBody_LOD1",
    "KingdomSteelSword_LOD0",
    "KingdomSteelSword_LOD1",
    "KingdomSunShield_LOD0",
    "KingdomSunShield_LOD1",
)


def mesh_fingerprints():
    result = {}
    for name in MESH_NAMES:
        obj = bpy.data.objects[name]
        digest = hashlib.sha256()
        for vertex in obj.data.vertices:
            digest.update(struct.pack("<3f", *vertex.co))
            for group in sorted(vertex.groups, key=lambda item: item.group):
                digest.update(struct.pack("<If", group.group, group.weight))
        for polygon in obj.data.polygons:
            digest.update(struct.pack("<I", polygon.material_index))
            digest.update(struct.pack(f"<{len(polygon.vertices)}I", *polygon.vertices))
        result[name] = {
            "sha256": digest.hexdigest(),
            "vertices": len(obj.data.vertices),
            "triangles": sum(len(polygon.vertices) - 2 for polygon in obj.data.polygons),
        }
    return result


def pose_point(armature, bone_name, endpoint="tail"):
    pose = armature.pose.bones[bone_name]
    point = pose.tail if endpoint == "tail" else pose.head
    return armature.matrix_world @ point


def evaluated_vertex(obj, vertex_index):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    point = evaluated.matrix_world @ mesh.vertices[vertex_index].co
    evaluated.to_mesh_clear()
    return point


def evaluated_min_z(obj):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    minimum = min((evaluated.matrix_world @ vertex.co).z for vertex in mesh.vertices)
    evaluated.to_mesh_clear()
    return minimum


def material_vertex_indices(obj, material_name):
    material_index = next(index for index, material in enumerate(obj.data.materials) if material.name == material_name)
    return sorted({vertex for polygon in obj.data.polygons if polygon.material_index == material_index for vertex in polygon.vertices})


def evaluated_vertices(obj, indices=None):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    vertices = mesh.vertices if indices is None else (mesh.vertices[index] for index in indices)
    points = [evaluated.matrix_world @ vertex.co for vertex in vertices]
    evaluated.to_mesh_clear()
    return points


def material_plane_intersections(obj, material_name, plane_y):
    material_index = next(index for index, material in enumerate(obj.data.materials) if material.name == material_name)
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    points = []
    for polygon in mesh.polygons:
        if polygon.material_index != material_index:
            continue
        vertices = [evaluated.matrix_world @ mesh.vertices[index].co for index in polygon.vertices]
        for start, end in zip(vertices, vertices[1:] + vertices[:1]):
            start_distance = start.y - plane_y
            end_distance = end.y - plane_y
            if start_distance == 0.0:
                points.append(start)
            elif start_distance * end_distance < 0.0:
                amount = -start_distance / (end_distance - start_distance)
                points.append(start.lerp(end, amount))
    evaluated.to_mesh_clear()
    return points


def centroid(points):
    return sum(points, Vector()) / len(points)


def quaternion_distance_degrees(first, second):
    return math.degrees(first.rotation_difference(second).angle)


def contiguous_windows(frames):
    windows = []
    for frame in frames:
        if not windows or frame > windows[-1][-1] + 1:
            windows.append([frame])
        else:
            windows[-1].append(frame)
    return windows


def vector_stats(points):
    center = sum(points, Vector()) / len(points)
    distances = [(point - center).length for point in points]
    maximum_pair = max((a - b).length for a in points for b in points)
    return {
        "center": [round(value, 6) for value in center],
        "rms_m": round(math.sqrt(statistics.mean(value * value for value in distances)), 6),
        "max_from_center_m": round(max(distances), 6),
        "max_pairwise_slip_m": round(maximum_pair, 6),
    }


def action_durations(armature):
    result = {}
    for name, expected in CLIP_DURATIONS_S.items():
        action = bpy.data.actions.get(name)
        if action is None:
            raise AssertionError(f"Missing action: {name}")
        duration = (action.frame_range[1] - action.frame_range[0]) / FPS
        if abs(duration - expected) > 1e-6:
            raise AssertionError(f"{name} duration {duration} != {expected}")
        result[name] = {"frame_range": [round(value, 6) for value in action.frame_range], "duration_s": round(duration, 6)}
    armature.animation_data.action = bpy.data.actions["Idle"]
    return result


def walk_qa(armature, body, sword, shield):
    armature.animation_data.action = bpy.data.actions["Walk"]
    stance_points = {"L": [], "R": []}
    stance_heights = {"L": [], "R": []}
    ground = []
    sword_minimum = float("inf")
    spine_rotations = []
    shield_centers = []
    for frame in range(round(JOG_CYCLE_S * FPS)):
        bpy.context.scene.frame_set(frame)
        time_s = frame / FPS
        ground.append(evaluated_min_z(body))
        sword_minimum = min(sword_minimum, *(point.z for point in evaluated_vertices(sword)))
        spine_rotations.append(armature.pose.bones["SpineUpper"].rotation_quaternion.copy())
        shield_centers.append(centroid(evaluated_vertices(shield)))
        for side in ("L", "R"):
            sample = guarded_jog_foot(time_s, side)
            if sample.stance:
                toe = pose_point(armature, f"Foot_{side}")
                stance_heights[side].append(toe.z)
                stance_points[side].append(Vector((toe.x, toe.y + JOG_SPEED_MPS * time_s, toe.z)))
    feet = {}
    for side in ("L", "R"):
        stats = vector_stats(stance_points[side])
        stats["samples"] = len(stance_points[side])
        stats["max_ground_height_m"] = round(max(stance_heights[side]), 6)
        if stats["rms_m"] > 0.03 or stats["max_pairwise_slip_m"] > 0.06 or stats["max_ground_height_m"] > 0.02:
            raise AssertionError(f"Walk foot lock failed for {side}: {stats}")
        feet[side] = stats
    bpy.context.scene.frame_set(0)
    left_start = pose_point(armature, "Foot_L")
    bpy.context.scene.frame_set(round(JOG_CYCLE_S * FPS))
    left_end = pose_point(armature, "Foot_L")
    seam = (left_end - left_start).length
    if seam > 1e-5:
        raise AssertionError(f"Walk loop seam is {seam}")
    torso_arc = max(quaternion_distance_degrees(a, b) for a in spine_rotations for b in spine_rotations)
    shield_travel = max((a - b).length for a in shield_centers for b in shield_centers)
    if sword_minimum <= WALK_SWORD_CLEARANCE_M:
        raise AssertionError(f"Walk sword ground clearance failed: {sword_minimum}")
    if torso_arc < 8.0 or shield_travel < 0.045:
        raise AssertionError(f"Walk upper-body motion gate failed: torso={torso_arc}, shield={shield_travel}")
    return {
        "speed_mps": JOG_SPEED_MPS,
        "cycle_s": JOG_CYCLE_S,
        "stride_length_m": JOG_STRIDE_M,
        "feet": feet,
        "loop_seam_m": round(seam, 8),
        "body_min_z_range_m": [round(min(ground), 6), round(max(ground), 6)],
        "sword_min_ground_clearance_m": round(sword_minimum, 6),
        "spine_upper_motion_arc_deg": round(torso_arc, 6),
        "shield_centroid_travel_m": round(shield_travel, 6),
        "note": "Foot tail/toe world points are compensated by the runtime 3 m/s translation before slip is measured.",
    }


def attack_qa(armature, sword):
    armature.animation_data.action = bpy.data.actions["Attack"]
    foot_paths = {"L": [], "R": []}
    tip_index = min(range(len(sword.data.vertices)), key=lambda index: sword.data.vertices[index].co.z)
    tips = []
    valid_contact = []
    target_contact_heights = []
    blade_indices = material_vertex_indices(sword, "ForgedSteel")
    blade_centers = []
    for frame in range(round(CLIP_DURATIONS_S["Attack"] * FPS) + 1):
        bpy.context.scene.frame_set(frame)
        tips.append(evaluated_vertex(sword, tip_index))
        blade_points = evaluated_vertices(sword, blade_indices)
        blade_centers.append(centroid(blade_points))
        intersections = material_plane_intersections(sword, "ForgedSteel", TARGET_PLANE_Y_M)
        heights = [point.z for point in intersections if TARGET_MIN_Z_M <= point.z <= TARGET_MAX_Z_M]
        valid_contact.append(bool(heights))
        target_contact_heights.append(heights)
        for side in ("L", "R"):
            foot_paths[side].append(pose_point(armature, f"Foot_{side}"))
    foot_stats = {side: vector_stats(points) for side, points in foot_paths.items()}
    if any(stats["max_pairwise_slip_m"] > 0.06 for stats in foot_stats.values()):
        raise AssertionError(f"Attack planted-foot gate failed: {foot_stats}")
    contact_frame = round(ATTACK_CONTACT_S * FPS)
    blade_speeds = [0.0] * len(blade_centers)
    blade_forward_velocities = [0.0] * len(blade_centers)
    for frame in range(1, len(blade_centers) - 1):
        delta = blade_centers[frame + 1] - blade_centers[frame - 1]
        blade_speeds[frame] = delta.length / (2.0 / FPS)
        blade_forward_velocities[frame] = delta.y / (2.0 / FPS)
    entries = [
        frame for frame in range(1, len(valid_contact) - 1)
        if valid_contact[frame] and not valid_contact[frame - 1] and blade_forward_velocities[frame] >= 1.0
    ]
    exits = [
        frame for frame in range(1, len(valid_contact) - 1)
        if not valid_contact[frame] and valid_contact[frame - 1] and blade_forward_velocities[frame] <= -0.5
    ]
    if entries != [contact_frame] or len(exits) != 1 or exits[0] <= contact_frame:
        raise AssertionError(f"Attack directional crossing mismatch: marker={contact_frame}, entries={entries}, exits={exits}")
    if blade_speeds[contact_frame] < 3.0:
        raise AssertionError(f"Attack blade stalls at marker: {blade_speeds[contact_frame]} m/s")
    contact_speed = (tips[contact_frame + 1] - tips[contact_frame - 1]).length / (2.0 / FPS)
    speed_by_frame = {
        frame: (tips[frame + 1] - tips[frame - 1]).length / (2.0 / FPS)
        for frame in range(1, len(tips) - 1)
    }
    path_length = sum((b - a).length for a, b in zip(tips, tips[1:]))
    max_displacement = max((point - tips[0]).length for point in tips)
    # Contact is proven by the blade/target-plane intersection above. Tip
    # speed remains diagnostic because a hilt-led diagonal can legitimately
    # place the marker after peak tip velocity.
    if path_length < 1.0:
        fastest = sorted(speed_by_frame.items(), key=lambda item: item[1], reverse=True)[:8]
        raise AssertionError(f"Attack sword path too weak: speed={contact_speed}, path={path_length}, fastest={fastest}")
    return {
        "duration_s": CLIP_DURATIONS_S["Attack"],
        "contact_marker_s": ATTACK_CONTACT_S,
        "contact_frame": contact_frame,
        "target_plane": {
            "forward_y_m": TARGET_PLANE_Y_M,
            "height_range_m": [TARGET_MIN_Z_M, TARGET_MAX_Z_M],
            "first_forward_entry_frame": entries[0],
            "backward_exit_frame": exits[0],
            "marker_blade_centroid_speed_mps": round(blade_speeds[contact_frame], 6),
            "marker_blade_forward_velocity_mps": round(blade_forward_velocities[contact_frame], 6),
            "exit_blade_forward_velocity_mps": round(blade_forward_velocities[exits[0]], 6),
            "marker_contact_height_range_m": [
                round(min(target_contact_heights[contact_frame]), 6),
                round(max(target_contact_heights[contact_frame]), 6),
            ],
        },
        "sword_tip_contact_speed_mps": round(contact_speed, 6),
        "sword_tip_peak_speed_mps": round(max(speed_by_frame.values()), 6),
        "sword_tip_path_length_m": round(path_length, 6),
        "sword_tip_max_displacement_m": round(max_displacement, 6),
        "feet": foot_stats,
    }


def body_mechanics_qa(armature, body, sword, shield):
    idle = bpy.data.actions["Idle"]
    armature.animation_data.action = idle
    head_angles = []
    idle_root_x = []
    chest_rotations = []
    shield_centers = []
    head_rotations = []
    for frame in range(73):
        bpy.context.scene.frame_set(frame)
        head_angles.append(math.degrees(armature.pose.bones["Head"].rotation_quaternion.angle))
        idle_root_x.append((armature.matrix_world @ armature.pose.bones["Root"].head).x)
        chest_rotations.append(armature.pose.bones["SpineUpper"].rotation_quaternion.copy())
        shield_centers.append(centroid(evaluated_vertices(shield)))
        head_rotations.append(armature.pose.bones["Head"].rotation_quaternion.copy())
    idle_root_range = max(idle_root_x) - min(idle_root_x)
    chest_arc = max(quaternion_distance_degrees(a, b) for a in chest_rotations for b in chest_rotations)
    idle_shield_travel = max((a - b).length for a in shield_centers for b in shield_centers)
    gaze_pause = max(quaternion_distance_degrees(head_rotations[frame], head_rotations[frame + 1]) for frame in range(16, 22))
    if idle_root_range < 0.025 or chest_arc < 4.0 or idle_shield_travel < 0.025 or gaze_pause > 0.12:
        raise AssertionError(
            f"Idle readable-motion gate failed: root={idle_root_range}, chest={chest_arc}, "
            f"shield={idle_shield_travel}, gaze_pause={gaze_pause}"
        )
    armature.animation_data.action = bpy.data.actions["Hurt"]
    hurt_root = []
    for frame in range(16):
        bpy.context.scene.frame_set(frame)
        hurt_root.append([round(value, 6) for value in armature.pose.bones["Root"].location])
    armature.animation_data.action = bpy.data.actions["Death"]
    root_angles = []
    root_heights = []
    spine_angles = []
    foot_points = {"L": [], "R": []}
    for frame in range(49):
        bpy.context.scene.frame_set(frame)
        root_angles.append(math.degrees(armature.pose.bones["Root"].rotation_quaternion.angle))
        root_heights.append((armature.matrix_world @ armature.pose.bones["Root"].head).z)
        spine_angles.append(math.degrees(armature.pose.bones["SpineLower"].rotation_quaternion.angle))
        for side in ("L", "R"):
            foot_points[side].append(pose_point(armature, f"Foot_{side}", endpoint="head"))
    if max(root_angles) > 1e-4:
        raise AssertionError(f"Death uses whole-root rotation: {max(root_angles)} degrees")
    if root_heights[10] >= root_heights[0] or root_heights[20] >= root_heights[10] or root_heights[32] >= root_heights[20]:
        raise AssertionError(f"Death pelvis/root drop is not staged: {root_heights[0]}, {root_heights[10]}, {root_heights[20]}, {root_heights[32]}")
    if max(spine_angles) > 70:
        raise AssertionError(f"Death returns to a single lower-spine hinge: {max(spine_angles)}")
    body_points = evaluated_vertices(body)
    sword_points = evaluated_vertices(sword)
    shield_points = evaluated_vertices(shield)
    head = pose_point(armature, "Head", endpoint="head")
    neck = pose_point(armature, "Neck", endpoint="head")
    death_contact = {
        "body_min_z_m": min(point.z for point in body_points),
        "shield_min_z_m": min(point.z for point in shield_points),
        "sword_min_z_m": min(point.z for point in sword_points),
        "head_z_m": head.z,
        "sword_head_neck_clearance_m": min(min((point - head).length, (point - neck).length) for point in sword_points),
        "max_foot_reposition_m": max((point - points[0]).length for points in foot_points.values() for point in points),
    }
    death_checks = {
        "body_above_ground": death_contact["body_min_z_m"] >= -0.035,
        "shield_landed": -0.05 <= death_contact["shield_min_z_m"] <= 0.10,
        "sword_landed": -0.05 <= death_contact["sword_min_z_m"] <= 0.10,
        "head_landed": death_contact["head_z_m"] <= 0.42,
        "sword_clear_of_head_neck": death_contact["sword_head_neck_clearance_m"] >= 0.13,
        "feet_repositioned": death_contact["max_foot_reposition_m"] >= 0.12,
    }
    if not all(death_checks.values()):
        raise AssertionError(f"Death surface-contact gate failed: metrics={death_contact}, checks={death_checks}")
    return {
        "idle": {
            "max_head_rotation_excursion_deg": round(max(head_angles), 6),
            "root_weight_shift_range_m": round(idle_root_range, 6),
            "spine_upper_motion_arc_deg": round(chest_arc, 6),
            "shield_centroid_travel_m": round(idle_shield_travel, 6),
            "gaze_pause_max_deg_per_frame": round(gaze_pause, 6),
            "behavior": "head gaze plus shoulder/chest breathing",
            "blink_claimed": False,
            "facial_rig_present": False,
        },
        "hurt": {
            "duration_s": CLIP_DURATIONS_S["Hurt"],
            "max_root_local_displacement_m": round(max(Vector(value).length for value in hurt_root), 6),
            "behavior": "short backward/downward weight reaction and recovery",
        },
        "death": {
            "duration_s": CLIP_DURATIONS_S["Death"],
            "max_root_rotation_deg": round(max(root_angles), 8),
            "max_spine_lower_rotation_deg": round(max(spine_angles), 6),
            "stage_root_heights_m": {str(frame): round(root_heights[frame], 6) for frame in (0, 10, 20, 32, 48)},
            "surface_contact": {name: round(value, 6) for name, value in death_contact.items()},
            "surface_contact_checks": death_checks,
            "stages": ["knee buckle", "pelvis drop", "torso imbalance", "landing"],
        },
    }


def roundtrip(glb):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(glb))
    rigs = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(rigs) != 1:
        raise AssertionError(f"Expected one imported rig, found {len(rigs)}")
    scene_fps = bpy.context.scene.render.fps / bpy.context.scene.render.fps_base
    clips = {}
    for action in bpy.data.actions:
        duration = (action.frame_range[1] - action.frame_range[0]) / scene_fps
        clips[action.name] = round(duration, 6)
    for name, expected in CLIP_DURATIONS_S.items():
        if name not in clips or abs(clips[name] - expected) > 1e-4:
            raise AssertionError(f"Roundtrip duration mismatch for {name}: {clips.get(name)} != {expected}")
    return {
        "glb": str(glb),
        "bones": len(rigs[0].data.bones),
        "scene_fps": scene_fps,
        "clip_durations_s": clips,
    }


def main():
    source, candidate_blend, lod0_glb, lod1_glb, report_path = [Path(value).resolve() for value in sys.argv[sys.argv.index("--") + 1 :]]
    bpy.ops.wm.open_mainfile(filepath=str(source))
    source_meshes = mesh_fingerprints()
    bpy.ops.wm.open_mainfile(filepath=str(candidate_blend))
    candidate_meshes = mesh_fingerprints()
    if source_meshes != candidate_meshes:
        raise AssertionError("Mesh or skin-weight data changed in motion-only run")
    scene = bpy.context.scene
    if scene.render.fps != FPS or scene.render.fps_base != 1.0:
        raise AssertionError(f"Unexpected candidate FPS: {scene.render.fps}/{scene.render.fps_base}")
    armature = bpy.data.objects[ARMATURE_NAME]
    body = bpy.data.objects["GuardBody_LOD0"]
    sword = bpy.data.objects["KingdomSteelSword_LOD0"]
    shield = bpy.data.objects["KingdomSunShield_LOD0"]
    qa_objects = sorted(obj.name for obj in bpy.context.scene.objects if obj.name.startswith("QA_"))
    if qa_objects:
        raise AssertionError(f"QA-only ruler/grid leaked into candidate: {qa_objects}")
    report = {
        "status": "candidate_mechanical_qa_passed_visual_pending",
        "runtime_publish_allowed": False,
        "source_mesh_and_weights_unchanged": True,
        "mesh_fingerprints": candidate_meshes,
        "actions": action_durations(armature),
        "qa_only_objects_absent": True,
        "walk": walk_qa(armature, body, sword, shield),
        "attack": attack_qa(armature, sword),
        "body_mechanics": body_mechanics_qa(armature, body, sword, shield),
        "scope_limit": "This validates original animation mechanics only. It does not resolve or approve the existing prototype mesh's character-model quality.",
        "third_party_motion_or_character_assets_used": False,
    }
    report["roundtrip"] = [roundtrip(lod0_glb), roundtrip(lod1_glb)]
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n")
    print("ORIGINAL_GUARD_MOTION_QA=" + json.dumps(report, sort_keys=True))


if __name__ == "__main__":
    main()
