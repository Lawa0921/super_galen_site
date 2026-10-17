"""Build a non-runtime original closed worker-axe grip candidate."""
from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils.bvhtree import BVHTree
from mathutils import Matrix, Quaternion, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from human_units_grip_refine_math import (
    SOURCE_CHANNEL_AXIS, SOURCE_CHANNEL_ORIGIN_M, SOURCE_CHANNEL_RADIUS_M,
    SOURCE_FINGER_SIDE, source_grip_transform_point,
)

from human_units_grip_quality import candidate_failures
from human_units_wrist_fit import fit_wrist_surface
from human_units_candidate_verify import inspect_glb

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "art-factory/rts/runs/human-units/2026-10-05-v1/worker/candidate/worker-production-v1.blend"
LANDMARKS = ROOT / "art-factory/rts/runs/human-units/2026-10-05-v1/worker/qa/landmarks.json"
RUN = ROOT / "art-factory/rts/runs/human-units-grip-refine/2026-10-05/worker/revision-20261006"
GRIP_SOURCE = ROOT / "art-factory/rts/runs/original-guard-grip-local/2026-10-05/candidate/original-guard-grip-local-flip.blend"
GRIP_SOURCE_SHA256 = "3c6350ca9e969eb173ca1b8e015a9826b82222e6ea778d208f658cd6b61a3d94"
GRIP_SOURCE_OBJECT = "OriginalGripLowCandidate"
GRIP_SCALE = 0.55
GRIP_HAFT_RADIUS_M = 0.0135
CUFF_OVERLAP_M = 0.015
EXPECTED_ACTIONS = ("Idle", "Walk", "Attack", "Hurt", "Death")


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def sample_hand_uv(body, target_world):
    if not body.data.uv_layers.active:
        raise RuntimeError("Original body has no UV map")
    material = body.data.materials[0]
    image_node = next((node for node in material.node_tree.nodes if node.type == "TEX_IMAGE" and node.image), None)
    if image_node is None:
        raise RuntimeError("Original skin atlas is unavailable on the body material")
    image = image_node.image
    uv_layer = body.data.uv_layers.active
    hand_group = body.vertex_groups.get("Hand_R")
    if hand_group is None:
        raise RuntimeError("Original body has no Hand_R group for skin UV sampling")
    candidates = []
    for polygon in body.data.polygons:
        center = sum((body.matrix_world @ body.data.vertices[index].co for index in polygon.vertices), Vector()) / len(polygon.vertices)
        distance = (center - target_world).length
        if distance > 0.10:
            continue
        hand_weights = []
        for index in polygon.vertices:
            entry = next((item for item in body.data.vertices[index].groups if item.group == hand_group.index), None)
            hand_weights.append(entry.weight if entry else 0.0)
        if sum(hand_weights) / len(hand_weights) < 0.15:
            continue
        values = [uv_layer.data[index].uv for index in polygon.loop_indices]
        uv = Vector((sum(value.x for value in values) / len(values),
                     sum(value.y for value in values) / len(values)))
        x = min(image.size[0] - 1, max(0, round(uv.x * (image.size[0] - 1))))
        y = min(image.size[1] - 1, max(0, round(uv.y * (image.size[1] - 1))))
        offset = (y * image.size[0] + x) * 4
        rgba = tuple(round(image.pixels[offset + channel] * 255) for channel in range(4))
        if rgba[0] >= 75 and rgba[1] >= 32 and rgba[0] > rgba[1] * 1.12 and rgba[1] > rgba[2] * 0.92:
            candidates.append((distance, -rgba[0], Vector((uv.x, uv.y)), rgba))
    if not candidates:
        raise RuntimeError("Could not locate an original skin-colored Hand_R atlas sample")
    candidates.sort(key=lambda item: (item[0], item[1]))
    distance, _, uv, rgba = candidates[0]
    return uv, rgba, candidates[0][0], image


