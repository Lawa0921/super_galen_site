"""Rebind the crossbow body to a shoulder-corrected 20-bone rig and rebake clips."""

from __future__ import annotations

import hashlib
import json
import math
import os
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector
from mathutils import kdtree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from commander_assembly_collision import exact_pairs
from crossbow_clearance import choose_clearance_candidate


CLIPS = ("Attack", "Death", "Hurt", "Idle", "Walk")
ARM_BONES = tuple(f"{bone}_{side}" for side in "LR" for bone in ("UpperArm", "Forearm", "Hand"))
TARGET_Z = 1.42


def evaluated_with_materials(obj):
    """Return posed world triangles plus the material id for each triangle."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    mesh.calc_loop_triangles()
    points = np.array([list(evaluated.matrix_world @ vertex.co) for vertex in mesh.vertices])
    faces = np.array([list(triangle.vertices) for triangle in mesh.loop_triangles], dtype=int)
    materials = np.array([
        int(getattr(triangle, "material_index", mesh.polygons[triangle.polygon_index].material_index))
        for triangle in mesh.loop_triangles
    ], dtype=int)
    evaluated.to_mesh_clear()
    from mathutils.bvhtree import BVHTree
    return points, faces, materials, BVHTree.FromPolygons(points.tolist(), faces.tolist(), all_triangles=True)


def evaluated_points(obj):
    """Return only posed world vertices for the cheap circle shortlist pass."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    points = np.array([list(evaluated.matrix_world @ vertex.co) for vertex in mesh.vertices])
    evaluated.to_mesh_clear()
    return points


def elbow_circle(shoulder: Vector, hand_head: Vector, old_elbow: Vector,
                 upper_length: float, forearm_length: float, samples: int = 24) -> list[Vector]:
    """Generate reachable elbow positions around the two-bone IK circle."""
    delta = hand_head - shoulder
    distance = max(abs(upper_length - forearm_length) + 1e-5,
                   min(delta.length, upper_length + forearm_length - 1e-5))
    if distance < 1e-6:
        return [shoulder + Vector((0.0, 0.0, -upper_length))]
    direction = delta.normalized()
    along = (upper_length * upper_length - forearm_length * forearm_length + distance * distance) / (2.0 * distance)
    height = math.sqrt(max(1e-10, upper_length * upper_length - along * along))
    center = shoulder + direction * along
    basis0 = old_elbow - center
    basis0 -= direction * basis0.dot(direction)
    if basis0.length < 1e-6:
        basis0 = Vector((1.0, 0.0, 0.0)) - direction * direction.x
    basis0.normalize()
    basis1 = direction.cross(basis0)
    basis1.normalize()
    return [center + height * (basis0 * math.cos(2.0 * math.pi * index / samples)
                               + basis1 * math.sin(2.0 * math.pi * index / samples))
            for index in range(samples)]


def dominant_group(vertex, obj):
    groups = list(vertex.groups)
    if not groups:
        return ""
    strongest = max(groups, key=lambda item: item.weight)
    return obj.vertex_groups[strongest.group].name


def side_clearance_score(body, weapon, side: str, exact: bool = True):
    """Score a posed arm against the weapon's side-specific collision parts."""
    relevant_materials = []
    for index, material in enumerate(weapon.data.materials):
        name = material.name.lower()
        if (side == "R" and ("oak" in name or "wood" in name)) or (side == "L" and ("hemp" in name or "string" in name)):
            relevant_materials.append(index)
    if not relevant_materials:
        relevant_materials = list(range(len(weapon.data.materials)))
    arm_vertex_ids = [
        vertex.index for vertex in body.data.vertices
        if dominant_group(vertex, body) == f"Forearm_{side}"
    ]
    if not arm_vertex_ids:
        return {"crossings": 0, "clearance_m": 1.0, "relevant_materials": relevant_materials}
    if not exact:
        body_points = evaluated_points(body)
        weapon_points = evaluated_points(weapon)
        weapon.data.calc_loop_triangles()
        relevant_triangles = [
            index for index, triangle in enumerate(weapon.data.loop_triangles)
            if int(weapon.data.polygons[triangle.polygon_index].material_index) in relevant_materials
        ]
        if not relevant_triangles:
            relevant_triangles = list(range(len(weapon.data.loop_triangles)))
        relevant_vertex_ids = sorted({
            int(vertex) for index in relevant_triangles
            for vertex in weapon.data.loop_triangles[index].vertices
        })
        if not relevant_vertex_ids:
            return {"crossings": 0, "clearance_m": 1.0, "relevant_materials": relevant_materials}
        arm_points = body_points[arm_vertex_ids]
        relevant_points = weapon_points[relevant_vertex_ids]
        nearest = kdtree.KDTree(len(relevant_points))
        for index, point in enumerate(relevant_points):
            nearest.insert(tuple(float(value) for value in point), index)
        nearest.balance()
        distances = np.asarray([nearest.find(tuple(float(value) for value in point))[2] for point in arm_points])
        return {
            "crossings": 0,
            "clearance_m": float(distances.min()),
            "relevant_materials": relevant_materials,
        }
    body_points, body_faces, _, body_tree = evaluated_with_materials(body)
    weapon_points, weapon_faces, weapon_materials, weapon_tree = evaluated_with_materials(weapon)
    relevant_triangles = np.flatnonzero(np.isin(weapon_materials, relevant_materials))
    if not len(relevant_triangles):
        relevant_triangles = np.arange(len(weapon_faces))
    relevant_vertex_ids = sorted({int(vertex) for triangle in weapon_faces[relevant_triangles] for vertex in triangle})
    if not relevant_vertex_ids:
        return {"crossings": 0, "clearance_m": 1.0, "relevant_materials": relevant_materials}
    arm_points = body_points[arm_vertex_ids]
    relevant_points = weapon_points[relevant_vertex_ids]
    nearest = kdtree.KDTree(len(relevant_points))
    for index, point in enumerate(relevant_points):
        nearest.insert(tuple(float(value) for value in point), index)
    nearest.balance()
    distances = np.asarray([nearest.find(tuple(float(value) for value in point))[2] for point in arm_points])
    crossings = 0
    if exact:
        candidate_pairs = body_tree.overlap(weapon_tree)
        hits = exact_pairs(body_points[body_faces], weapon_points[weapon_faces], candidate_pairs)
        arm_vertex_set = set(arm_vertex_ids)
        arm_triangles = {
            triangle for triangle, vertices in enumerate(body_faces)
            if any(int(vertex) in arm_vertex_set for vertex in vertices)
        }
        relevant_set = set(int(value) for value in relevant_triangles)
        crossings = sum(1 for body_triangle, weapon_triangle in hits
                        if int(body_triangle) in arm_triangles and int(weapon_triangle) in relevant_set)
    return {
        "crossings": int(crossings),
        "clearance_m": float(distances.min()),
        "relevant_materials": relevant_materials,
    }


