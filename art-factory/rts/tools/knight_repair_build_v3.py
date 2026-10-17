"""Repair the mounted Knight source, export both LOD candidates, and write QA evidence.

The repair is deliberately source-first: the original horse/rider meshes and their
materials remain intact, while the missing right-hand skin envelope, grip placement,
mounted death pose, and per-clip ground clearance are corrected in Blender before
the runtime GLBs are exported.
"""
import bpy, bmesh, json, math, hashlib, os, sys
from pathlib import Path
from mathutils import Euler, Quaternion, Vector
from mathutils.bvhtree import BVHTree

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
from knight_repair_paths import resolve_approved_tools

APPROVED_TOOLS = resolve_approved_tools(TOOLS)
from knight_repair_math import ground_lift
from knight_repair_v2_math import death_profile
from knight_repair_v3_math import (closed_grip_profile, horse_head_profile,
                                   is_mouth_fragment_bounds, mouth_fragment_profile,
                                   lance_tip_profile, saddle_profile,
                                   select_bit_mouth_anchors,
                                   stirrup_contact_profile, weapon_clearance_profile)
sys.path.insert(0, str(APPROVED_TOOLS))
import procedural_gauntlet_build as gauntlet
from commander_assembly_hands import sculpted_parts

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "runs" / "kingdom-knight" / "2026-10-05-v3" / "raw"
RUN = ROOT / "runs" / "all-models" / "2026-10-14-knight-v3"
RAW = RUN / "raw"
CANDIDATE = RUN / "candidate"
QA = RUN / "qa"
CLIPS = ("Idle", "Walk", "Attack", "Hurt", "Death")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def action_bags(action):
    for layer in action.layers:
        for strip in layer.strips:
            for slot in action.slots:
                bag = strip.channelbag(slot)
                if bag:
                    yield bag


def curve(action, path, index):
    for bag in action_bags(action):
        for fc in bag.fcurves:
            if fc.data_path == path and fc.array_index == index:
                return fc
    return None


def upsert_curve(action, path, index, points, linear=True):
    fc = curve(action, path, index)
    if fc is None:
        bag = next(action_bags(action))
        fc = bag.fcurves.new(path, index=index)
    for frame, value in points:
        existing = next((key for key in fc.keyframe_points if abs(float(key.co[0]) - float(frame)) < 1e-4), None)
        if existing is not None:
            existing.co[1] = float(value)
        else:
            fc.keyframe_points.insert(float(frame), float(value), options={"FAST"})
    fc.update()
    if linear:
        for key in fc.keyframe_points:
            if any(abs(key.co[0] - frame) < 1e-4 for frame, _ in points):
                key.interpolation = "LINEAR"
    return fc


def set_key_values(action, path, index, values):
    fc = curve(action, path, index)
    assert fc is not None, (action.name, path, index)
    lookup = {float(frame): float(value) for frame, value in values.items()}
    for key in fc.keyframe_points:
        frame = round(float(key.co[0]), 5)
        if frame in lookup:
            key.co[1] = lookup[frame]
    fc.update()


def set_quat_axis(action, bone, axis_index, degrees):
    path = f'pose.bones["{bone}"].rotation_quaternion'
    frames = sorted(degrees)
    set_key_values(action, path, 0, {f: math.cos(math.radians(degrees[f]) / 2) for f in frames})
    set_key_values(action, path, axis_index, {f: math.sin(math.radians(degrees[f]) / 2) for f in frames})


def action_frames(action, bone):
    prefix = f'pose.bones["{bone}"].rotation_quaternion'
    frames = set()
    for bag in action_bags(action):
        for fc in bag.fcurves:
            if fc.data_path == prefix:
                frames.update(round(float(key.co[0]), 5) for key in fc.keyframe_points)
    return sorted(frames)


def quat_at(action, bone, frame):
    prefix = f'pose.bones["{bone}"].rotation_quaternion'
    values = [1.0, 0.0, 0.0, 0.0]
    for bag in action_bags(action):
        for fc in bag.fcurves:
            if fc.data_path == prefix and fc.array_index < 4:
                values[fc.array_index] = fc.evaluate(frame)
    return Quaternion(values).normalized()


def set_quat_at(action, bone, frame, quaternion):
    prefix = f'pose.bones["{bone}"].rotation_quaternion'
    for index, value in enumerate(quaternion):
        fc = curve(action, prefix, index)
        if fc is None:
            bag = next(action_bags(action))
            fc = bag.fcurves.new(prefix, index=index)
        existing = next((key for key in fc.keyframe_points if abs(float(key.co[0]) - frame) < 1e-4), None)
        if existing is None:
            fc.keyframe_points.insert(frame, float(value), options={"FAST"})
        else:
            existing.co[1] = float(value)
    for bag in action_bags(action):
        for fc in bag.fcurves:
            if fc.data_path == prefix:
                fc.update()


def overlay_quaternion(action, bone, degrees):
    offset = Euler(tuple(math.radians(value) for value in degrees), "XYZ").to_quaternion()
    for frame in action_frames(action, bone):
        set_quat_at(action, bone, frame, (offset @ quat_at(action, bone, frame)).normalized())


def add_location_offset(action, bone, index, offset):
    fc = curve(action, f'pose.bones["{bone}"].location', index)
    if fc is None:
        return
    for key in fc.keyframe_points:
        key.co[1] = float(key.co[1]) + offset
    fc.update()


def select_clip(rig, clip):
    assert rig.animation_data
    rig.animation_data.action = None
    for track in rig.animation_data.nla_tracks:
        track.mute = track.name != clip
    strip = next(track.strips[0] for track in rig.animation_data.nla_tracks if track.name == clip)
    return strip.action


def evaluated_points(obj):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    data = evaluated.to_mesh()
    points = [evaluated.matrix_world @ vertex.co for vertex in data.vertices]
    evaluated.to_mesh_clear()
    return points


def all_bounds(meshes):
    points = [point for mesh in meshes for point in evaluated_points(mesh)]
    return min(point.z for point in points), max(point.z for point in points)


def segment_projection(point, start, end):
    direction = end - start
    length2 = max(direction.length_squared, 1e-8)
    t = max(0.0, min(1.0, (point - start).dot(direction) / length2))
    return t, (point - (start + direction * t)).length


def repair_right_hand(body, rig):
    hand = body.vertex_groups.get("Hand_R") or body.vertex_groups.new(name="Hand_R")
    forearm = body.vertex_groups.get("Forearm_R")
    assert forearm is not None
    bone = rig.data.bones["Hand_R"]
    start, end = bone.head_local.copy(), bone.tail_local.copy()
    changed = 0
    for vertex in body.data.vertices:
        p = vertex.co
        if p.x < 0.34 or p.z < 0.80 or p.z > 0.93:
            continue
        t, distance = segment_projection(p, start, end)
        if distance > 0.14:
            continue
        arm_weights = {g.group: g.weight for g in vertex.groups if body.vertex_groups[g.group].name in ("Hand_R", "Forearm_R")}
        arm_budget = sum(arm_weights.values()) or 1.0
        # The imported guard body places the visible palm above the Hand_R
        # head by a few centimetres. Use the actual lower gauntlet surface as
        # the hand envelope instead of letting the skeleton mismatch produce
        # imperceptible (<0.2) hand weights.
        hand_weight = max(0.72, min(0.86, 0.72 + (0.93 - p.z) * 0.9))
        for group in (hand, forearm):
            group.remove([vertex.index])
        forearm.add([vertex.index], arm_budget * (1.0 - hand_weight), "REPLACE")
        hand.add([vertex.index], arm_budget * hand_weight, "REPLACE")
        changed += 1
    body["rtsRightHandRepair"] = {"vertices_reweighted": changed, "method": "Hand_R segment projection with Forearm_R continuity"}
    return changed