def trim_original_open_hand(body, wrist_world, cuff_normal_world, cuff_center_world, grip):
    """Cut the old palm on the fitted cuff plane, scoped to the right wrist ROI."""
    normal = Vector(cuff_normal_world).normalized()
    plane_point = Vector(cuff_center_world) - normal * CUFF_OVERLAP_M
    body_inverse = body.matrix_world.inverted()
    local_plane_point = body_inverse @ plane_point
    local_plane_normal = (body.matrix_world.to_3x3().transposed() @ normal).normalized()
    wrist = Vector(wrist_world)
    # Local ROI spans the distal palm and a short proximal forearm collar only.
    roi_radius = 0.145
    distal_extent = 0.185
    proximal_extent = 0.040
    mesh = body.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    selected = []
    for face in bm.faces:
        world_vertices = [body.matrix_world @ vert.co for vert in face.verts]
        sides = [(point - plane_point).dot(normal) for point in world_vertices]
        radial_values = []
        for point, side in zip(world_vertices, sides):
            radial_values.append((point - plane_point - normal * side).length)
        # Include every face actually crossed by the wrist plane within its local disk.
        if min(sides) <= 1e-6 and max(sides) >= -1e-6 and min(radial_values) <= roi_radius:
            selected.append(face)
    if not selected:
        bm.free()
        raise RuntimeError("Wrist-plane ROI did not intersect the original body")
    cut_geom = set(selected)
    for face in selected:
        cut_geom.update(face.verts)
        cut_geom.update(face.edges)
    cut_result = bmesh.ops.bisect_plane(
        bm, geom=list(cut_geom), dist=1e-6,
        plane_co=local_plane_point, plane_no=local_plane_normal,
        clear_inner=False, clear_outer=False, use_snap_center=False)
    # Remove only the distal-side fragments in the same wrist ROI.
    doomed = []
    for face in bm.faces:
        world_center = body.matrix_world @ face.calc_center_median()
        delta = world_center - plane_point
        side = delta.dot(normal)
        radial = (delta - normal * side).length
        if side < -1e-5 and side >= -distal_extent and radial <= roi_radius:
            doomed.append(face)
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    # Cap the newly opened wrist cross-section only; locally weld coincident seam endpoints
    # (the source body has three duplicate-vertex wrist seam chains separated by <=25µm).
    cap_vertices = set()
    for edge in bm.edges:
        if not edge.is_boundary:
            continue
        points = [body.matrix_world @ vert.co for vert in edge.verts]
        if max(abs((point - plane_point).dot(normal)) for point in points) <= 0.002:
            midpoint = (points[0] + points[1]) * 0.5
            delta = midpoint - plane_point
            if (delta - normal * delta.dot(normal)).length <= roi_radius:
                cap_vertices.update(edge.verts)
    if cap_vertices:
        bmesh.ops.remove_doubles(bm, verts=list(cap_vertices), dist=0.00025)
    cap_edges = []
    for edge in bm.edges:
        if not edge.is_boundary:
            continue
        a = body.matrix_world @ edge.verts[0].co
        b = body.matrix_world @ edge.verts[1].co
        if max(abs((a - plane_point).dot(normal)), abs((b - plane_point).dot(normal))) <= 0.002:
            midpoint = (a + b) * 0.5
            delta = midpoint - plane_point
            radial = (delta - normal * delta.dot(normal)).length
            if radial <= roi_radius:
                cap_edges.append(edge)
    filled_faces = bmesh.ops.holes_fill(bm, edges=cap_edges, sides=0).get("faces", [])
    if not filled_faces and cap_edges:
        filled_faces = bmesh.ops.edgenet_fill(bm, edges=cap_edges).get("faces", [])
    remaining_wrist_boundary_edges = sum(1 for edge in cap_edges if edge.is_valid and edge.is_boundary)
    if not filled_faces or remaining_wrist_boundary_edges:
        bm.free()
        raise RuntimeError(f"Original wrist cap failed: {len(filled_faces)} faces, {remaining_wrist_boundary_edges} boundary edges")
    wrist_fit = fit_wrist_surface(bm, body.matrix_world, plane_point, normal, grip)
    cap_boundary_verts = {vert for edge in cap_edges if edge.is_valid for vert in edge.verts}
    cap_surface_verts = {vert for face in filled_faces for vert in face.verts} | cap_boundary_verts
    cap_surface_coords = [body.matrix_world @ vert.co for vert in cap_surface_verts]
    cap_boundary_coords = []
    for vert in cap_boundary_verts:
        point = body.matrix_world @ vert.co
        delta = point - plane_point
        radial = (delta - normal * delta.dot(normal)).length
        cap_boundary_coords.append((point.copy(), radial))
    cap_boundary_radii = [item[1] for item in cap_boundary_coords]
    cap_surface_coords = [body.matrix_world @ vert.co for vert in cap_surface_verts]
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    hand_group = body.vertex_groups.get("Hand_R")
    if hand_group is None:
        raise RuntimeError("Cannot bind the wrist cut boundary: Hand_R group missing")
    cap_ring_vertices = []
    cap_surface_vertices = []
    transition_vertices = []
    forearm_group = body.vertex_groups.get("Forearm_R")
    hand_index = hand_group.index
    transition_length = 0.035
    transition_radius = 0.065
    for vertex in mesh.vertices:
        world = body.matrix_world @ vertex.co
        delta = world - plane_point
        side = delta.dot(normal)
        radial = (delta - normal * side).length
        is_cap_surface = any((world - point).length <= 5e-5 for point in cap_surface_coords)
        is_cap_boundary = any((world - point).length <= 5e-5 for point, _ in cap_boundary_coords)
        if is_cap_surface:
            cap_surface_vertices.append(vertex.index)
            if is_cap_boundary:
                cap_ring_vertices.append(vertex.index)
            # The entire cut cap, including its interior, follows the glove's rigid Hand_R transform.
            for group in body.vertex_groups:
                if group.index != hand_index:
                    group.remove([vertex.index])
            hand_group.add([vertex.index], 1.0, "REPLACE")
        elif 0.0 < side <= transition_length and radial <= transition_radius:
            t = max(0.0, min(1.0, side / transition_length))
            blend = t * t * (3.0 - 2.0 * t)
            old_weights = {entry.group: entry.weight for entry in vertex.groups}
            group_ids = set(old_weights) | {hand_index}
            for group_id in group_ids:
                group = next((item for item in body.vertex_groups if item.index == group_id), None)
                if group is None:
                    continue
                old_weight = old_weights.get(group_id, 0.0)
                new_weight = (1.0 - blend) + old_weight * blend if group_id == hand_index else old_weight * blend
                if new_weight > 1e-7:
                    group.add([vertex.index], new_weight, "REPLACE")
                elif old_weight > 0.0:
                    group.remove([vertex.index])
            transition_vertices.append(vertex.index)
    cap_ring_hand_weights = [
        next((entry.weight for entry in mesh.vertices[index].groups if entry.group == hand_index), 0.0)
        for index in cap_ring_vertices
    ]
    cap_surface_hand_weights = [
        next((entry.weight for entry in mesh.vertices[index].groups if entry.group == hand_index), 0.0)
        for index in cap_surface_vertices
    ]
    return {
        "method": "localized cuff-plane bisect in REST-space; distal side removed; ring weighted rigidly to Hand_R and wrist cross-section capped",
        "plane_point_world_m": list(plane_point),
        "plane_normal_world": list(normal),
        "roi_radial_m": roi_radius,
        "distal_extent_m": distal_extent,
        "proximal_extent_m": proximal_extent,
        "removed_distal_faces": len(doomed),
        "cap_edges": len(cap_edges),
        "cap_faces": len(filled_faces),
        "remaining_wrist_boundary_edges": remaining_wrist_boundary_edges,
        "local_seam_weld_tolerance_m": 0.00025,
        "wrist_surface_fit": wrist_fit,
        "cap_surface_vertices_weighted_to_Hand_R": len(cap_surface_vertices),
        "cap_surface_hand_weight_min": min(cap_surface_hand_weights) if cap_surface_hand_weights else 0.0,
        "cap_surface_hand_weight_max": max(cap_surface_hand_weights) if cap_surface_hand_weights else 0.0,
        "cap_ring_vertices_weighted_to_Hand_R": len(cap_ring_vertices),
        "cap_ring_hand_weight_min": min(cap_ring_hand_weights) if cap_ring_hand_weights else 0.0,
        "cap_ring_hand_weight_max": max(cap_ring_hand_weights) if cap_ring_hand_weights else 0.0,
        "cap_boundary_radius_min_m": min(cap_boundary_radii) if cap_boundary_radii else 0.0,
        "cap_boundary_radius_max_m": max(cap_boundary_radii) if cap_boundary_radii else 0.0,
        "cap_boundary_radius_mean_m": sum(cap_boundary_radii) / len(cap_boundary_radii) if cap_boundary_radii else 0.0,
        "proximal_weight_transition_vertices": len(transition_vertices),
        "proximal_weight_transition_length_m": transition_length,
        "proximal_weight_transition_radial_m": transition_radius,
        "transition_weight_method": "smoothstep interpolation from rigid Hand_R at plane to original forearm/arm weights over 35mm",
        "remaining_faces": len(mesh.polygons),
        "runtime_publish_allowed": False,
    }