def set_action(rig, name: str) -> None:
    action = bpy.data.actions[name]
    rig.animation_data_create()
    rig.animation_data.action = action
    slots = getattr(action, "slots", None)
    if slots:
        try:
            rig.animation_data.action_slot = slots[0]
        except Exception:
            pass


def clear_arm_curves(action) -> None:
    for layer in action.layers:
        for strip in layer.strips:
            for slot in action.slots:
                bag = strip.channelbag(slot)
                if not bag:
                    continue
                for curve in list(bag.fcurves):
                    if any(f'"{bone}"' in curve.data_path for bone in ARM_BONES):
                        bag.fcurves.remove(curve)


def matrix_translation(matrix: Matrix) -> Vector:
    return Vector((matrix[0][3], matrix[1][3], matrix[2][3]))


def env_vector(prefix: str, default: tuple[float, float, float]) -> Vector:
    """Read a three-component vector without hiding its authored coordinate frame."""
    return Vector(tuple(float(os.environ.get(f"{prefix}_{axis}", str(value)))
                    for axis, value in zip("XYZ", default)))


def contact_to_hand_tail(contact_world: Vector, hand_rotation: Matrix,
                         hand_tail_local: Vector, grip_anchor_local: Vector) -> Vector:
    """Convert a grip/contact point into the actual Hand bone tail target.

    The gauntlet build defines its ``grip`` at an interior palm anchor, while
    the IK target is the Hand bone tail.  Treating those as the same point
    leaves the whole hand one bone length away from the weapon and makes the
    two-bone elbow solve silently clamp.  Keeping both points in Hand local
    space makes the conversion explicit and preserves the authored hand
    orientation.
    """
    return contact_world + hand_rotation @ (hand_tail_local - grip_anchor_local)


def hand_head_from_tail(tail_world: Vector, hand_rotation: Matrix,
                        hand_tail_local: Vector) -> Vector:
    """Return the wrist/head position corresponding to a Hand tail target."""
    return tail_world - hand_rotation @ hand_tail_local


def derive_weapon_contact_local(rig) -> Vector:
    """Return the authored front-stock contact vertex in Hand_R local space.

    Editing UpperArm.head changes child rest matrices.  Therefore a contact
    point measured before the shoulder repair is no longer a valid bind-space
    anchor.  The oak vertex is stable across both LOD meshes; converting it
    through the repaired Hand_R rest matrix keeps the weapon and hand in the
    same runtime skin space.
    """
    weapon = bpy.data.objects.get("ProceduralCrossbow_LOD0")
    if weapon is None:
        raise RuntimeError("crossbow weapon LOD0 is required for contact anchor")
    vertex_index = int(os.environ.get("CROSSBOW_LEFT_CONTACT_VERTEX", "60"))
    if vertex_index < 0 or vertex_index >= len(weapon.data.vertices):
        raise ValueError(f"invalid CROSSBOW_LEFT_CONTACT_VERTEX={vertex_index}")
    hand = rig.pose.bones["Hand_R"]
    point_world = weapon.matrix_world @ weapon.data.vertices[vertex_index].co
    return hand.bone.matrix_local.inverted() @ rig.matrix_world.inverted() @ point_world


def mirror_target_orientation(matrix: Matrix) -> Matrix:
    """Mirror a hand target's orientation across the character sagittal plane.

    The source left hand keeps a reaching rotation from the old cross-body pose.
    The crossbow support hand needs the right-hand grip orientation mirrored
    across X while retaining the separately authored support-hand position.
    Applying the reflection on both sides of the rotation preserves a proper
    (determinant +1) basis instead of flipping the target or the mesh.
    """
    reflection = Matrix.Diagonal((-1.0, 1.0, 1.0, 1.0))
    mirrored = reflection @ matrix @ reflection
    mirrored.translation = matrix.translation.copy()
    return mirrored


def capture_targets(rig) -> dict:
    targets = {}
    for clip in CLIPS:
        set_action(rig, clip)
        action = bpy.data.actions[clip]
        frames = range(int(action.frame_range[0]), int(action.frame_range[1]) + 1)
        targets[clip] = {}
        for frame in frames:
            bpy.context.scene.frame_set(frame)
            bpy.context.view_layer.update()
            targets[clip][frame] = {}
            for side in ("R", "L"):
                hand = rig.pose.bones[f"Hand_{side}"]
                forearm = rig.pose.bones[f"Forearm_{side}"]
                hand_world = rig.matrix_world @ hand.matrix
                tail_world = hand_world @ Matrix.Translation((0, hand.length, 0))
                targets[clip][frame][side] = {
                    "hand_matrix": hand_world.copy(),
                    "target_matrix": tail_world,
                    "hand_head": matrix_translation(hand_world),
                    "old_elbow": rig.matrix_world @ forearm.head,
                }
    return targets