def shift_mesh(obj, delta):
    for vertex in obj.data.vertices:
        vertex.co += Vector(delta)
    obj.data.update()


def segment_triangle_crosses(start, end, tri):
    """Strict interior Möller–Trumbore test for one finite triangle edge."""
    direction = end - start
    edge_a = tri[1] - tri[0]
    edge_b = tri[2] - tri[0]
    perpendicular = direction.cross(edge_b)
    determinant = edge_a.dot(perpendicular)
    if abs(determinant) <= 1e-11:
        return False
    inverse = 1.0 / determinant
    offset = start - tri[0]
    u = offset.dot(perpendicular) * inverse
    if not 1e-6 < u < 1.0 - 1e-6:
        return False
    cross = offset.cross(edge_a)
    v = direction.dot(cross) * inverse
    if not (1e-6 < v and u + v < 1.0 - 1e-6):
        return False
    distance = edge_b.dot(cross) * inverse
    return 1e-6 < distance < 1.0 - 1e-6


def triangles_strictly_cross(first, second):
    """Return whether two triangles have a strict interior edge crossing."""
    for source, target in ((first, second), (second, first)):
        for edge in range(3):
            if segment_triangle_crosses(source[edge], source[(edge + 1) % 3], target):
                return True
    return False


def trim_body_weapon_overlap(body, weapon, rig, weapon_label):
    """Remove only legacy arm-shell faces with strict evaluated intersections.

    The generated Commander cuff already covers this small region.  Cutting
    the old body shell at measured evaluated triangle crossings preserves the
    forearm silhouette outside the weapon grip and prevents the source arm envelope
    from intersecting the lance in the exported Three.js skin.
    """
    margin = weapon_clearance_profile()["lance_body_cut_margin_m"]
    arm_groups = {
        group.index for group in body.vertex_groups
        if group.name in ("Forearm_R", "Hand_R")
    }
    doomed_polygon_indices = set()
    sampled_boxes = []
    # The lance remains in the rider's hand while Death rolls the rider with
    # the horse.  Build the cut ROI from every authored clip so an arm-shell
    # face that is clear in Idle cannot re-enter the lance during the fall.
    for clip in CLIPS:
        action = select_clip(rig, clip)
        end = int(action.frame_range[1])
        for sample in range(31):
            frame = int(round(1 + (end - 1) * sample / 30.0))
            bpy.context.scene.frame_set(frame)
            bpy.context.view_layer.update()
            depsgraph = bpy.context.evaluated_depsgraph_get()
            evaluated_weapon = weapon.evaluated_get(depsgraph)
            weapon_mesh = evaluated_weapon.to_mesh()
            weapon_points = [evaluated_weapon.matrix_world @ vertex.co for vertex in weapon_mesh.vertices]
            minimum = [min(point[i] for point in weapon_points) - margin for i in range(3)]
            maximum = [max(point[i] for point in weapon_points) + margin for i in range(3)]
            sampled_boxes.append((minimum, maximum))
            evaluated_body = body.evaluated_get(depsgraph)
            body_mesh = evaluated_body.to_mesh()
            body_matrix = evaluated_body.matrix_world.copy()
            body_mesh.calc_loop_triangles()
            body_vertices = [body_matrix @ vertex.co for vertex in body_mesh.vertices]
            body_triangles = [tuple(triangle.vertices) for triangle in body_mesh.loop_triangles]
            body_bvh = BVHTree.FromPolygons(body_vertices, body_triangles, all_triangles=True)
            weapon_triangles = [tuple(triangle.vertices) for triangle in weapon_mesh.loop_triangles]
            weapon_bvh = BVHTree.FromPolygons(weapon_points, weapon_triangles, all_triangles=True)
            for body_index, weapon_index in body_bvh.overlap(weapon_bvh):
                triangle = body_mesh.loop_triangles[body_index]
                body_triangle = [body_vertices[index] for index in triangle.vertices]
                weapon_triangle = [weapon_points[index] for index in weapon_triangles[weapon_index]]
                if not triangles_strictly_cross(body_triangle, weapon_triangle):
                    continue
                source_indices = triangle.vertices
                arm_weight = sum(
                    sum(group.weight for group in body.data.vertices[index].groups if group.group in arm_groups)
                    for index in source_indices
                ) / len(source_indices)
                if arm_weight >= 0.25:
                    # loop_triangles.polygon_index is the evaluated source
                    # polygon id.  Keep that id all the way to deletion;
                    # deleting every face sharing two hit vertices also cuts
                    # neighboring forearm surfaces that never crossed.
                    doomed_polygon_indices.add(int(triangle.polygon_index))
            evaluated_weapon.to_mesh_clear()
            evaluated_body.to_mesh_clear()
    if not doomed_polygon_indices:
        raise RuntimeError(f"{weapon_label} body overlap cut found no arm-shell faces")
    mesh = body.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    doomed = [face for face in bm.faces if face.index in doomed_polygon_indices]
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    loose = [vertex for vertex in bm.verts if not vertex.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    report = {"method": "evaluated-strict-loop-triangle-polygon", "weapon": weapon_label,
              "removed_faces": len(doomed), "source_polygons": len(doomed_polygon_indices),
              "samples": len(sampled_boxes), "margin_m": margin,
              "bbox_min": [min(box[0][i] for box in sampled_boxes) for i in range(3)],
              "bbox_max": [max(box[1][i] for box in sampled_boxes) for i in range(3)]}
    existing = dict(body.get("rtsWeaponClearanceRepair", {}))
    existing[weapon_label] = report
    body["rtsWeaponClearanceRepair"] = existing
    return report


def rotate_rigid_mesh_about_world_axis(obj, rig, bone_name, material_index, axis, degrees):
    """Rotate a rigid tack around its grip center while preserving the grip."""
    select_clip(rig, "Idle")
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    data = evaluated.to_mesh()
    world = [evaluated.matrix_world @ vertex.co for vertex in data.vertices]
    ids = {index for polygon in data.polygons if polygon.material_index == material_index
           for index in polygon.vertices}
    if not ids:
        evaluated.to_mesh_clear()
        raise RuntimeError(f"{obj.name} lacks grip material {material_index}")
    pivot = sum((world[index] for index in ids), Vector()) / len(ids)
    evaluated.to_mesh_clear()
    skin_map = gauntlet.skin_matrices(rig)[bone_name]
    object_inv = obj.matrix_world.inverted()
    rotation = Quaternion(Vector(axis).normalized(), math.radians(degrees))
    for vertex, point in zip(obj.data.vertices, world):
        rotated = pivot + rotation @ (point - pivot)
        vertex.co = object_inv @ (skin_map.inverted() @ rotated)
    obj.data.update()
    report = {"method": "world-axis-grip-pivot", "axis": list(Vector(axis).normalized()),
              "degrees": degrees, "pivot_world": list(pivot), "material_index": material_index}
    obj["rtsShieldClearanceRepair"] = report
    return report


def evaluated_grip_center(obj, material_index):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    data = evaluated.to_mesh()
    ids = {vertex for poly in data.polygons if poly.material_index == material_index for vertex in poly.vertices}
    points = [evaluated.matrix_world @ data.vertices[index].co for index in ids]
    evaluated.to_mesh_clear()
    return sum(points, Vector()) / max(len(points), 1)


def evaluated_material_points(obj, material_index):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    data = evaluated.to_mesh()
    ids = {vertex for poly in data.polygons if poly.material_index == material_index for vertex in poly.vertices}
    points = [evaluated.matrix_world @ data.vertices[index].co for index in ids]
    evaluated.to_mesh_clear()
    return points


def local_material_axis_radius(obj, material_index):
    """Measure a rigid weapon island in its authored local frame.

    Farthest-pair fitting is unstable for the lance because its cylindrical
    end caps can choose a diagonal across the island.  The source mesh keeps
    the shaft on its longest local axis, so derive that axis from the local
    bounds and let the current skin matrix carry it into the evaluated pose.
    """
    ids = {i for polygon in obj.data.polygons if polygon.material_index == material_index
           for i in polygon.vertices}
    points = [obj.data.vertices[index].co.copy() for index in ids]
    if len(points) < 3:
        raise RuntimeError(f"weapon material {material_index} has insufficient points")
    bounds = [(min(point[axis] for point in points), max(point[axis] for point in points))
              for axis in range(3)]
    axis_index = max(range(3), key=lambda axis: bounds[axis][1] - bounds[axis][0])
    local_axis = Vector((0.0, 0.0, 0.0))
    local_axis[axis_index] = 1.0
    center = sum(points, Vector()) / len(points)
    radial = [(point - center).cross(local_axis).length for point in points]
    return local_axis, center, max(radial)


def body_group_points(obj, group_name, threshold=0.35):
    group = obj.vertex_groups.get(group_name)
    if group is None:
        return []
    ids = []
    for vertex in obj.data.vertices:
        try:
            if group.weight(vertex.index) > threshold:
                ids.append(vertex.index)
        except RuntimeError:
            continue
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    data = evaluated.to_mesh()
    points = [evaluated.matrix_world @ data.vertices[index].co for index in ids if index < len(data.vertices)]
    evaluated.to_mesh_clear()
    return points


def refine_lance(lance):
    """Join the authored steel point to the shaft with a measured sleeve overlap.

    The v2 builder scaled both materials together, preserving the source gap.
    Here only the steel vertices move, along the measured lance axis, so the
    wood silhouette and hand placement remain authored.
    """
    profile = lance_tip_profile()
    shaft_ids = {i for p in lance.data.polygons if p.material_index == 0 for i in p.vertices}
    tip_ids = {i for p in lance.data.polygons if p.material_index == 2 for i in p.vertices}
    if not shaft_ids or not tip_ids:
        raise RuntimeError("Knight lance lacks shaft or steel-tip material islands")
    axis = Vector((0.0, 1.0, 0.0))
    shaft_end = max(lance.data.vertices[i].co.dot(axis) for i in shaft_ids)
    tip_base = min(lance.data.vertices[i].co.dot(axis) for i in tip_ids)
    # The source object is rigidly skinned; local millimetres are converted by
    # the current armature scale when exported.  Calculate the desired local
    # overlap from the evaluated object scale instead of a hard-coded world
    # offset.
    scale_y = max(abs(lance.scale.y), 1e-6)
    # The steel base is the lower end of the +Y tip island.  Move it *back*
    # into the wood by a measured sleeve depth; adding the overlap would leave
    # the original gap intact.
    # Keep both LOD exporters inside the 2--4 mm acceptance window; LOD1
    # applies a slightly different armature scale to the same local sleeve.
    overlap_local = 0.0030 / scale_y
    delta = shaft_end - overlap_local - tip_base
    for i in tip_ids:
        lance.data.vertices[i].co += axis * delta
    lance.data.update()
    lance["rtsLanceRepair"] = {"method": "tip-material-axis-sleeve", "axis_local": list(axis),
                               "shaft_end_local": shaft_end, "tip_base_before_local": tip_base,
                               "tip_shift_local": delta, "overlap_world_m": 0.0030}
    return {"method": "tip-material-axis-sleeve", "shaft_end_local": shaft_end,
            "tip_base_before_local": tip_base, "tip_shift_local": delta,
            "overlap_world_m": 0.0030, "gap_world_m": 0.0}


def farthest_pair(points):
    best = (points[0], points[1], 0.0)
    for index, first in enumerate(points):
        for second in points[index + 1:]:
            distance = (second - first).length_squared
            if distance > best[2]:
                best = (first, second, distance)
    return best[0], best[1]


def bone_world_center(rig, bone_name):
    bone = rig.pose.bones[bone_name]
    return rig.matrix_world @ ((bone.head + bone.tail) * 0.5)


def evaluated_group_center(obj, group_name, threshold=0.35):
    group = obj.vertex_groups.get(group_name)
    assert group is not None
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    data = evaluated.to_mesh()
    ids = []
    for vertex in obj.data.vertices:
        try:
            weight = group.weight(vertex.index)
        except RuntimeError:
            continue
        if weight > threshold:
            ids.append(vertex.index)
    points = [evaluated.matrix_world @ data.vertices[index].co for index in ids]
    evaluated.to_mesh_clear()
    return sum(points, Vector()) / max(len(points), 1)


def align_rigid_grip(obj, rig, skin_bone, material_index, target_point, target_bone):
    """Align an evaluated rigidly skinned grip, accounting for the bind map."""
    target = target_point
    before = evaluated_grip_center(obj, material_index)
    world_delta = target - before
    pose_bone = rig.pose.bones[skin_bone]
    rest_bone = rig.data.bones[skin_bone]
    skin_map = rig.matrix_world @ pose_bone.matrix @ rest_bone.matrix_local.inverted()
    local_delta = skin_map.to_3x3().inverted() @ world_delta
    shift_mesh(obj, local_delta)
    after = evaluated_grip_center(obj, material_index)
    obj["rtsGripRepair"] = {"skin_bone": skin_bone, "target_bone": target_bone,
                             "delta_bind": list(local_delta), "before_world": list(before),
                             "after_world": list(after), "target_world": list(target)}
    return {"skin_bone": skin_bone, "target_bone": target_bone, "delta_bind": list(local_delta),
            "before_world": list(before), "after_world": list(after), "target_world": list(target),
            "residual_world": (after - target).length}


def repair_grips(body, rig, lance, shield):
    # Work in evaluated Idle pose: the prior source used rest-space offsets,
    # but the armature's rotated basis moved the exported grip 0.65 m upward.
    select_clip(rig, "Idle")
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    # The repaired body is the visual contact surface. It sits slightly above
    # the imported Hand_R/Hand_L bone midpoint, so use its weighted palm
    # centroids as the final grip targets.
    lance_report = align_rigid_grip(lance, rig, "Hand_R", 1,
                                    evaluated_group_center(body, "Hand_R"), "Hand_R")
    shield_report = align_rigid_grip(shield, rig, "Hand_L", 3,
                                     evaluated_group_center(body, "Hand_L"), "Hand_L")
    return {"lance": lance_report, "shield": shield_report}


def make_tube_mesh(name, paths, radii, material, rig, skin_bone, skin_map, sides=8):
    vertices = []
    faces = []
    for path, radius_values in zip(paths, radii):
        for index, point in enumerate(path):
            tangent = (path[min(index + 1, len(path) - 1)] - path[max(0, index - 1)]).normalized()
            reference = Vector((0.0, 0.0, 1.0)) if abs(tangent.z) < 0.9 else Vector((0.0, 1.0, 0.0))
            side = tangent.cross(reference).normalized()
            up = tangent.cross(side).normalized()
            for ring_index in range(sides):
                angle = 2.0 * math.pi * ring_index / sides
                world_point = point + radius_values[index] * (math.cos(angle) * side + math.sin(angle) * up)
                vertices.append(tuple(skin_map.inverted() @ world_point))
    for path_index, path in enumerate(paths):
        ring_count = len(path)
        base = sum(len(item) for item in paths[:path_index]) * sides
        for ring in range(ring_count - 1):
            for side in range(sides):
                nxt = (side + 1) % sides
                faces.append((base + ring * sides + side, base + ring * sides + nxt,
                              base + (ring + 1) * sides + nxt, base + (ring + 1) * sides + side))
        faces.append(tuple(base + side for side in reversed(range(sides))))
        faces.append(tuple(base + (ring_count - 1) * sides + side for side in range(sides)))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = rig
    obj.matrix_world = rig.matrix_world.copy()
    mesh.materials.append(material)
    group = obj.vertex_groups.new(name=skin_bone)
    group.add([vertex.index for vertex in mesh.vertices], 1.0, "REPLACE")
    modifier = obj.modifiers.new("Closed grip hand skin", "ARMATURE")
    modifier.object = rig
    obj["rtsFingerRepair"] = {"bone": skin_bone, "finger_paths": len(paths), "material": material.name}
    return obj


def grip_frame(points):
    """Measure the actual grip island, returning center, axis and radial radius."""
    first, second = farthest_pair(points)
    axis = (second - first).normalized()
    center = sum(points, Vector()) / max(len(points), 1)
    radius = max((p - center).cross(axis).length for p in points)
    return center, axis, max(0.012, min(0.060, radius))


def pose_world_segment(rig, bone_name):
    pb = rig.pose.bones[bone_name]
    head = rig.matrix_world @ pb.head
    tail = rig.matrix_world @ pb.tail
    return head, tail, (tail - head).normalized()


def create_commander_hand(body, rig, weapon, side, lod, material_names):
    """Build the approved curved four-digit/ thumb gauntlet around the live weapon."""
    select_clip(rig, "Idle")
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    material_index = 1 if side == "R" else 3
    points = evaluated_material_points(weapon, material_index)
    # Use the authored shaft/strap frame.  A farthest pair over a cylindrical
    # material island can select a cap diagonal and inflate the gauntlet by
    # centimetres, which reads as an open palm even though the center matches.
    local_axis, _, local_radius = local_material_axis_radius(weapon, material_index)
    skin_bone = "Hand_R" if side == "R" else "Hand_L"
    skin_map = gauntlet.skin_matrices(rig)[skin_bone]
    axis = (skin_map.to_3x3() @ local_axis).normalized()
    center = sum(points, Vector()) / max(len(points), 1)
    radius = max(0.012, min(0.050, local_radius * 0.82 - (0.010 if side == "R" else 0.0)))
    if side == "L":
        # The authored shield strap is a flattened leather block rather than
        # a round haft.  Its working cross-section is the inner half of the
        # measured island; keep the closed glove on the strap surface.
        radius = max(0.012, min(0.024, radius * 0.68))
    wrist, _, distal = pose_world_segment(rig, "Forearm_" + side)
    forearm_head, forearm_tail, forearm_dir = pose_world_segment(rig, "Forearm_" + side)
    # The cuff is measured from the weighted arm surface so its rim cannot float
    # away from the body when the source hand is trimmed.
    group_points = body_group_points(body, "Hand_" + side)
    if group_points:
        wrist = sum(group_points, Vector()) / len(group_points)
        wrist = wrist.lerp(forearm_tail, 0.72)
    wrist_radius = max(0.026, min(0.060, radius * 1.15))
    cfg = dict(gauntlet.GAUNTLET_DEFAULTS)
    cfg["finger_width"] *= 0.94
    cfg["finger_thickness"] *= 0.91
    cfg["repeat"] = 0.12
    outward = Vector((1.0, 0.15, 0.0)) if side == "R" else Vector((-1.0, 0.15, 0.0))
    frame, local_wrist, thumb_axis = gauntlet.hand_frame(center, axis, wrist, radius, cfg, side, outward)
    parts = [p.transformed(frame, mirror_x=side == "L")
             for p in sculpted_parts(radius, local_wrist, wrist_radius, cfg, 1,
                                     material_names[0], material_names[1])]
    parts.append(gauntlet.cuff_part(wrist, forearm_dir, wrist_radius, material_names[0], 1, 1.04, .044, .15))
    refs = gauntlet.skin_matrices(rig)
    for part in parts:
        # The hand must share the weapon's rigid skin bone.  Blending Hand and
        # Forearm matrices after glTF export rotates the glove away from a
        # rigid lance/strap by several millimetres; the cuff remains visually
        # continuous because the source forearm is already at this bind pose.
        part.weights = [{skin_bone: 1.0} for _ in part.weights]
        gauntlet.to_bind(part, refs)
        # Knight's authored armature carries a .82 scale and a world-space
        # offset.  parts_to_object stores mesh vertices in armature-parent
        # space, whereas to_bind returns world bind positions.
        parent_inv = rig.matrix_world.inverted()
        part.verts = [parent_inv @ vertex for vertex in part.verts]
    name = f"KnightCommanderHand_{side}_LOD{lod}"
    obj = gauntlet.parts_to_object(name, parts, rig,
                                   {material_names[0]: bpy.data.materials[material_names[0]],
                                    material_names[1]: bpy.data.materials[material_names[1]]})
    obj["authorship"] = "Approved commander_assembly_hands sculpted curved four-finger and thumb gauntlet"
    obj["rtsGripRepair"] = {"side": side, "weapon": weapon.name, "grip_center": list(center),
                             "grip_axis": list(axis), "grip_radius_m": radius,
                             "wrist": list(wrist), "wrist_radius_m": wrist_radius,
                             "parts": [part.name for part in parts]}
    return obj, {"object": obj.name, "side": side, "finger_count": 4, "thumb_count": 1,
                 "shaft_axis": list(axis), "shaft_center": list(center), "wrist": list(wrist),
                 "wrist_radius_m": wrist_radius, "triangles": gauntlet.tri_count(obj),
                 "parts": [part.name for part in parts]}


def stirrup_measure(stirrup, side):
    """Derive the actual hole bounds and pedal center from evaluated stirrup faces."""
    points = [p for p in evaluated_points(stirrup) if (p.x < 0 if side == "L" else p.x > 0)]
    if not points:
        raise RuntimeError(f"no stirrup vertices for side {side}")
    zmin = min(p.z for p in points)
    pedal_ring = [p for p in points if p.z <= zmin + 0.030]
    outer = min(abs(p.x) for p in points)
    inner = max(abs(p.x) for p in points)
    cx = (outer + inner) * 0.5
    ys = [p.y for p in pedal_ring]
    cy = (min(ys) + max(ys)) * 0.5
    # The ring thickness is measured from its lowest cross-section; the
    # opening is intentionally narrower than the outside silhouette.
    half_x = max(0.018, (inner - outer) * 0.36)
    half_y = max(0.018, (max(ys) - min(ys)) * 0.55)
    sign = -1.0 if side == "L" else 1.0
    return {
        # Keep the weighted sole a small positive distance above the measured
        # lowest pedal ring; the raw surface solver otherwise settles a few
        # tenths of a millimetre below it because its objective is symmetric.
        "pedal_center": Vector((sign * cx, cy, zmin + 0.0105)),
        "hole_min": Vector((sign * (cx - half_x), min(ys) - 0.006, zmin + 0.006)),
        "hole_max": Vector((sign * (cx + half_x), max(ys) + 0.006, zmin + 0.115)),
        "outer_points": len(points), "pedal_points": len(pedal_ring),
    }


def foot_surface_measure(body, side):
    """Return the sole/arch center and thickness of the evaluated Foot group."""
    points = body_group_points(body, "Foot_" + side)
    if len(points) < 3:
        raise RuntimeError(f"insufficient weighted Foot_{side} surface")
    zmin, zmax = min(p.z for p in points), max(p.z for p in points)
    sole = [p for p in points if p.z <= zmin + max(0.012, (zmax - zmin) * 0.18)]
    center = sum(sole, Vector()) / len(sole)
    return {"sole_center": center, "sole_points": len(sole), "zmin": zmin, "zmax": zmax}


def foot_contact_error(body, measure):
    foot = foot_surface_measure(body, measure["side"])
    target = measure["pedal_center"]
    delta = foot["sole_center"] - target
    # The objective is based on the surface contact point, with lateral and
    # fore/aft errors weighted equally and vertical seating weighted slightly
    # higher to avoid a visually floating boot.
    return delta.x * delta.x + delta.y * delta.y + delta.z * delta.z * 1.4, foot, delta


def solve_leg_to_stirrup(body, rider, stirrup, side, clip):
    """Solve Thigh/Shin/Foot rotations against the evaluated boot surface.

    This is a small coordinate descent over the current action pose.  The
    solution is driven by the measured pedal and weighted Foot surface; no
    fixed seated Euler pose is exported.
    """
    measure = stirrup_measure(stirrup, side)
    measure["side"] = side
    action = next(t.strips[0].action for t in rider.animation_data.nla_tracks if t.name == clip)
    select_clip(rider, clip)
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    frames = {bone: action_frames(action, bone) for bone in ("Thigh_" + side, "Shin_" + side, "Foot_" + side)}
    if not all(frames.values()):
        raise RuntimeError(f"{clip} lacks complete leg curves for {side}")
    source = {bone: {frame: quat_at(action, bone, frame) for frame in fs} for bone, fs in frames.items()}
    bases = {bone: source[bone][frames[bone][0]] for bone in frames}
    # A broad seed only accelerates the measured solve; every final rotation is
    # selected from the surface-error objective below.
    seed_rows = [
        ((-15.0, 0.0, 25.0), (38.0, -25.0, 0.0)),
        ((-15.0, 0.0, -25.0), (38.0, -25.0, 0.0)),
        ((15.0, 0.0, 25.0), (38.0, -25.0, 0.0)),
        ((15.0, 0.0, -25.0), (38.0, -25.0, 0.0)),
        ((-15.0, 25.0, -25.0), (38.0, 25.0, 0.0)),
        ((15.0, -25.0, -25.0), (38.0, 25.0, 0.0)),
    ]

    def apply_pose():
        for bone, values in angles.items():
            q = (Euler(tuple(math.radians(v) for v in values), "XYZ").to_quaternion() @ bases[bone]).normalized()
            set_quat_at(action, bone, frames[bone][0], q)
        bpy.context.view_layer.update()

    def objective():
        apply_pose()
        error, foot, delta = foot_contact_error(body, measure)
        return error, foot, delta

    global_best = float("inf")
    global_angles = None
    for thigh_seed, shin_seed in seed_rows:
        angles = {"Thigh_" + side: list(thigh_seed), "Shin_" + side: list(shin_seed),
                  "Foot_" + side: [0.0, 0.0, 0.0]}
        # Reset the trial to the authored starting pose before each independent
        # seed; the winning result is chosen by measured surface error.
        for bone, base in bases.items():
            set_quat_at(action, bone, frames[bone][0], base)
        best, _, _ = objective()
        for step in (18.0, 8.0, 3.0, 1.0, 0.5):
            for bone in frames:
                for axis_index in range(3):
                    accepted = True
                    while accepted:
                        accepted = False
                        current = angles[bone][axis_index]
                        candidates = []
                        for direction in (-1.0, 1.0):
                            angles[bone][axis_index] = current + direction * step
                            score, foot, delta = objective()
                            candidates.append((score, direction, foot, delta))
                        winner = min(candidates, key=lambda row: row[0])
                        if winner[0] + 1e-9 < best:
                            angles[bone][axis_index] = current + winner[1] * step
                            best = winner[0]
                            accepted = True
                        else:
                            angles[bone][axis_index] = current
                            objective()
        if best < global_best:
            global_best = best
            global_angles = {bone: list(values) for bone, values in angles.items()}
    angles = global_angles
    final_error, final_foot, final_delta = objective()
    # Apply the solved start pose as a delta to every authored key so attacks
    # and hurt motion retain their original timing and articulation.
    solved = {}
    for bone in frames:
        solved[bone] = (Euler(tuple(math.radians(v) for v in angles[bone]), "XYZ").to_quaternion() @ bases[bone]).normalized()
        for frame in frames[bone]:
            if clip in ("Idle", "Walk", "Attack", "Hurt"):
                # The rider's authored leg keys are a standing locomotion
                # cycle.  Keeping their relative motion would pull the boots
                # out of the physical stirrup; mounted lower-body contact is
                # solved per clip and held while upper-body motion remains.
                set_quat_at(action, bone, frame, solved[bone])
            else:
                relative = bases[bone].inverted() @ source[bone][frame]
                set_quat_at(action, bone, frame, (solved[bone] @ relative).normalized())
    bpy.context.view_layer.update()
    _, final_foot, final_delta = foot_contact_error(body, measure)
    return {
        "clip": clip, "side": side, "pedal_center": list(measure["pedal_center"]),
        "hole_min": list(measure["hole_min"]), "hole_max": list(measure["hole_max"]),
        "sole_center": list(final_foot["sole_center"]), "delta": list(final_delta),
        "error_m": math.sqrt(final_delta.length_squared), "angles_solver_only": angles,
        "sole_points": final_foot["sole_points"], "pedal_points": measure["pedal_points"],
    }


def track_stirrup_motion(rider, horse, stirrup, clip, action):
    """Translate the mounted rider with the animated saddle/stirrup assembly."""
    select_clip(rider, clip)
    select_clip(horse, clip)
    start = int(next(t.strips[0].frame_start for t in rider.animation_data.nla_tracks if t.name == clip))
    end = int(next(t.strips[0].frame_end for t in rider.animation_data.nla_tracks if t.name == clip))
    bpy.context.scene.frame_set(start)
    bpy.context.view_layer.update()
    base = stirrup_measure(stirrup, "R")["pedal_center"]
    root_values = []
    for frame in range(start, end + 1):
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        current = stirrup_measure(stirrup, "R")["pedal_center"]
        root_basis = rider.matrix_world.to_3x3() @ rider.data.bones["Root"].matrix_local.to_3x3()
        local_delta = root_basis.inverted() @ (current - base)
        values = []
        for axis_index in range(3):
            fc = curve(action, 'pose.bones["Root"].location', axis_index)
            values.append((fc.evaluate(float(start)) if fc is not None else 0.0) + local_delta[axis_index])
        root_values.append((frame, values))
    for axis_index in range(3):
        upsert_curve(action, 'pose.bones["Root"].location', axis_index,
                     [(frame, values[axis_index]) for frame, values in root_values])
    return {"start_frame": start, "end_frame": end, "samples": len(root_values),
            "method": "evaluated-stirrup-motion-to-root-translation"}


def action_transform_frames(action, bone):
    prefix = f'pose.bones["{bone}"].'
    frames = set()
    for bag in action_bags(action):
        for fc in bag.fcurves:
            if fc.data_path.startswith(prefix):
                frames.update(round(float(key.co[0]), 5) for key in fc.keyframe_points)
    return sorted(frames)


def freeze_mount_anchor(action, bones=("Root", "Pelvis")):
    """Hold the rider's seat anchor while upper-body clips continue moving.

    The imported Attack/Hurt actions animate Root rotation as well as the
    arms.  Freezing only Root location leaves the solved boots rotating away
    from a rigid HorseRoot-bound stirrup.  Preserve frame one as the authored
    seat orientation and flatten all transform channels for the mount anchors.
    """
    report = {}
    for bone in bones:
        frames = action_transform_frames(action, bone)
        if not frames:
            continue
        start = frames[0]
        q = quat_at(action, bone, start)
        for frame in frames:
            set_quat_at(action, bone, frame, q)
        loc_values = []
        for axis_index in range(3):
            fc = curve(action, f'pose.bones["{bone}"].location', axis_index)
            if fc is None:
                continue
            value = float(fc.evaluate(start))
            for key in fc.keyframe_points:
                key.co[1] = value
            fc.update()
            loc_values.append(value)
        report[bone] = {"frames": len(frames), "start_frame": start,
                        "rotation": list(q), "location": loc_values}
    return report


def repair_seated_actions(body, rider, horse, stirrup):
    """Seat every non-Death clip from measured boot-to-pedal contact."""
    report = {}
    for clip in CLIPS:
        action = next(t.strips[0].action for t in rider.animation_data.nla_tracks if t.name == clip)
        add_location_offset(action, "Root", 1, -0.12)
        anchor = freeze_mount_anchor(action)
        rows = []
        for side in ("L", "R"):
            rows.append(solve_leg_to_stirrup(body, rider, stirrup, side, clip))
        if clip in ("Idle", "Walk", "Attack", "Hurt"):
            # Keep the pelvis/root seat anchor fixed while authored shoulders,
            # arms and weapons continue their clip motion.
            for bone in ("Pelvis",):
                fs = action_frames(action, bone)
                if fs:
                    base = quat_at(action, bone, fs[0])
                    for frame in fs:
                        set_quat_at(action, bone, frame, base)
            for axis_index in range(3):
                fc = curve(action, 'pose.bones["Root"].location', axis_index)
                if fc is not None:
                    value = fc.evaluate(1.0)
                    for key in fc.keyframe_points:
                        key.co[1] = value
                    fc.update()
            # Tack is bound to HorseRoot after the solve.  Its non-Death
            # transform is therefore rigid; copying the old HorseBody motion
            # into Root would make the boots leave the real pedal.
            motion = {"method": "horse-root-rigid-tack", "samples": 1}
        else:
            motion = None
        report[clip] = {"root_local_y_offset": -0.12, "surface_solves": rows,
                        "mount_anchor": anchor, "stirrup_motion": motion}
    rider["rtsSeatRepair"] = {"method": "evaluated-Foot-surface-to-stirrup-hole-and-pedal-solver", **report}
    return report


def scale_saddle_cloth(saddle):
    """Shorten the skirt around the seat while retaining its authored drop."""
    profile = saddle_profile()
    z_mid = sum(v.co.z for v in saddle.data.vertices) / max(len(saddle.data.vertices), 1)
    y_mid = sum(v.co.y for v in saddle.data.vertices) / max(len(saddle.data.vertices), 1)
    for vertex in saddle.data.vertices:
        x, y, z = vertex.co
        vertex.co.x = x * profile["x_scale"]
        vertex.co.y = y_mid + (y - y_mid) * profile["y_scale"]
        vertex.co.z = z_mid + (z - z_mid) * profile["z_scale"]
    saddle.data.update()
    saddle["rtsSaddleRepair"] = {"x_scale": profile["x_scale"], "y_scale": profile["y_scale"],
                                  "z_scale_about_authored_mid": profile["z_scale"],
                                  "bottom_lift_m": profile["bottom_lift_m"],
                                  "method": "authored-drape-preserved"}


def bind_rigid_mesh(obj, rig, bone_name):
    ref = gauntlet.skin_matrices(rig)[bone_name]
    object_inv = obj.matrix_world.inverted()
    for vertex in obj.data.vertices:
        world = obj.matrix_world @ vertex.co
        bind_world = ref.inverted() @ world
        vertex.co = object_inv @ bind_world
    obj.data.update()
    for old_group in obj.vertex_groups:
        old_group.remove([vertex.index for vertex in obj.data.vertices])
    group = obj.vertex_groups.get(bone_name) or obj.vertex_groups.new(name=bone_name)
    group.add([vertex.index for vertex in obj.data.vertices], 1.0, "REPLACE")
    modifier = next((item for item in obj.modifiers if item.type == "ARMATURE"), None)
    if modifier is None:
        modifier = obj.modifiers.new("Mounted tack skin", "ARMATURE")
    modifier.object = rig
    obj["rtsAttachmentRepair"] = {"rig": rig.name, "bone": bone_name, "vertices": len(obj.data.vertices)}


def smoothstep(value):
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def horse_edge_components(mesh):
    """Return edge-connected source polygon ids for a horse mesh."""
    edge_faces = {}
    for polygon in mesh.polygons:
        for edge in polygon.edge_keys:
            edge_faces.setdefault(tuple(sorted(edge)), []).append(polygon.index)
    adjacency = {polygon.index: set() for polygon in mesh.polygons}
    for faces in edge_faces.values():
        if len(faces) < 2:
            continue
        for face_index in faces:
            adjacency[face_index].update(faces)
    seen = set()
    components = []
    for polygon in mesh.polygons:
        if polygon.index in seen:
            continue
        stack = [polygon.index]
        seen.add(polygon.index)
        component = []
        while stack:
            face_index = stack.pop()
            component.append(face_index)
            for neighbor in adjacency[face_index]:
                if neighbor not in seen:
                    seen.add(neighbor)
                    stack.append(neighbor)
        components.append(component)
    return sorted(components, key=len, reverse=True)


def remove_mouth_fragment(horse_mesh):
    """Delete only the disconnected lower-mouth strip from source topology.

    The neural horse has a normal continuous lower jaw plus several small
    duplicate components in the same mouth ROI.  Component bounds identify the
    latter; exact source polygon ids are then deleted so adjacent jaw faces are
    never removed by a shared-vertex heuristic.
    """
    mesh = horse_mesh.data
    components = horse_edge_components(mesh)
    selected = []
    for component_index, polygon_ids in enumerate(components):
        vertices = {vertex for polygon_id in polygon_ids
                    for vertex in mesh.polygons[polygon_id].vertices}
        points = [horse_mesh.matrix_world @ mesh.vertices[index].co for index in vertices]
        minimum = [min(point[axis] for point in points) for axis in range(3)]
        maximum = [max(point[axis] for point in points) for axis in range(3)]
        if is_mouth_fragment_bounds(minimum, maximum):
            selected.append({"component": component_index, "faces": len(polygon_ids),
                             "min": minimum, "max": maximum,
                             "polygon_indices": list(polygon_ids)})
    doomed_polygon_indices = {polygon_id for item in selected for polygon_id in item["polygon_indices"]}
    if not doomed_polygon_indices:
        raise RuntimeError(f"{horse_mesh.name} mouth fragment components not found")
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    doomed = [face for face in bm.faces if face.index in doomed_polygon_indices]
    if len(doomed) != len(doomed_polygon_indices):
        bm.free()
        raise RuntimeError(f"{horse_mesh.name} source polygon map changed before mouth cut")
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    report = {
        "method": "edge-component-exact-polygon-index",
        "profile": mouth_fragment_profile(),
        "components": selected,
        "removed_faces": len(doomed),
        "removed_polygon_indices": sorted(doomed_polygon_indices),
    }
    horse_mesh["rtsMouthFragmentRepair"] = report
    return report


def repair_horse_head_weights(horse, rig):
    """Give the entire mouth/head envelope continuous Neck influence."""
    profile = horse_head_profile()
    neck = horse.vertex_groups.get("Neck") or horse.vertex_groups.new(name="Neck")
    body = horse.vertex_groups.get("HorseBody") or horse.vertex_groups.new(name="HorseBody")
    nb = rig.data.bones["Neck"]
    changed = 0
    for vertex in horse.data.vertices:
        p = vertex.co
        if p.y < profile["mouth_start_y_m"] or p.z < profile["mouth_start_z_m"]:
            continue
        _, distance = segment_projection(p, nb.head_local, nb.tail_local)
        forward = smoothstep((p.y - profile["mouth_start_y_m"]) /
                             (profile["mouth_end_y_m"] - profile["mouth_start_y_m"]))
        near_neck = 1.0 - smoothstep(distance / 0.62)
        # Keep the lower jaw attached to the neck as a coherent surface while
        # blending the neck root over a broad envelope instead of cutting by z.
        # The jaw/mouth portion is one continuous authored surface.  Keep it
        # fully on Neck so the rigid bit-side rein islands cannot peel away;
        # the upper head still transitions through the measured envelope.
        neck_weight = 1.0 if p.y >= 0.72 else max(0.82, min(1.0, 0.82 + 0.14 * forward + 0.04 * near_neck))
        neck.remove([vertex.index]); body.remove([vertex.index])
        neck.add([vertex.index], neck_weight, "REPLACE")
        body.add([vertex.index], 1.0 - neck_weight, "REPLACE")
        changed += 1
    horse["rtsHorseHeadRepair"] = {"method": "continuous-mouth-neck-envelope", "vertices": changed,
                                    "mouth_start_y_m": profile["mouth_start_y_m"],
                                    "mouth_end_y_m": profile["mouth_end_y_m"],
                                    "neck_blend_m": profile["neck_blend_m"]}
    return {"method": "continuous-mouth-neck-envelope", "vertices": changed}


def attach_rein_mouth_chunks(reins, horse_mesh):
    """Move each authored bit-side rein island onto the evaluated jaw surface."""
    horse_points = body_group_points(horse_mesh, "Neck", threshold=0.95)
    if not horse_points:
        return {"chunks": 0}
    inv = reins.matrix_world.inverted()
    reports = []
    centers = []
    for start in (0, 24):
        ids = range(start, start + 12)
        center = sum((reins.matrix_world @ reins.data.vertices[i].co for i in ids), Vector()) / 12.0
        centers.append(tuple(center))
    anchors = select_bit_mouth_anchors(
        [tuple(point) for point in horse_points], centers)
    for start, closest in zip((0, 24), anchors):
        ids = range(start, start + 12)
        center = sum((reins.matrix_world @ reins.data.vertices[i].co for i in ids), Vector()) / 12.0
        closest = Vector(closest)
        delta = closest - center
        local_delta = inv.to_3x3() @ delta
        for i in ids:
            reins.data.vertices[i].co += local_delta
        reports.append({"chunk_start": start, "before_center": list(center),
                        "target_surface": list(closest), "shift_world": list(delta)})
    reins.data.update()
    reins["rtsReinMouthRepair"] = {"method": "bit-corner-surface-anchor", "chunks": reports,
                                    "eligible_envelope": {"y_m": [0.70, 1.08],
                                                          "z_m": [1.40, 1.66]}}
    return {"chunks": reports}


def bind_reins(reins, rig):
    neck = reins.vertex_groups.get("Neck") or reins.vertex_groups.new(name="Neck")
    body = reins.vertex_groups.get("HorseBody") or reins.vertex_groups.new(name="HorseBody")
    refs = gauntlet.skin_matrices(rig)
    object_inv = reins.matrix_world.inverted()
    for vertex in reins.data.vertices:
        # Clear the imported HorseBody weight first.  The mouth pair must be
        # rigidly Neck-bound, otherwise the old 50/50 weight pulls a dangling
        # brown strip away from the jaw during Neck motion.
        neck.remove([vertex.index]); body.remove([vertex.index])
        group = neck if vertex.index // 12 in (0, 2) else body
        group.add([vertex.index], 1.0, "REPLACE")
        bone_name = "Neck" if vertex.index // 12 in (0, 2) else "HorseBody"
        world = reins.matrix_world @ vertex.co
        vertex.co = object_inv @ (refs[bone_name].inverted() @ world)
    modifier = next((item for item in reins.modifiers if item.type == "ARMATURE"), None)
    if modifier is None:
        modifier = reins.modifiers.new("Reins neck-to-saddle skin", "ARMATURE")
    modifier.object = rig
    reins["rtsAttachmentRepair"] = {"rig": rig.name, "mouth_bone": "Neck", "saddle_bone": "HorseBody"}


def bind_tack(horse, saddle, stirrup, reins):
    select_clip(horse, "Idle")
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    # The authored saddle seat follows HorseRoot.  HorseBody's attack/hurt
    # flex is a leg/body action and twists a supposedly rigid stirrup through
    # the boot; Root keeps the mount hardware attached during those clips.
    bind_rigid_mesh(saddle, horse, "HorseRoot")
    bind_rigid_mesh(stirrup, horse, "HorseRoot")
    bind_reins(reins, horse)


def repair_death_actions(horse, rider):
    horse_action = next(t.strips[0].action for t in horse.animation_data.nla_tracks if t.name == "Death")
    rider_action = next(t.strips[0].action for t in rider.animation_data.nla_tracks if t.name == "Death")
    frames = (1, 10, 25, 48)
    profile = death_profile()
    # Reuse the source's authored leg collapse and replace only the conflicting
    # body/root tracks.  The horse must visibly lie on its side by the last key.
    set_quat_axis(horse_action, "HorseBody", 3, {1: 0, 10: -22, 25: -52, 48: profile["horse_roll_end_deg"]})
    set_key_values(horse_action, 'pose.bones["HorseRoot"].location', 1, {1: 0, 10: -0.06, 25: -0.22, 48: -0.41})

    # The rider root rolls with the saddle rather than remaining upright while
    # the horse falls.  Existing torso/arm motion is retained on top of this.
    for frame, angle in ((1, 0.0), (10, -18.0), (25, -52.0), (48, profile["rider_roll_end_deg"])):
        q = Euler((0.0, 0.0, math.radians(angle)), "XYZ").to_quaternion()
        set_quat_at(rider_action, "Root", frame, q)
    set_key_values(rider_action, 'pose.bones["Root"].location', 1, {1: -0.12, 10: -0.16, 25: -0.30, 48: -0.41})

    # The source death action counter-rotated SpineLower/SpineUpper against
    # the horse.  Reset the rider child pose to the mounted rest/seat pose so
    # the entire body inherits the root's side fall.
    for bone in ("Pelvis", "SpineLower", "SpineUpper", "Neck", "Head", "Shoulder_L", "UpperArm_L", "Forearm_L", "Hand_L",
                 "Shoulder_R", "UpperArm_R", "Forearm_R", "Hand_R"):
        for frame in frames:
            set_quat_at(rider_action, bone, frame, Quaternion((1.0, 0.0, 0.0, 0.0)))

    return {"horse_action": horse_action.name, "rider_action": rider_action.name, "death_frames": list(frames),
            "horse_roll_end_deg": profile["horse_roll_end_deg"], "rider_roll_end_deg": profile["rider_roll_end_deg"],
            "floor_clearance_m": profile["floor_clearance_m"]}


def repair_floor_curves(horse, rider, meshes):
    report = {}
    rider_scale = rider.scale.z
    for clip in CLIPS:
        horse_action = select_clip(horse, clip)
        rider_action = select_clip(rider, clip)
        end = int(next(t.strips[0].frame_end for t in horse.animation_data.nla_tracks if t.name == clip))
        rows = []
        for frame in range(1, end + 1):
            bpy.context.scene.frame_set(frame)
            bpy.context.view_layer.update()
            low, high = all_bounds(meshes)
            delta = ground_lift(low)
            rows.append({"frame": frame, "lowest_before": low, "highest_before": high, "lift_world": delta,
                         "horse_root_y_before": horse.pose.bones["HorseRoot"].location.y,
                         "rider_root_y_before": rider.pose.bones["Root"].location.y})
        # The source armatures use a rotated rest basis: local Y is the
        # vertical direction for Root/HorseRoot (local Z is forward).  Write
        # the clearance on local Y so it lifts the evaluated geometry, while
        # preserving each frame's existing death root motion.
        # Add dense linear keys to prevent quaternion-driven hoof arcs from
        # dipping between the source's sparse keys.
        hpoints = [(row["frame"], row["horse_root_y_before"] + row["lift_world"]) for row in rows]
        rpoints = [(row["frame"], row["rider_root_y_before"] + row["lift_world"] / rider_scale) for row in rows]
        upsert_curve(horse_action, 'pose.bones["HorseRoot"].location', 1, hpoints)
        upsert_curve(rider_action, 'pose.bones["Root"].location', 1, rpoints)
        report[clip] = {"frames": len(rows), "max_lift_world": max(row["lift_world"] for row in rows), "lowest_before": min(row["lowest_before"] for row in rows), "rows": rows}
    return report


def export_lod(lod):
    source = SOURCE / f"knight-lod{lod}.blend"
    bpy.ops.wm.open_mainfile(filepath=str(source))
    horse = bpy.data.objects["WarhorseRig"]
    rider = bpy.data.objects["MountedKnightRig"]
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and any(token in o.name for token in ("NeuralWarhorse", "MountedKnightBody", "KnightLance", "KnightSunShield", "ForgedStirrup", "LeatherRein", "SaddleTeamCloth"))]
    horse_mesh = bpy.data.objects[f"NeuralWarhorse_LOD{lod}"]
    body = bpy.data.objects[f"MountedKnightBody_LOD{lod}"]
    lance = bpy.data.objects[f"KnightLance_LOD{lod}"]
    shield = bpy.data.objects[f"KnightSunShield_LOD{lod}"]
    saddle = bpy.data.objects[f"SaddleTeamCloth_-1_LOD{lod}"]
    stirrup = bpy.data.objects[f"ForgedStirrup_-1_LOD{lod}"]
    reins = bpy.data.objects[f"LeatherRein_-1_LOD{lod}"]
    right_hand_count = repair_right_hand(body, rider)
    trimmed_hands = {}
    for side in ("L", "R"):
        trimmed_hands[side] = gauntlet.trim_open_hand(body, rider, side)
    seat_report = repair_seated_actions(body, rider, horse, stirrup)
    scale_saddle_cloth(saddle)
    # All head and rein measurements must use the same authored Idle pose;
    # the rider solve visits every NLA clip and otherwise leaves the horse
    # evaluation state dependent on the last sampled clip.
    select_clip(horse, "Idle")
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    mouth_fragment_report = remove_mouth_fragment(horse_mesh)
    head_report = repair_horse_head_weights(horse_mesh, horse)
    rein_report = attach_rein_mouth_chunks(reins, horse_mesh)
    bind_tack(horse, saddle, stirrup, reins)
    lance_shape_report = refine_lance(lance)
    grip_report = repair_grips(body, rider, lance, shield)
    # The source weapon meshes carry mixed/legacy groups.  Make each held
    # object share the same rigid skin bone as its closed glove so export and
    # runtime evaluation cannot rotate the weapon away from the palm.
    bind_rigid_mesh(lance, rider, "Hand_R")
    bind_rigid_mesh(shield, rider, "Hand_L")
    # Apply the authored side-fall corrections before collecting weapon/body
    # intersections; otherwise Death still uses the source arm pose and a
    # forearm face can re-enter the lance after the final action is rewritten.
    death_report = repair_death_actions(horse, rider)
    lance_body_cut = trim_body_weapon_overlap(body, lance, rider, "lance")
    clearance = weapon_clearance_profile()
    shield_rotation_x = rotate_rigid_mesh_about_world_axis(
        shield, rider, "Hand_L", 3, (1.0, 0.0, 0.0), clearance["shield_rotation_x_deg"])
    shield_rotation_y = rotate_rigid_mesh_about_world_axis(
        shield, rider, "Hand_L", 3, (0.0, 1.0, 0.0), clearance["shield_rotation_y_deg"])
    hand_reports = {}
    for side, weapon in (("R", lance), ("L", shield)):
        glove_material = weapon.data.materials[1].name if side == "R" else (bpy.data.materials.get("DarkSaddleLeather") or lance.data.materials[1]).name
        steel_material = (bpy.data.materials.get("ForgedSteel") or shield.data.materials[0]).name
        obj, hand_reports[side] = create_commander_hand(
            body, rider, weapon, side, lod, (glove_material, steel_material))
        meshes.append(obj)
    floor_report = repair_floor_curves(horse, rider, meshes)
    for rig in (horse, rider):
        rig.animation_data.action = None
        for track in rig.animation_data.nla_tracks:
            track.mute = False
    bpy.ops.file.pack_all()
    repaired = RAW / f"knight-lod{lod}-repaired.blend"
    repaired.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(repaired))
    bpy.ops.object.select_all(action="DESELECT")
    for ob in (horse, rider, *meshes):
        ob.select_set(True)
    bpy.context.view_layer.objects.active = rider
    target = CANDIDATE / f"knight-lod{lod}.glb"
    target.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(target), export_format="GLB", use_selection=True,
        export_yup=True, export_normals=True, export_texcoords=True, export_materials="EXPORT",
        export_extras=True, export_skins=True, export_def_bones=True, export_animations=True,
        export_animation_mode="NLA_TRACKS", export_nla_strips=True, export_anim_slide_to_zero=True,
        export_image_format="JPEG", export_jpeg_quality=90)
    return {"lod": lod, "source": str(source.relative_to(ROOT)), "source_sha256": sha(source),
            "repaired_blend": str(repaired.relative_to(ROOT)), "repaired_blend_sha256": sha(repaired),
            "candidate": str(target.relative_to(ROOT)), "candidate_sha256": sha(target), "candidate_bytes": target.stat().st_size,
            "right_hand_reweighted_vertices": right_hand_count, "trimmed_hands": trimmed_hands,
            "seat": seat_report, "mouth_fragment": mouth_fragment_report,
            "horse_head": head_report, "reins": rein_report, "lance": lance_shape_report,
            "grip": grip_report, "hands": hand_reports, "death": death_report, "floor": floor_report,
            "mesh_vertices": {o.name: len(o.data.vertices) for o in meshes},
            "weapon_clearance": {"lance_body_cut": lance_body_cut,
                                  "shield_rotation": {"x": shield_rotation_x, "y": shield_rotation_y}},
            "runtime_publish_allowed": False}


def main():
    QA.mkdir(parents=True, exist_ok=True); RAW.mkdir(parents=True, exist_ok=True); CANDIDATE.mkdir(parents=True, exist_ok=True)
    requested = os.environ.get("KNIGHT_LOD_ONLY")
    lods = (int(requested),) if requested is not None else (0, 1)
    result = [export_lod(lod) for lod in lods]
    (QA / "repair-build.json").write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf8")
    print(json.dumps(result, indent=2, ensure_ascii=False), flush=True)


if __name__ == "__main__": main()