def source_hand_mesh():
    if sha(GRIP_SOURCE) != GRIP_SOURCE_SHA256:
        raise RuntimeError("Original grip source SHA-256 mismatch")
    with bpy.data.libraries.load(str(GRIP_SOURCE), link=False) as (data_from, data_to):
        if GRIP_SOURCE_OBJECT not in data_from.objects:
            raise RuntimeError("Approved original grip source object is missing")
        data_to.objects = [GRIP_SOURCE_OBJECT]
    obj = next((item for item in data_to.objects if item and item.type == "MESH"), None)
    if obj is None:
        raise RuntimeError("Original grip source did not load as a mesh")
    mesh = obj.data.copy()
    bpy.data.objects.remove(obj, do_unlink=True)
    return mesh


def topology_stats(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    edges = list(bm.edges)
    boundary = sum(1 for edge in edges if len(edge.link_faces) == 1)
    nonmanifold = sum(1 for edge in edges if len(edge.link_faces) != 2)
    unseen = set(bm.verts)
    components = 0
    while unseen:
        components += 1
        stack = [unseen.pop()]
        while stack:
            vertex = stack.pop()
            for edge in vertex.link_edges:
                other = edge.other_vert(vertex)
                if other in unseen:
                    unseen.remove(other)
                    stack.append(other)
    bm.free()
    return {"components": components, "open_boundary_edges": boundary, "nonmanifold_edges": nonmanifold}


SOURCE_WRIST_CAP_CENTER = Vector((-0.0926789895554, -0.0120840780013, 0.0739744958270))
SOURCE_WRIST_CAP_NORMAL = Vector((-0.9189973812065, -0.1528174345587, -0.3634427672007))
CUFF_SHORTEN_M = 0.047


def shorten_cuff(mesh, distance_m=CUFF_SHORTEN_M):
    """Cut back only the oversized source sleeve and close the new cuff plane."""
    bm = bmesh.new()
    bm.from_mesh(mesh)
    point = SOURCE_WRIST_CAP_CENTER - SOURCE_WRIST_CAP_NORMAL * distance_m
    result = bmesh.ops.bisect_plane(
        bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
        dist=1e-6, plane_co=point, plane_no=SOURCE_WRIST_CAP_NORMAL,
        clear_inner=False, clear_outer=True, use_snap_center=False,
    )
    boundary = [edge for edge in bm.edges if edge.is_boundary]
    if not boundary:
        bm.free()
        raise RuntimeError("Cuff shortening did not create a boundary loop")
    cap_vertices = sorted({vert for edge in boundary for vert in edge.verts}, key=lambda vert: vert.index)
    cap_center = sum((vert.co for vert in cap_vertices), Vector()) / len(cap_vertices)
    bmesh.ops.holes_fill(bm, edges=boundary, sides=0)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    return cap_center, {"distance_m": distance_m, "boundary_vertices": len(cap_vertices),
                        "topology": topology_stats(mesh)}


def make_grip(arm, body, shaft_center_world, wrist_world, elbow_world, shaft_radius):
    mesh = source_hand_mesh()
    original_points = [v.co.copy() for v in mesh.vertices]
    mesh.calc_loop_triangles()
    source_triangle_count = len(mesh.loop_triangles)
    cap_center, cuff_record = shorten_cuff(mesh)
    cap_normal = SOURCE_WRIST_CAP_NORMAL.normalized()
    forearm_axis = (elbow_world - wrist_world).normalized()
    cap_rotation = cap_normal.rotation_difference(forearm_axis)
    finger_side = cap_rotation @ Vector(SOURCE_FINGER_SIDE).normalized()
    front = Vector((0.0, 1.0, 0.0))
    finger_plane = finger_side - forearm_axis * finger_side.dot(forearm_axis)
    front_plane = front - forearm_axis * front.dot(forearm_axis)
    if finger_plane.length < 1e-6 or front_plane.length < 1e-6:
        raise RuntimeError("Anatomical hand roll has a degenerate front projection")
    finger_plane.normalize()
    front_plane.normalize()
    roll = math.atan2(forearm_axis.dot(finger_plane.cross(front_plane)), finger_plane.dot(front_plane))
    rotation = Quaternion(forearm_axis, roll) @ cap_rotation
    mapped_cap = Vector(wrist_world) + forearm_axis * CUFF_OVERLAP_M
    mapped_cap_normal = rotation @ cap_normal
    channel_center = mapped_cap + rotation @ ((Vector(SOURCE_CHANNEL_ORIGIN_M) - cap_center) * GRIP_SCALE)
    shaft_axis_world = (rotation @ Vector(SOURCE_CHANNEL_AXIS)).normalized()
    for vertex in mesh.vertices:
        vertex.co = mapped_cap + rotation @ ((vertex.co - cap_center) * GRIP_SCALE)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    temp = bpy.data.objects.new("WorkerOriginalGripDecimateTemp", mesh)
    bpy.context.collection.objects.link(temp)
    # Source is already watertight; avoid vertex welding, which damages narrow finger seams.
    dec = temp.modifiers.new("OriginalHandBudget", "DECIMATE")
    dec.decimate_type = "COLLAPSE"
    dec.ratio = 0.25
    dec.use_collapse_triangulate = False
    bpy.context.view_layer.objects.active = temp
    temp.select_set(True)
    bpy.ops.object.modifier_apply(modifier=dec.name)
    temp.select_set(False)
    grip = temp
    grip.name = "WorkerOriginalGrip_LOD0"
    grip.data.name = "WorkerOriginalGripMesh_LOD0"
    grip.parent = arm
    grip.matrix_parent_inverse = Matrix.Identity(4)
    grip.matrix_basis = Matrix.Identity(4)
    inv_arm = arm.matrix_world.inverted()
    for vertex in grip.data.vertices:
        vertex.co = inv_arm @ vertex.co
    for poly in grip.data.polygons:
        poly.use_smooth = True
        poly.material_index = 0
    leather = bpy.data.materials.get("WornLeatherGrip")
    if leather is None:
        raise RuntimeError("Worker original WornLeatherGrip material is missing")
    grip.data.materials.clear()
    grip.data.materials.append(leather)
    group = grip.vertex_groups.new(name="Hand_R")
    group.add(list(range(len(grip.data.vertices))), 1.0, "REPLACE")
    skin = grip.modifiers.new("WorkerHand_R_Skin", "ARMATURE")
    skin.object = arm
    grip.data.calc_loop_triangles()

    metadata = {
        "source_object": GRIP_SOURCE_OBJECT,
        "source_mesh": "OriginalGripLocalRepairMesh",
        "grip_source_blend": str(GRIP_SOURCE),
        "grip_source_sha256": GRIP_SOURCE_SHA256,
        "source_bounds_local_m": [[min(v[i] for v in original_points) for i in range(3)],
                                  [max(v[i] for v in original_points) for i in range(3)]],
        "source_triangles": source_triangle_count,
        "triangles": len(grip.data.loop_triangles),
        **topology_stats(grip.data),
        "nominal_source_channel_radius_m": SOURCE_CHANNEL_RADIUS_M * GRIP_SCALE,
        "nominal_channel_clearance_m": SOURCE_CHANNEL_RADIUS_M * GRIP_SCALE - shaft_radius,
        "scale": GRIP_SCALE,
        "shaft_center_world_m": list(channel_center),
        "shaft_axis_world": list(shaft_axis_world),
        "source_wrist_cap_center_m": list(cap_center),
        "source_wrist_cap_normal": list(cap_normal),
        "wrist_cap_world_after_rigid_map_m": list(mapped_cap),
        "wrist_cap_normal_after_rigid_map": list(mapped_cap_normal),
        "wrist_target_world_m": list(wrist_world),
        "wrist_cap_to_bone_distance_m": CUFF_OVERLAP_M,
        "wrist_cap_offset_into_forearm_m": CUFF_OVERLAP_M,
        "forearm_axis_world": list(forearm_axis),
        "roll_to_front_degrees": math.degrees(roll),
        "cuff_shortening": cuff_record,
        "wrist_fit_method": "source cuff cap to Hand_R wrist; cap normal aligned to Forearm_R direction; haft axis derived from same rigid anatomical transform",
        "material": leather.name,
        "runtime_publish_allowed": False,
    }
    metadata["lod1_triangles"] = metadata["triangles"]
    return grip, None, metadata


def reorient_axe_with_grip(axe, old_center, new_center, new_axis, target_radius):
    axe.data = axe.data.copy()
    original_radius = 0.019
    radial_scale = target_radius / original_radius
    axis = Vector((0.0, 0.0, 1.0))
    orientation = axis.rotation_difference(new_axis.normalized())
    matrix_world = axe.matrix_world.copy()
    inverse_world = matrix_world.inverted()
    resized_vertices = 0
    for vertex in axe.data.vertices:
        world = matrix_world @ vertex.co
        offset = world - old_center
        axial = offset.dot(axis)
        radial = offset - axis * axial
        if abs(axial) <= 0.16 and radial.length <= 0.032:
            world = old_center + axis * axial + radial * radial_scale
            resized_vertices += 1
        world = new_center + orientation @ (world - old_center)
        vertex.co = inverse_world @ world
    axe.data.update()
    return {
        "old_channel_center_m": list(old_center),
        "new_channel_center_m": list(new_center),
        "new_shaft_axis_world": list(new_axis.normalized()),
        "original_haft_radius_m": original_radius,
        "target_haft_radius_m": target_radius,
        "cross_section_scale": radial_scale,
        "resize_axial_range_m": [-0.16, 0.16],
        "resized_vertices": resized_vertices,
        "rigid_transform": True,
    }


def duplicate_grip_lod1(grip, arm, ratio=0.62):
    lod1 = grip.copy()
    lod1.data = grip.data.copy()
    lod1.name = "WorkerOriginalGrip_LOD1"
    lod1.data.name = "WorkerOriginalGripMesh_LOD1"
    bpy.context.collection.objects.link(lod1)
    dec = lod1.modifiers.new("WorkerHand_LOD1Budget", "DECIMATE")
    dec.decimate_type = "COLLAPSE"
    dec.ratio = ratio
    dec.use_collapse_triangulate = False
    bpy.context.view_layer.objects.active = lod1
    bpy.ops.object.select_all(action="DESELECT")
    lod1.select_set(True)
    # Keep the armature modifier after decimation so the low mesh remains skinned.
    armature_mods = [mod for mod in lod1.modifiers if mod.type == "ARMATURE"]
    for _ in range(len(lod1.modifiers)):
        if lod1.modifiers[0] == dec:
            break
        bpy.ops.object.modifier_move_up(modifier=dec.name)
    bpy.ops.object.modifier_apply(modifier=dec.name)
    lod1.select_set(False)
    lod1.data.calc_loop_triangles()
    stats = topology_stats(lod1.data)
    if stats["components"] != 1 or stats["open_boundary_edges"] != 0 or stats["nonmanifold_edges"] != 0:
        raise RuntimeError("Worker LOD1 fist decimation damaged the grip topology: " + json.dumps(stats))
    return lod1, {"triangles": len(lod1.data.loop_triangles), "ratio": ratio, **stats}


def export_lod_bundle(filepath, arm, meshes):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [arm] + list(meshes):
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(filepath=str(filepath), export_format="GLB",
                              use_selection=True, export_animations=True,
                              export_cameras=False, export_lights=False)
    bpy.ops.object.select_all(action="DESELECT")


def rigid_to_bone(obj, bone_name):
    if obj.parent and obj.parent.type == "ARMATURE" and obj.parent_type == "BONE" and obj.parent_bone == bone_name:
        return True
    group = obj.vertex_groups.get(bone_name)
    if group is None:
        return False
    index = group.index
    return all(any(entry.group == index and abs(entry.weight - 1.0) <= 1e-5 for entry in vertex.groups)
               for vertex in obj.data.vertices)


def shaft_channel_profile(obj, world_center, shaft_radius, axis):
    bins = []
    axis = Vector(axis).normalized()
    for step in range(-6, 11):
        axial_target = step * 0.01
        radii = []
        for vertex in obj.data.vertices:
            world = obj.matrix_world @ vertex.co
            delta = world - world_center
            axial = delta.dot(axis)
            radial = (delta - axis * axial).length
            if abs(axial - axial_target) <= 0.006:
                radii.append(radial)
        if radii:
            bins.append({"axial_offset_m": axial_target, "min_surface_radius_m": min(radii), "vertex_count": len(radii)})
    collision = any(item["min_surface_radius_m"] < shaft_radius - 0.0005 for item in bins)
    return {"axis": list(axis), "bin_half_width_m": 0.006, "bins": bins,
            "sampled_collision": collision, "shaft_radius_m": shaft_radius}


def bone_weight_near(obj, bone_name, world_point, radius=0.028):
    group = obj.vertex_groups.get(bone_name)
    if group is None:
        return {"vertex_count": 0, "min_weight": 0.0, "mean_weight": 0.0}
    selected = []
    for vertex in obj.data.vertices:
        world = obj.matrix_world @ vertex.co
        if (world - world_point).length > radius:
            continue
        entry = next((item for item in vertex.groups if item.group == group.index), None)
        selected.append(entry.weight if entry else 0.0)
    if not selected:
        return {"vertex_count": 0, "min_weight": 0.0, "mean_weight": 0.0}
    return {"vertex_count": len(selected), "min_weight": min(selected),
            "mean_weight": sum(selected) / len(selected)}


def set_action(arm, name, frame):
    action = bpy.data.actions.get(name)
    if action is None:
        raise RuntimeError("Missing original action " + name)
    arm.animation_data.action = action
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()


def aim_camera(camera, location, target):
    camera.location = location
    camera.rotation_euler = (Vector(target) - Vector(location)).to_track_quat("-Z", "Y").to_euler()


def setup_render(scene, target, distance):
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new("GripReviewWorld")
    scene.world.color = (0.045, 0.055, 0.065)
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.exposure = -1.0
    bpy.ops.object.camera_add(location=(target.x, target.y + distance, target.z))
    camera = bpy.context.object
    camera.name = "GripReviewCamera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 0.27
    aim_camera(camera, camera.location, target)
    scene.camera = camera
    for name, offset, power, size in (
        ("GripKey", Vector((0.25, 0.35, 0.40)), 55, 0.40),
        ("GripFill", Vector((-0.32, 0.22, 0.10)), 20, 0.35),
        ("GripRim", Vector((0.20, -0.25, 0.30)), 35, 0.32),
    ):
        bpy.ops.object.light_add(type="AREA", location=target + offset)
        light = bpy.context.object
        light.name = name
        light.data.energy = power
        light.data.shape = "DISK"
        light.data.size = size
        aim_camera(light, light.location, target)
    return camera


def add_anchor_markers(scene, metadata):
    points = [
        ("GripAnchorMarkerChannel", Vector(metadata["shaft_center_world_m"]), (0.05, 0.25, 1.0, 1.0)),
        ("GripAnchorMarkerSourceCap", Vector(metadata["wrist_cap_world_after_rigid_map_m"]), (1.0, 0.7, 0.05, 1.0)),
        ("GripAnchorMarkerBoneWrist", Vector(metadata["wrist_target_world_m"]), (0.05, 1.0, 0.25, 1.0)),
    ]
    for name, location, color in points:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.008, location=location)
        marker = bpy.context.object
        marker.name = name
        mat = bpy.data.materials.new(name + "Emission")
        mat.diffuse_color = color
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Emission Color"].default_value = color
        bsdf.inputs["Emission Strength"].default_value = 1.5
        marker.data.materials.append(mat)