def edit_rest_skeleton(rig) -> dict:
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    report = {}
    for side in "LR":
        shoulder = rig.data.edit_bones[f"Shoulder_{side}"]
        upper = rig.data.edit_bones[f"UpperArm_{side}"]
        sign = -1.0 if side == "L" else 1.0
        shoulder.tail = Vector((sign * 0.272429, 0.0, TARGET_Z))
        upper.head = shoulder.tail
        report[side] = {
            "shoulder_tail": [float(value) for value in shoulder.tail],
            "upperarm_head": [float(value) for value in upper.head],
            "upperarm_tail": [float(value) for value in upper.tail],
        }
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.object.mode_set(mode="OBJECT")
    return report


def reweight_body(rig) -> list[dict]:
    """Move the shoulder/upper-arm weight boundary to the new shoulder plane."""
    rows = []
    if os.environ.get("CROSSBOW_SKIP_REWEIGHT") == "1":
        return rows
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not obj.name.startswith("crossbowOriginalBody_"):
            continue
        groups = {group.name: group.index for group in obj.vertex_groups}
        for side in "LR":
            shoulder_index = groups.get(f"Shoulder_{side}")
            upper_index = groups.get(f"UpperArm_{side}")
            if shoulder_index is None or upper_index is None:
                continue
            changed = 0
            for vertex in obj.data.vertices:
                weights = {item.group: item.weight for item in vertex.groups}
                shoulder_weight = weights.get(shoulder_index, 0.0)
                upper_weight = weights.get(upper_index, 0.0)
                total = shoulder_weight + upper_weight
                if total <= 1e-6:
                    continue
                # Preserve the existing shoulder-to-arm gradient, but put the
                # elbow-facing part below the new 1.42 m shoulder tail on UpperArm.
                t = max(0.0, min(1.0, (float(vertex.co.z) - 1.30) / 0.14))
                new_shoulder = total * t
                new_upper = total - new_shoulder
                if abs(new_shoulder - shoulder_weight) > 1e-5 or abs(new_upper - upper_weight) > 1e-5:
                    obj.vertex_groups[shoulder_index].add([vertex.index], new_shoulder, "REPLACE")
                    obj.vertex_groups[upper_index].add([vertex.index], new_upper, "REPLACE")
                    changed += 1
            rows.append({"object": obj.name, "side": side, "changed_vertices": changed,
                         "boundary_z_m": TARGET_Z})
    return rows


def repair_degenerate_uvs() -> list[dict]:
    """Repair only face-loop UVs whose existing mapping has zero area.

    The source keeps most generated UVs intact, but the steel cap rings in
    both LODs were authored with every loop on U=0.5.  A local planar
    projection gives those cap faces usable texel area without remapping the
    rest of the approved material layout.  The same path handles isolated
    body triangles whose three UVs were accidentally identical.
    """
    repaired = []
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not obj.data.uv_layers.active:
            continue
        mesh = obj.data
        uv_layer = mesh.uv_layers.active.data
        for poly in mesh.polygons:
            if len(poly.loop_indices) != 3:
                continue
            loops = list(poly.loop_indices)
            old = [uv_layer[loop].uv.copy() for loop in loops]
            uv_area = abs((old[1].x - old[0].x) * (old[2].y - old[0].y)
                          - (old[1].y - old[0].y) * (old[2].x - old[0].x))
            if uv_area > 1e-10:
                continue
            points = [mesh.vertices[mesh.loops[loop].vertex_index].co.copy() for loop in loops]
            spans = [max(point[axis] for point in points) - min(point[axis] for point in points)
                     for axis in range(3)]
            # Project onto the two widest local axes; the narrowest one is
            # the face normal for the cap rings, and this remains stable for
            # the small isolated body triangle.
            axes = sorted(range(3), key=lambda axis: spans[axis], reverse=True)[:2]
            # A radial cap triangle has one center vertex and two rim
            # vertices.  Find the center as the vertex opposite the longest
            # edge instead of using the face bounding-box midpoint (a wedge
            # does not contain the cap's full bounding box).
            center_index = max(
                range(3),
                key=lambda index: sum((points[index] - points[other]).length
                                      for other in range(3) if other != index),
            )
            center = points[center_index]
            span0 = max(max(abs(point[axes[0]] - center[axes[0]]) for point in points), 1e-7)
            span1 = max(max(abs(point[axes[1]] - center[axes[1]]) for point in points), 1e-7)
            new = []
            for point_index, (loop, point) in enumerate(zip(loops, points)):
                # Keep the projection inside the normal 0..1 range while
                # retaining a nonzero triangle area for textured shading.
                if point_index == center_index:
                    u = v = 0.5
                else:
                    u = max(0.001, min(0.999, 0.5 + 0.45 * (point[axes[0]] - center[axes[0]]) / span0))
                    v = max(0.001, min(0.999, 0.5 + 0.45 * (point[axes[1]] - center[axes[1]]) / span1))
                uv_layer[loop].uv = (u, v)
                new.append([float(u), float(v)])
            repaired.append({"object": obj.name, "mesh": mesh.name,
                             "polygon": int(poly.index),
                             "material_index": int(poly.material_index),
                             "old_uv": [[float(value) for value in uv] for uv in old],
                             "new_uv": new})
    return repaired