def render_review(scene, arm, target_world, qa):
    scene.render.resolution_percentage = 100
    camera = scene.camera
    for label, action, frame, view in (
        ("front", "Idle", 0, Vector((0.0, 0.9, 0.0))),
        ("side", "Idle", 0, Vector((0.9, 0.0, 0.0))),
        ("rest", "Idle", 0, Vector((0.0, 0.9, 0.0))),
        ("walk", "Walk", 20, Vector((0.0, 0.9, 0.0))),
        ("attack", "Attack", 13, Vector((0.0, 0.9, 0.0))),
    ):
        set_action(arm, action, frame)
        camera.location = target_world + view * 0.78 + Vector((0.0, 0.0, 0.025))
        aim_camera(camera, camera.location, target_world)
        scene.render.filepath = str(qa / ("worker-grip-" + label + ".png"))
        bpy.ops.render.render(write_still=True)


def main():
    if not SOURCE.is_file() or not LANDMARKS.is_file():
        raise FileNotFoundError("Published worker source blend or landmark record is missing")
    source_sha = sha(SOURCE)
    landmarks = json.loads(LANDMARKS.read_text(encoding="utf-8"))
    body_landmarks = landmarks["landmarks"]
    bones = body_landmarks["bones"]
    wrist = Vector(bones["Hand_R"][0])
    tip = Vector(bones["Hand_R"][1])
    grip_center = wrist.lerp(tip, 0.58)
    grip_center.x -= body_landmarks["height_m"] * 0.037
    grip_center.y += 0.015
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    scene = bpy.context.scene
    arm = bpy.data.objects.get("workerRig20")
    body = bpy.data.objects.get("workerOriginalBody_LOD0")
    body_lod1 = bpy.data.objects.get("workerOriginalBody_LOD1")
    axe = bpy.data.objects.get("WorkerCraftAxe_LOD0")
    axe_lod1 = bpy.data.objects.get("WorkerCraftAxe_LOD1")
    if arm is None or body is None or body_lod1 is None or axe is None or axe_lod1 is None:
        raise RuntimeError("Original source blend is missing one of the worker LOD bodies/axes or the 20-joint rig")
    for action in EXPECTED_ACTIONS:
        if bpy.data.actions.get(action) is None:
            raise RuntimeError("Original 5-clip set is incomplete: " + action)
    arm.data.pose_position = "REST"
    set_action(arm, "Idle", 0)
    bpy.context.view_layer.update()
    landmark_wrist = wrist.copy()
    rest_wrist = arm.matrix_world @ arm.data.bones["Hand_R"].head_local
    wrist_rest_delta = (rest_wrist - landmark_wrist).length
    if wrist_rest_delta > 0.002:
        wrist = rest_wrist
        grip_center += wrist - landmark_wrist
    rest_elbow = arm.matrix_world @ arm.data.bones["Forearm_R"].head_local
    RUN.joinpath("candidate").mkdir(parents=True, exist_ok=True)
    qa = RUN / "qa"
    qa.mkdir(parents=True, exist_ok=True)
    elbow = rest_elbow
    grip, low, metadata = make_grip(arm, body, grip_center, wrist, elbow, shaft_radius=GRIP_HAFT_RADIUS_M)
    grip_lod1, grip_lod1_record = duplicate_grip_lod1(grip, arm, ratio=0.30)
    fitted_grip_center = Vector(metadata["shaft_center_world_m"])
    fitted_shaft_axis = Vector(metadata["shaft_axis_world"])
    metadata["axe_rigid_fit"] = reorient_axe_with_grip(
        axe, grip_center, fitted_grip_center, fitted_shaft_axis, GRIP_HAFT_RADIUS_M)
    metadata["axe_lod1_rigid_fit"] = reorient_axe_with_grip(
        axe_lod1, grip_center, fitted_grip_center, fitted_shaft_axis, GRIP_HAFT_RADIUS_M)
    # Candidate-only body copies: cut both LODs on the exact same REST-space wrist plane.
    body.data = body.data.copy()
    body_lod1.data = body_lod1.data.copy()
    trim_record = trim_original_open_hand(
        body, wrist, metadata["wrist_cap_normal_after_rigid_map"],
        metadata["wrist_cap_world_after_rigid_map_m"], grip)
    trim_lod1_record = trim_original_open_hand(
        body_lod1, wrist, metadata["wrist_cap_normal_after_rigid_map"],
        metadata["wrist_cap_world_after_rigid_map_m"], grip_lod1)
    metadata["original_open_hand_trim"] = trim_record
    metadata["original_open_hand_trim_lod1"] = trim_lod1_record
    metadata["grip_lod1"] = {"object": grip_lod1.name, **grip_lod1_record}
    metadata["lod1_triangles"] = grip_lod1_record["triangles"]
    metadata["rest_space_validation"] = {
        "pose_position_during_construction": "REST",
        "landmark_wrist_world_m": list(landmark_wrist),
        "rest_hand_head_world_m": list(rest_wrist),
        "landmark_to_rest_wrist_distance_m": wrist_rest_delta,
        "used_rest_bone_wrist": wrist_rest_delta > 0.002,
        "rest_forearm_head_world_m": list(rest_elbow),
        "trim_and_grip_same_rest_space": True,
    }
    metadata["shaft_channel_profile"] = shaft_channel_profile(grip, fitted_grip_center,
                                                               GRIP_HAFT_RADIUS_M, fitted_shaft_axis)
    metadata["shaft_intersection"] = metadata["shaft_channel_profile"]["sampled_collision"]
    metadata.update({
        "unit": "worker",
        "source_blend": str(SOURCE),
        "source_blend_sha256": source_sha,
        "source_sha256": source_sha,
        "source_body_material": body.data.materials[0].name,
        "source_axe_object": axe.name,
        "rig": arm.name,
        "bone": "Hand_R",
        "shared_weapon_bone": "Hand_R",
        "grip_center_m": list(fitted_grip_center),
        "required_clips": list(EXPECTED_ACTIONS),
        "pose_lock": "grip and axe both rigidly weighted to Hand_R; no independent hand translation is keyed",
        "runtime_publish_allowed": False,
    })
    # Restore the editable animated rig after constructing all geometry in rest coordinates.
    arm.data.pose_position = "POSE"
    bpy.context.view_layer.update()
    # Both LODs' axe and grip follow the same hand joint.
    metadata["axe_hand_rigid_weight"] = bone_weight_near(axe, "Hand_R", fitted_grip_center)
    metadata["grip_hand_rigid_weight"] = rigid_to_bone(grip, "Hand_R")
    metadata["axe_hand_rigid_weight_lod1"] = bone_weight_near(axe_lod1, "Hand_R", fitted_grip_center)
    metadata["grip_hand_rigid_weight_lod1"] = rigid_to_bone(grip_lod1, "Hand_R")
    metadata["same_bone_transform_guarantees_no_detach"] = (
        metadata["axe_hand_rigid_weight"]["vertex_count"] > 0 and
        metadata["axe_hand_rigid_weight"]["min_weight"] >= 0.999 and metadata["grip_hand_rigid_weight"] and
        metadata["axe_hand_rigid_weight_lod1"]["vertex_count"] > 0 and
        metadata["axe_hand_rigid_weight_lod1"]["min_weight"] >= 0.999 and metadata["grip_hand_rigid_weight_lod1"]
    )
    if not metadata["same_bone_transform_guarantees_no_detach"]:
        raise RuntimeError("LOD0/LOD1 axe-hand contact bind check failed: " + json.dumps({
            "axe_lod0": metadata["axe_hand_rigid_weight"], "grip_lod0": metadata["grip_hand_rigid_weight"],
            "axe_lod1": metadata["axe_hand_rigid_weight_lod1"], "grip_lod1": metadata["grip_hand_rigid_weight_lod1"]
        }))
    # Keep the editable blend with both LODs; render one LOD at a time and export exact bundles.
    body_lod1.hide_render = True
    axe_lod1.hide_render = True
    grip_lod1.hide_render = True
    setup_render(scene, fitted_grip_center, 0.78)
    blend = RUN / "candidate/worker-grip-refine.blend"
    lod0_glb = RUN / "candidate/worker-grip-refine-lod0.glb"
    lod1_glb = RUN / "candidate/worker-grip-refine-lod1.glb"
    glb = lod0_glb
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    export_lod_bundle(lod0_glb, arm, [body, axe, grip])
    export_lod_bundle(lod1_glb, arm, [body_lod1, axe_lod1, grip_lod1])
    render_review(scene, arm, fitted_grip_center, qa)
    set_action(arm, "Idle", 0)
    mid_target = (wrist + elbow + fitted_grip_center) / 3.0
    scene.camera.data.ortho_scale = 0.88
    scene.camera.location = mid_target + Vector((0.0, 1.65, 0.0))
    aim_camera(scene.camera, scene.camera.location, mid_target)
    scene.render.filepath = str(qa / "worker-grip-mid.png")
    bpy.ops.render.render(write_still=True)
    scene.camera.data.ortho_scale = 0.27
    add_anchor_markers(scene, metadata)
    set_action(arm, "Idle", 0)
    scene.camera.location = fitted_grip_center + Vector((0.0, 0.9, 0.0))
    aim_camera(scene.camera, scene.camera.location, fitted_grip_center)
    scene.render.filepath = str(qa / "worker-grip-anchor-derivation.png")
    bpy.ops.render.render(write_still=True)
    for marker in [obj for obj in scene.objects if obj.name.startswith("GripAnchorMarker")]:
        bpy.data.objects.remove(marker, do_unlink=True)
    scene.render.filepath = ""
    clip_pose_records = {}
    for clip, frame in (("Idle", 0), ("Walk", 20), ("Attack", 13)):
        set_action(arm, clip, frame)
        clip_pose_records[clip] = {
            "frame": frame,
            "grip_bone": "Hand_R",
            "axe_bone": "Hand_R",
            "same_rigid_transform": metadata["axe_hand_rigid_weight"],
            "grip_nominal_channel_clearance_m": metadata["nominal_channel_clearance_m"],
            "sampled_shaft_intersection": metadata["shaft_intersection"],
        }
    source_after = sha(SOURCE)
    exported = {lod: inspect_glb(path, "worker") for lod, path in ((0, lod0_glb), (1, lod1_glb))}
    metadata["exported_triangles"] = {f"lod{lod}": row["triangle_count"] for lod, row in exported.items()}
    report = {
        **metadata,
        "status": "candidate_pending_root_visual_review",
        "source_unchanged": source_sha == source_after,
        "source_sha256_after": source_after,
        "candidate_blend_sha256": sha(blend),
        "candidate_glb_sha256": sha(glb),
        "candidate_blend": str(blend),
        "candidate_glb": str(glb),
        "glbs": {
            "lod0": {"path": str(lod0_glb), "sha256": sha(lod0_glb), "clips": list(EXPECTED_ACTIONS)},
            "lod1": {"path": str(lod1_glb), "sha256": sha(lod1_glb), "clips": list(EXPECTED_ACTIONS)},
        },
        "renders": {path.name: sha(path) for path in qa.glob("worker-grip-*.png")},
        "clip_pose_records": clip_pose_records,
        "qa_pass": metadata["components"] == 1 and metadata["open_boundary_edges"] == 0 and
                   metadata["nonmanifold_edges"] == 0 and metadata["same_bone_transform_guarantees_no_detach"] and
                   not metadata["shaft_intersection"] and
                   source_sha == source_after,
    }
    report["failures"] = candidate_failures(report)
    report["qa_pass"] = not report["failures"]
    (qa / "grip-refine.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n")
    print("HUMAN_UNITS_GRIP_REFINE=" + json.dumps({
        "status": report["status"],
        "qa_pass": report["qa_pass"],
        "triangles": report["triangles"],
        "lod1_triangles": report["lod1_triangles"],
        "render_count": len(report["renders"]),
        "runtime_publish_allowed": False,
    }))
    if not report["qa_pass"]:
        raise RuntimeError("Grip candidate failed structural or shared-bone QA")


if __name__ == "__main__":
    main()