def desired_elbow(shoulder: Vector, wrist: Vector, old_elbow: Vector,
                  upper_length: float, forearm_length: float) -> Vector:
    delta = wrist - shoulder
    distance = delta.length
    if distance < 1e-6:
        return shoulder + Vector((0.0, 0.0, -upper_length))
    direction = delta.normalized()
    # Keep the target reachable without silently stretching the arm.
    distance = min(max(distance, abs(upper_length - forearm_length) + 1e-5),
                   upper_length + forearm_length - 1e-5)
    wrist = shoulder + direction * distance
    along = (upper_length * upper_length - forearm_length * forearm_length + distance * distance) / (2.0 * distance)
    height = math.sqrt(max(1e-10, upper_length * upper_length - along * along))
    center = shoulder + direction * along
    perpendicular = old_elbow - center
    perpendicular -= direction * perpendicular.dot(direction)
    if perpendicular.length < 1e-6:
        perpendicular = Vector((1.0, 0.0, 0.0)) - direction * direction.x
    perpendicular.normalize()
    return center + perpendicular * height


def solve_clips(rig, targets: dict) -> dict:
    scene = bpy.context.scene
    derived_contact_local = derive_weapon_contact_local(rig)
    target_objects = {}
    pole_objects = {}
    for side in "LR":
        target = bpy.data.objects.new(f"CrossbowRetargetTarget_{side}", None)
        pole = bpy.data.objects.new(f"CrossbowRetargetPole_{side}", None)
        scene.collection.objects.link(target)
        scene.collection.objects.link(pole)
        target_objects[side] = target
        pole_objects[side] = pole
    constraints = []
    for side in "LR":
        hand = rig.pose.bones[f"Hand_{side}"]
        constraint = hand.constraints.new("IK")
        constraint.name = f"CrossbowRetargetIK_{side}"
        constraint.target = target_objects[side]
        constraint.pole_target = pole_objects[side]
        constraint.chain_count = int(os.environ.get("CROSSBOW_IK_CHAIN_COUNT", "3"))
        constraint.use_rotation = True
        constraint.use_stretch = False
        constraint.iterations = 800
        # Blender's pole frame is opposite the analytic shoulder-to-elbow
        # reference used above; pi selects the intended side-and-down bend.
        constraint.pole_angle = float(os.environ.get(
            f"CROSSBOW_POLE_ANGLE_{side}",
            os.environ.get("CROSSBOW_POLE_ANGLE", str(math.pi)),
        ))
        constraints.append((hand, constraint))
    constraints_by_side = {hand.name.rsplit("_", 1)[-1]: constraint for hand, constraint in constraints}
    collision_aware_pole = os.environ.get("CROSSBOW_COLLISION_AWARE_POLE", "1") == "1"
    pole_samples = int(os.environ.get("CROSSBOW_POLE_SAMPLES", "24"))
    pole_exact_shortlist = max(1, int(os.environ.get("CROSSBOW_POLE_EXACT_SHORTLIST", "4")))
    pole_safety_clearance = float(os.environ.get("CROSSBOW_POLE_SAFETY_CLEARANCE_M", "0.006"))
    pole_angle_sweep = os.environ.get("CROSSBOW_POLE_ANGLE_SWEEP", "0") == "1"
    collision_bodies = {
        lod: bpy.data.objects.get(f"crossbowOriginalBody_LOD{lod}")
        for lod in (0, 1)
    }
    collision_weapons = {
        lod: bpy.data.objects.get(f"ProceduralCrossbow_LOD{lod}")
        for lod in (0, 1)
    }

    rows = {}
    solved_clips = {}
    support_orientation_rel = None
    clip_filter = os.environ.get("CROSSBOW_ONLY_CLIP", "").strip()
    active_clips = tuple(clip for clip in CLIPS if not clip_filter or clip == clip_filter)
    frame_filter = os.environ.get("CROSSBOW_ONLY_FRAME", "").strip()
    progress_path = os.environ.get("CROSSBOW_PROGRESS_PATH", "").strip()
    for clip in active_clips:
        set_action(rig, clip)
        action = bpy.data.actions[clip]
        frames = list(range(int(action.frame_range[0]), int(action.frame_range[1]) + 1))
        if frame_filter:
            frames = [int(frame_filter)]
        solved = {}
        residual_max = 0.0
        residual_by_side = {"L": 0.0, "R": 0.0}
        pole_policy = {}
        for frame in frames:
            progress = f"solve clip={clip} frame={frame} samples={pole_samples}\n"
            print(progress, end="", flush=True)
            if progress_path:
                with open(progress_path, "a", encoding="utf-8") as stream:
                    stream.write(progress)
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            for constraint in constraints_by_side.values():
                constraint.mute = True
            # Solve the firing hand first.  The support hand's contact point
            # is expressed in the weapon's Hand_R frame, so it must see the
            # evaluated right-hand matrix from this same sample.
            for side in "RL":
                record = targets[clip][frame][side]
                target_matrix = record["target_matrix"].copy()
                target_matrix.translation += Vector((
                    float(os.environ.get("CROSSBOW_TARGET_OFFSET_X", "0")),
                    float(os.environ.get("CROSSBOW_TARGET_OFFSET_Y", "0")),
                    float(os.environ.get("CROSSBOW_TARGET_OFFSET_Z", "0")),
                ))
                if side == "R":
                    target_matrix.translation += Vector((
                        float(os.environ.get("CROSSBOW_RIGHT_TARGET_OFFSET_X", "0")),
                        float(os.environ.get("CROSSBOW_RIGHT_TARGET_OFFSET_Y", "0")),
                        float(os.environ.get("CROSSBOW_RIGHT_TARGET_OFFSET_Z", "0")),
                    ))
                    # Keep the rear-grip point fixed while allowing a small
                    # authored wrist rotation.  The source right wrist axis
                    # points steeply down, which sends the forearm through
                    # the stock before it reaches the grip.
                    for axis, key in (("X", "CROSSBOW_RIGHT_TARGET_ROT_X"),
                                      ("Y", "CROSSBOW_RIGHT_TARGET_ROT_Y"),
                                      ("Z", "CROSSBOW_RIGHT_TARGET_ROT_Z")):
                        angle = float(os.environ.get(key, "0"))
                        if abs(angle) > 1e-8:
                            target_matrix = target_matrix @ Matrix.Rotation(angle, 4, axis)
                if clip == "Death" and side == "R":
                    phase = (frame - frames[0]) / max(1.0, frames[-1] - frames[0])
                    release = max(0.0, min(1.0, (phase - 0.22) / 0.18))
                    release = release * release * (3.0 - 2.0 * release)
                    target_matrix.translation += release * Vector((
                        float(os.environ.get("CROSSBOW_DEATH_OFFSET_X", "0")),
                        float(os.environ.get("CROSSBOW_DEATH_OFFSET_Y", "0")),
                        float(os.environ.get("CROSSBOW_DEATH_OFFSET_Z", "0")),
                    ))
                if side == "L":
                    if os.environ.get("CROSSBOW_LEFT_TARGET_RELATIVE_TO_RIGHT", "0") == "1":
                        global_offset = Vector((
                            float(os.environ.get("CROSSBOW_TARGET_OFFSET_X", "0")),
                            float(os.environ.get("CROSSBOW_TARGET_OFFSET_Y", "0")),
                            float(os.environ.get("CROSSBOW_TARGET_OFFSET_Z", "0")),
                        ))
                        support_offset = Vector((
                            float(os.environ.get("CROSSBOW_LEFT_REL_X", "-0.285")),
                            float(os.environ.get("CROSSBOW_LEFT_REL_Y", "0.268")),
                            float(os.environ.get("CROSSBOW_LEFT_REL_Z", "-0.014")),
                        ))
                        actual_right_hand_world = None
                        if os.environ.get("CROSSBOW_LEFT_RELATIVE_USE_ACTUAL_RIGHT", "0") == "1":
                            # The exported weapon follows the evaluated Hand_R
                            # skin matrix.  Read that matrix after the right IK
                            # target has been configured, so support motion uses
                            # the same runtime transform instead of the source
                            # hand's pre-retarget translation.
                            scene.frame_set(frame)
                            bpy.context.view_layer.update()
                            right_hand = rig.pose.bones["Hand_R"]
                            actual_right_hand_world = rig.matrix_world @ right_hand.matrix
                            right_reference = (
                                actual_right_hand_world
                                @ Matrix.Translation((0, right_hand.length, 0))
                            )
                        else:
                            right_reference = targets[clip][frame]["R"]["target_matrix"].copy()
                            right_reference.translation += global_offset
                            right_reference.translation += Vector((
                                float(os.environ.get("CROSSBOW_RIGHT_TARGET_OFFSET_X", "0")),
                                float(os.environ.get("CROSSBOW_RIGHT_TARGET_OFFSET_Y", "0")),
                                float(os.environ.get("CROSSBOW_RIGHT_TARGET_OFFSET_Z", "0")),
                            ))
                        if os.environ.get("CROSSBOW_LEFT_ORIENTATION_RELATIVE_TO_RIGHT", "0") == "1":
                            if support_orientation_rel is None:
                                reference_clip = "Attack" if "Attack" in targets else clip
                                reference_frame = 16 if 16 in targets[reference_clip] else min(targets[reference_clip])
                                reference_left = targets[reference_clip][reference_frame]["L"]["target_matrix"].copy()
                                for axis, key in (("X", "CROSSBOW_LEFT_TARGET_ROT_X"),
                                                   ("Y", "CROSSBOW_LEFT_TARGET_ROT_Y"),
                                                   ("Z", "CROSSBOW_LEFT_TARGET_ROT_Z")):
                                    angle = float(os.environ.get(key, "0"))
                                    if abs(angle) > 1e-8:
                                        reference_left = reference_left @ Matrix.Rotation(angle, 4, axis)
                                reference_right = targets[reference_clip][reference_frame]["R"]["target_matrix"]
                                support_orientation_rel = (
                                    reference_right.to_3x3().inverted()
                                    @ reference_left.to_3x3()
                                )
                            right_rotation = (actual_right_hand_world.to_3x3()
                                               if actual_right_hand_world is not None
                                               else right_reference.to_3x3())
                            target_matrix = (right_rotation @ support_orientation_rel).to_4x4()
                            target_matrix.translation = right_reference.translation.copy()
                        if os.environ.get("CROSSBOW_LEFT_RELATIVE_LOCAL", "0") == "1":
                            if (os.environ.get("CROSSBOW_LEFT_USE_CONTACT_ANCHOR", "0") == "1"
                                    and actual_right_hand_world is not None):
                                contact_local = derived_contact_local.copy()
                                if os.environ.get("CROSSBOW_LEFT_CONTACT_LOCAL_OVERRIDE", "0") == "1":
                                    contact_local = env_vector(
                                        "CROSSBOW_LEFT_CONTACT_LOCAL",
                                        tuple(derived_contact_local),
                                    )
                                contact_world = actual_right_hand_world @ contact_local
                                hand = rig.pose.bones["Hand_L"]
                                grip_anchor = env_vector(
                                    "CROSSBOW_LEFT_GRIP_LOCAL",
                                    (-0.00246333, -0.03064327, 0.01332485),
                                )
                                contact_world = contact_world.copy()
                                if clip == "Death":
                                    phase = (frame - frames[0]) / max(1.0, frames[-1] - frames[0])
                                    release = max(0.0, min(1.0, (phase - 0.22) / 0.18))
                                    release = release * release * (3.0 - 2.0 * release)
                                    contact_world += release * env_vector(
                                        "CROSSBOW_DEATH_LEFT_RELEASE",
                                        (0.25, -0.05, 0.24),
                                    )
                                target_matrix.translation = contact_to_hand_tail(
                                    contact_world,
                                    target_matrix.to_3x3(),
                                    Vector((0.0, hand.length, 0.0)),
                                    grip_anchor,
                                )
                            else:
                                target_matrix.translation = right_reference @ support_offset
                        else:
                            target_matrix.translation = right_reference.translation + support_offset
                    else:
                        target_matrix.translation += Vector((
                            float(os.environ.get("CROSSBOW_LEFT_TARGET_X", "0")),
                            float(os.environ.get("CROSSBOW_LEFT_TARGET_Y", "0")),
                            float(os.environ.get("CROSSBOW_LEFT_TARGET_Z", "0")),
                        ))
                    orientation_blend = float(os.environ.get(
                        "CROSSBOW_MIRROR_LEFT_BLEND",
                        "1" if os.environ.get("CROSSBOW_MIRROR_LEFT_ORIENTATION", "0") == "1" else "0",
                    ))
                    if orientation_blend > 1e-6:
                        support_translation = target_matrix.translation.copy()
                        mirrored = mirror_target_orientation(targets[clip][frame]["R"]["target_matrix"])
                        left_rotation = target_matrix.to_quaternion()
                        mirrored_rotation = mirrored.to_quaternion()
                        target_matrix = left_rotation.slerp(
                            mirrored_rotation, max(0.0, min(1.0, orientation_blend))
                        ).to_matrix().to_4x4()
                        target_matrix.translation = support_translation
                    if os.environ.get("CROSSBOW_LEFT_ORIENTATION_RELATIVE_TO_RIGHT", "0") != "1":
                        for axis, key in (("X", "CROSSBOW_LEFT_TARGET_ROT_X"),
                                          ("Y", "CROSSBOW_LEFT_TARGET_ROT_Y"),
                                          ("Z", "CROSSBOW_LEFT_TARGET_ROT_Z")):
                            angle = float(os.environ.get(key, "0"))
                            if abs(angle) > 1e-8:
                                target_matrix = target_matrix @ Matrix.Rotation(angle, 4, axis)
                target_objects[side].matrix_world = target_matrix
                constraints_by_side[side].mute = False
                shoulder = rig.pose.bones[f"Shoulder_{side}"]
                upper = rig.pose.bones[f"UpperArm_{side}"]
                forearm = rig.pose.bones[f"Forearm_{side}"]
                hand_bone = rig.pose.bones[f"Hand_{side}"]
                shoulder_world = rig.matrix_world @ shoulder.head
                # The old elbow was captured from the short, low upper-arm
                # bind and sits in front of the weapon.  With the corrected
                # shoulder height, use a side-and-down pole reference so the
                # new two-bone solution keeps both forearms behind the stock
                # until the wrists turn around it.
                sign = -1.0 if side == "L" else 1.0
                pole_reference = shoulder_world + Vector((
                    sign * float(os.environ.get(f"CROSSBOW_{clip.upper()}_POLE_X_{side}", os.environ.get(f"CROSSBOW_POLE_X_{side}", os.environ.get("CROSSBOW_POLE_X", "0.25")))),
                    float(os.environ.get(f"CROSSBOW_{clip.upper()}_POLE_Y_{side}", os.environ.get(f"CROSSBOW_POLE_Y_{side}", os.environ.get("CROSSBOW_POLE_Y", "-0.10")))),
                    float(os.environ.get(f"CROSSBOW_{clip.upper()}_POLE_Z_{side}", os.environ.get(f"CROSSBOW_POLE_Z_{side}", os.environ.get("CROSSBOW_POLE_Z", "-0.25")))),
                ))
                if side == "R" and os.environ.get("CROSSBOW_RIGHT_ELBOW_TARGET_TAIL", "0") == "1":
                    # The firing hand target is still the Hand tail used by
                    # the authored weapon bind.  Keep its pole solve on that
                    # authored point while the support hand uses the
                    # grip-anchor-to-tail conversion above.
                    hand_head = target_matrix.translation
                else:
                    hand_head = hand_head_from_tail(
                        target_matrix.translation,
                        target_matrix.to_3x3(),
                        Vector((0.0, hand_bone.length, 0.0)),
                    )
                if collision_aware_pole:
                    previous_elbow = rig.pose.bones[f"Forearm_{side}"].head.copy()
                    candidates = []
                    for sample_index, candidate_elbow in enumerate(elbow_circle(
                            shoulder_world, hand_head, pole_reference,
                            upper.bone.length, forearm.bone.length, pole_samples)):
                        if pole_angle_sweep:
                            constraints_by_side[side].pole_angle = (
                                float(os.environ.get(
                                    f"CROSSBOW_POLE_ANGLE_{side}",
                                    os.environ.get("CROSSBOW_POLE_ANGLE", str(math.pi)),
                                ))
                                + 2.0 * math.pi * sample_index / max(1, pole_samples)
                            )
                        pole_objects[side].location = candidate_elbow
                        scene.frame_set(frame)
                        bpy.context.view_layer.update()
                        # Mesh deformation is the expensive part of the solve.  Use
                        # LOD0 nearest-point clearance to shortlist the safest arm
                        # circle points, then run exact triangle crossings on both
                        # LODs for only that shortlist.
                        score = side_clearance_score(
                            collision_bodies[0], collision_weapons[0], side, exact=False
                        )
                        candidates.append({
                            "sample_index": sample_index,
                            "elbow": candidate_elbow.copy(),
                            "actual_elbow": (rig.matrix_world @ rig.pose.bones[f"Forearm_{side}"].head).copy(),
                            "crossings": 0,
                            "clearance_m": score["clearance_m"],
                            "continuity_m": (candidate_elbow - previous_elbow).length,
                        })
                    shortlist = sorted(
                        candidates,
                        key=lambda item: (-item["clearance_m"], item["continuity_m"], item["sample_index"]),
                    )[:min(pole_exact_shortlist, len(candidates))]
                    for candidate in shortlist:
                        pole_objects[side].location = candidate["elbow"]
                        scene.frame_set(frame)
                        bpy.context.view_layer.update()
                        score_rows = [
                            side_clearance_score(collision_bodies[lod], collision_weapons[lod], side, exact=True)
                            for lod in (0, 1)
                            if collision_bodies[lod] is not None and collision_weapons[lod] is not None
                        ]
                        candidate["crossings"] = sum(row["crossings"] for row in score_rows)
                        candidate["clearance_m"] = min(
                            (row["clearance_m"] for row in score_rows),
                            default=candidate["clearance_m"],
                        )
                    selected = choose_clearance_candidate(
                        shortlist, safety_clearance_m=pole_safety_clearance
                    )
                    if pole_angle_sweep:
                        constraints_by_side[side].pole_angle = (
                            float(os.environ.get(
                                f"CROSSBOW_POLE_ANGLE_{side}",
                                os.environ.get("CROSSBOW_POLE_ANGLE", str(math.pi)),
                            ))
                            + 2.0 * math.pi * selected["sample_index"] / max(1, pole_samples)
                        )
                    pole_objects[side].location = selected["elbow"]
                    pole_policy.setdefault(frame, {})[side] = {
                        "sample_index": selected["sample_index"],
                        "elbow": [float(value) for value in selected["elbow"]],
                        "crossings": selected["crossings"],
                        "clearance_m": selected["clearance_m"],
                        "continuity_m": selected["continuity_m"],
                        "samples": pole_samples,
                        "exact_shortlist": pole_exact_shortlist,
                        "safety_clearance_m": pole_safety_clearance,
                        "candidate_scores": [
                            {
                                "sample_index": item["sample_index"],
                                "crossings": item["crossings"],
                                "clearance_m": item["clearance_m"],
                                "continuity_m": item["continuity_m"],
                                "actual_elbow": [float(value) for value in item["actual_elbow"]],
                            }
                            for item in sorted(shortlist, key=lambda value: value["sample_index"])
                        ],
                        "constraint_valid": bool(constraints_by_side[side].is_valid),
                        "constraint_influence": float(constraints_by_side[side].influence),
                        "target_world": [float(value) for value in target_objects[side].matrix_world.translation],
                        "hand_head_world": [float(value) for value in (rig.matrix_world @ rig.pose.bones[f"Hand_{side}"].head)],
                        "hand_tail_world": [float(value) for value in (rig.matrix_world @ rig.pose.bones[f"Hand_{side}"].tail)],
                    }
                else:
                    elbow = desired_elbow(shoulder_world, hand_head, pole_reference,
                                          upper.bone.length, forearm.bone.length)
                    pole_objects[side].location = elbow
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            solved[frame] = {bone: rig.pose.bones[bone].matrix.copy() for bone in ARM_BONES}
            for side in "LR":
                hand = rig.pose.bones[f"Hand_{side}"]
                wanted = target_objects[side].matrix_world.translation
                actual = rig.matrix_world @ hand.tail
                residual = (actual - wanted).length
                residual_max = max(residual_max, residual)
                residual_by_side[side] = max(residual_by_side[side], residual)
        rows[clip] = {"frames": len(frames), "max_hand_tail_residual_m": residual_max,
                      "max_hand_tail_residual_m_by_side": residual_by_side,
                      "collision_aware_pole": collision_aware_pole,
                      "pole_samples": pole_samples if collision_aware_pole else 0,
                      "pole_exact_shortlist": pole_exact_shortlist if collision_aware_pole else 0,
                      "pole_safety_clearance_m": pole_safety_clearance if collision_aware_pole else 0.0,
                      "pole_policy": pole_policy}
        solved_clips[clip] = (action, frames, solved)

    # IK constraints contribute to PoseBone.matrix.  Bake only after removing
    # them; keying while IK is still active stores the pre-constraint basis,
    # which evaluates to a different hand pose after the constraint is gone.
    for hand, constraint in constraints:
        hand.constraints.remove(constraint)
    for side in "LR":
        bpy.data.objects.remove(target_objects[side], do_unlink=True)
        bpy.data.objects.remove(pole_objects[side], do_unlink=True)
    for clip, (action, frames, solved) in solved_clips.items():
        clear_arm_curves(action)
        set_action(rig, clip)
        for frame in frames:
            scene.frame_set(frame)
            for bone_name in ARM_BONES:
                pose_bone = rig.pose.bones[bone_name]
                pose_bone.matrix = solved[frame][bone_name]
                bpy.context.view_layer.update()
                pose_bone.keyframe_insert("location", frame=frame)
                pose_bone.keyframe_insert("rotation_quaternion", frame=frame)
                pose_bone.keyframe_insert("scale", frame=frame)
    set_action(rig, "Idle")
    scene.frame_set(0)
    bpy.context.view_layer.update()
    return rows


def select_lod(rig, lod: int) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    rig.hide_set(False)
    rig.select_set(True)
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        if obj.name.endswith(f"LOD{lod}"):
            obj.hide_set(False)
            obj.select_set(True)
        else:
            obj.hide_set(True)


def main() -> None:
    run = Path(os.environ["CROSSBOW_RUN"]).resolve()
    source = run / "raw" / "source" / "crossbow-assembly.blend"
    bpy.ops.wm.open_mainfile(filepath=str(source))
    rig = next(obj for obj in bpy.data.objects if obj.type == "ARMATURE")
    targets = capture_targets(rig)
    skeleton = edit_rest_skeleton(rig)
    reweight = reweight_body(rig)
    uv_repairs = repair_degenerate_uvs()
    animation = solve_clips(rig, targets)
    output_blend = run / "raw" / "repaired" / "crossbow-assembly.blend"
    output_blend.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_blend))
    outputs = []
    for lod in (0, 1):
        select_lod(rig, lod)
        exported = run / "raw" / "repaired" / f"crossbow-edited-lod{lod}.glb"
        bpy.context.view_layer.objects.active = rig
        bpy.ops.export_scene.gltf(
            filepath=str(exported), export_format="GLB", use_selection=True,
            export_animations=True, export_animation_mode="ACTIONS", export_nla_strips=False,
            export_force_sampling=True, export_optimize_animation_size=False, export_skins=True,
            export_extras=True, export_yup=True, export_tangents=True,
        )
        outputs.append({"lod": lod, "path": str(exported), "sha256": hashlib.sha256(exported.read_bytes()).hexdigest(),
                        "bytes": exported.stat().st_size})
    report = {"source": str(source), "repaired_source": str(output_blend), "skeleton": skeleton,
              "reweight": reweight, "uv_repairs": uv_repairs, "animation": animation, "pose_policy": {
                  "base_pole": [os.environ.get("CROSSBOW_POLE_X", "0.25"), os.environ.get("CROSSBOW_POLE_Y", "-0.10"), os.environ.get("CROSSBOW_POLE_Z", "-0.25")],
                  "right_attack_pole": [os.environ.get("CROSSBOW_POLE_X_R", "0.25"), os.environ.get("CROSSBOW_POLE_Y_R", "-0.10"), os.environ.get("CROSSBOW_POLE_Z_R", "-0.25")],
                  "right_target_rotation_rad": [os.environ.get("CROSSBOW_RIGHT_TARGET_ROT_X", "0"), os.environ.get("CROSSBOW_RIGHT_TARGET_ROT_Y", "0"), os.environ.get("CROSSBOW_RIGHT_TARGET_ROT_Z", "0")],
                  "right_target_offset": [os.environ.get("CROSSBOW_RIGHT_TARGET_OFFSET_X", "0"), os.environ.get("CROSSBOW_RIGHT_TARGET_OFFSET_Y", "0"), os.environ.get("CROSSBOW_RIGHT_TARGET_OFFSET_Z", "0")],
                  "left_target_offset": [os.environ.get("CROSSBOW_LEFT_TARGET_X", "0"), os.environ.get("CROSSBOW_LEFT_TARGET_Y", "0"), os.environ.get("CROSSBOW_LEFT_TARGET_Z", "0")],
                  "mirror_left_orientation": os.environ.get("CROSSBOW_MIRROR_LEFT_ORIENTATION", "0") == "1",
                  "mirror_left_blend": os.environ.get("CROSSBOW_MIRROR_LEFT_BLEND", "1" if os.environ.get("CROSSBOW_MIRROR_LEFT_ORIENTATION", "0") == "1" else "0"),
                  "left_target_rotation_rad": [os.environ.get("CROSSBOW_LEFT_TARGET_ROT_X", "0"), os.environ.get("CROSSBOW_LEFT_TARGET_ROT_Y", "0"), os.environ.get("CROSSBOW_LEFT_TARGET_ROT_Z", "0")],
                  "left_target_relative_to_right": os.environ.get("CROSSBOW_LEFT_TARGET_RELATIVE_TO_RIGHT", "0") == "1",
                  "left_relative_offset": [os.environ.get("CROSSBOW_LEFT_REL_X", "-0.285"), os.environ.get("CROSSBOW_LEFT_REL_Y", "0.268"), os.environ.get("CROSSBOW_LEFT_REL_Z", "-0.014")],
                   "left_relative_local": os.environ.get("CROSSBOW_LEFT_RELATIVE_LOCAL", "0") == "1",
                   "left_use_contact_anchor": os.environ.get("CROSSBOW_LEFT_USE_CONTACT_ANCHOR", "0") == "1",
                   "left_contact_local": [float(value) for value in derive_weapon_contact_local(rig)],
                   "left_grip_anchor_local": [os.environ.get(f"CROSSBOW_LEFT_GRIP_LOCAL_{axis}", str(value)) for axis, value in zip("XYZ", (-0.00246333, -0.03064327, 0.01332485))],
                  "left_orientation_relative_to_right": os.environ.get("CROSSBOW_LEFT_ORIENTATION_RELATIVE_TO_RIGHT", "0") == "1",
                  "target_offset": [os.environ.get("CROSSBOW_TARGET_OFFSET_X", "0"), os.environ.get("CROSSBOW_TARGET_OFFSET_Y", "0"), os.environ.get("CROSSBOW_TARGET_OFFSET_Z", "0")],
                  "death_right_pole": [os.environ.get("CROSSBOW_DEATH_POLE_X_R", os.environ.get("CROSSBOW_POLE_X_R", "0.25")), os.environ.get("CROSSBOW_DEATH_POLE_Y_R", os.environ.get("CROSSBOW_POLE_Y_R", "-0.10")), os.environ.get("CROSSBOW_DEATH_POLE_Z_R", os.environ.get("CROSSBOW_POLE_Z_R", "-0.25"))],
                   "death_release_offset": [os.environ.get("CROSSBOW_DEATH_OFFSET_X", "0"), os.environ.get("CROSSBOW_DEATH_OFFSET_Y", "0"), os.environ.get("CROSSBOW_DEATH_OFFSET_Z", "0")],
                   "death_left_release_offset": [os.environ.get(f"CROSSBOW_DEATH_LEFT_RELEASE_{axis}", str(value)) for axis, value in zip("XYZ", (0.25, -0.05, 0.24))],
              }, "outputs": outputs,
              "runtime_publish_allowed": False}
    qa = run / "qa" / "crossbow-rig-rebuild.json"
    qa.parent.mkdir(parents=True, exist_ok=True)
    qa.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
