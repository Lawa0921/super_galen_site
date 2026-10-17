"""Build a review-only, source-derived original kingdom guard assembly."""
import bpy
import bmesh
import hashlib
import json
import math
import sys
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion

sys.path.insert(0, str(Path(__file__).resolve().parent))

from original_guard_assembly_math import (
    body_weights_for_point, inner_layer_weights_for_point, motion_extras, old_arm_residual_face,
    primary_bone_for_point, replaced_front_tabard_face, fit_leg_profile_radii,
    shoulder_cut_fragment_face,
    validate_contact_metrics, validate_source_bounds, tabard_drape_fraction,
    leg_armor_patch_for_face, replace_source_leg_shell_face,
    rigid_leg_armor_bone, boot_heading_yaw_degrees,
)
from original_guard_motion_spec import CLIP_DURATIONS_S, ATTACK_CONTACT_S

FPS = 30
ARMATURE_NAME = "GuardRig20"
BODY_NAMES = ("GuardBody_LOD0", "GuardBody_LOD1")
WEAPON_NAMES = ("KingdomSteelSword_LOD0", "KingdomSunShield_LOD0",
                "KingdomSteelSword_LOD1", "KingdomSunShield_LOD1")


def sha256(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def link_shape_mesh(shape_path):
    with bpy.data.libraries.load(str(shape_path), link=False) as (source, target):
        if "HunyuanCandidate_00" not in source.objects:
            raise ValueError("Hunyuan shape blend is missing HunyuanCandidate_00")
        target.objects = ["HunyuanCandidate_00"]
    obj = target.objects[0]
    bpy.context.scene.collection.objects.link(obj)
    obj.name = "GuardBody_SourceDerived"
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # Match the authored source's 1.8m form to the 1.86m GuardRig20 canonical height.
    obj.data.transform(Matrix.Scale(1.86 / 1.8, 4))
    bpy.context.view_layer.update()
    return obj


def make_material(name, image_path, metalness, roughness):
    image = bpy.data.images.load(str(image_path), check_existing=True)
    image.pack()
    material = bpy.data.materials.new(name)
    material.diffuse_color = (0.24, 0.28, 0.34, 1.0)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    texcoord = nodes.new("ShaderNodeTexCoord")
    image_node = nodes.new("ShaderNodeTexImage")
    image_node.image = image
    image_node.interpolation = "Linear"
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.inputs["Metallic"].default_value = metalness
    principled.inputs["Roughness"].default_value = roughness
    output = nodes.new("ShaderNodeOutputMaterial")
    material.node_tree.links.new(texcoord.outputs["UV"], image_node.inputs["Vector"])
    # Keep a glTF-exportable image-texture-to-baseColor chain.
    material.node_tree.links.new(image_node.outputs["Color"], principled.inputs["Base Color"])
    material.node_tree.links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    return material


def add_uv_and_semantic_materials(mesh_obj, steel, cloth, leather, brass):
    mesh = mesh_obj.data
    mesh.materials.clear()
    for material in (steel, cloth, leather, brass):
        mesh.materials.append(material)
    for poly in mesh.polygons:
        center = poly.center
        z, x, y = center.z, center.x, center.y
        # Keep the source body in steel/leather semantic regions; cloth is a real
        # separately authored tabard, never assigned triangle-by-triangle by width.
        if z < 0.18:
            poly.material_index = 2
        else:
            poly.material_index = 0
        poly.use_smooth = True
    mesh.update()


def weld_source_triangles(source_obj, distance=1e-5):
    bm = bmesh.new()
    bm.from_mesh(source_obj.data)
    before = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=distance)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(source_obj.data)
    bm.free()
    source_obj.data.update()
    return {"vertices_before": before, "vertices_after": len(source_obj.data.vertices), "merge_distance_m": distance}


def trim_source_regions(source_obj):
    bm = bmesh.new()
    bm.from_mesh(source_obj.data)
    faces_to_remove = []
    counts = {"head_neck": 0, "arms": 0, "arm_underlayer_preserved": 0, "front_tabard": 0, "old_arm_residual": 0, "shoulder_cut": 0, "leg_shell_replaced": 0}
    for face in bm.faces:
        center = face.calc_center_median()
        x, y, z = center.x, center.y, center.z
        if z > 1.50 and abs(x) < 0.19 and -0.20 < y < 0.20:
            counts["head_neck"] += 1
            faces_to_remove.append(face)
            continue
        if old_arm_residual_face(x, y, z):
            counts["old_arm_residual"] += 1
            faces_to_remove.append(face)
            continue
        if shoulder_cut_fragment_face(x, y, z):
            counts["shoulder_cut"] += 1
            faces_to_remove.append(face)
            continue
        # Remove the old exposed arm shell along its source-axis corridor. Keep
        # the torso-side padded axilla underlayer inside x=.30 so the new closed
        # sleeve overlaps a continuous trunk surface instead of a punched hole.
        if 0.60 < z < 1.53 and abs(x) > 0.22 and abs(x) < 0.48:
            side = -1.0 if x < 0 else 1.0
            axis_start = Vector((side * 0.265, 0.0, 1.405))
            axis_end = Vector((side * 0.422, 0.025, 0.835))
            if segment_distance(center, axis_start, axis_end) < 0.115:
                # Preserve the complete torso-side axilla volume, including
                # measured front/back bare rims, under the approved closed arm.
                if z > 1.20 and abs(x) <= 0.34 and -0.12 <= y <= 0.16:
                    counts["arm_underlayer_preserved"] += 1
                    continue
                counts["arms"] += 1
                faces_to_remove.append(face)
                continue
        if replace_source_leg_shell_face(x, y, z):
            counts["leg_shell_replaced"] += 1
            faces_to_remove.append(face)
            continue
        if replaced_front_tabard_face(x, y, z):
            counts["front_tabard"] += 1
            faces_to_remove.append(face)
    if faces_to_remove:
        bmesh.ops.delete(bm, geom=faces_to_remove, context="FACES")
        loose_edges = [edge for edge in bm.edges if not edge.link_faces]
        if loose_edges:
            bmesh.ops.delete(bm, geom=loose_edges, context="EDGES")
        loose_verts = [vert for vert in bm.verts if not vert.link_edges]
        if loose_verts:
            bmesh.ops.delete(bm, geom=loose_verts, context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(source_obj.data)
    bm.free()
    source_obj.data.update()
    return counts


def extract_reoriented_boots(source_obj, armature, leather):
    """Separate source boot shells, align toes toward +Y about measured cuff centers."""
    bm = bmesh.new()
    bm.from_mesh(source_obj.data)
    by_side = {"R": [], "L": []}
    removed = []
    for face in bm.faces:
        center = face.calc_center_median()
        if center.z > 0.18 or abs(center.x) < 0.075 or abs(center.x) > 0.39:
            continue
        side = "L" if center.x < 0 else "R"
        by_side[side].append(face)
        removed.append(face)
    result = []
    report = {}
    for side, source_faces in by_side.items():
        if len(source_faces) < 20:
            bm.free()
            raise ValueError("source boot extraction too small for {}: {}".format(side, len(source_faces)))
        vertex_map, coords, faces = {}, [], []
        for face in source_faces:
            face_indices = []
            for vert in face.verts:
                if vert.index not in vertex_map:
                    vertex_map[vert.index] = len(coords)
                    coords.append(Vector(vert.co))
                face_indices.append(vertex_map[vert.index])
            faces.append(tuple(face_indices))
        pivot = Vector((-0.222384414, 0.025357501, 0.13486062) if side == "L"
                       else (0.222574785, 0.024319256, 0.13486062))
        yaw = math.radians(boot_heading_yaw_degrees(side))
        rotation = Matrix.Rotation(yaw, 4, "Z")
        rotated = [pivot + rotation @ (point - pivot) for point in coords]
        mesh = bpy.data.meshes.new("GuardBoot_{}_Mesh".format(side))
        mesh.from_pydata([tuple(point) for point in rotated], [], faces)
        mesh.update()
        boot = bpy.data.objects.new("GuardBoot_{}_LOD0".format(side), mesh)
        bpy.context.scene.collection.objects.link(boot)
        boot.data.materials.append(leather)
        decimate = boot.modifiers.new("BootSourceReduction", "DECIMATE")
        decimate.ratio = 0.08
        decimate.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = boot
        bpy.ops.object.modifier_apply(modifier=decimate.name)
        remove_loose_geometry(boot)
        bm_boot = bmesh.new()
        bm_boot.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(bm_boot, faces=list(bm_boot.faces))
        bm_boot.to_mesh(mesh)
        bm_boot.free()
        mesh.update()
        solid = boot.modifiers.new("SealedBootCuff", "SOLIDIFY")
        solid.thickness = 0.004
        solid.offset = 0.0
        solid.use_rim = True
        bpy.context.view_layer.objects.active = boot
        bpy.ops.object.modifier_apply(modifier=solid.name)
        for poly in mesh.polygons:
            poly.use_smooth = True
        create_smart_uv(boot)
        group = boot.vertex_groups.new(name="Foot_{}".format(side))
        group.add(list(range(len(mesh.vertices))), 1.0, "REPLACE")
        attach_mesh_to_rig(boot, armature)
        result.append(boot)
        report[side] = {
            "source_faces": len(source_faces),
            "output_faces": len(mesh.polygons),
            "cuff_pivot_blender_m": [float(value) for value in pivot],
            "toe_yaw_degrees": boot_heading_yaw_degrees(side),
            "rigid_bone": "Foot_{}".format(side),
            "material": leather.name,
        }
    bmesh.ops.delete(bm, geom=removed, context="FACES")
    loose_edges = [edge for edge in bm.edges if not edge.link_faces]
    if loose_edges:
        bmesh.ops.delete(bm, geom=loose_edges, context="EDGES")
    loose_verts = [vert for vert in bm.verts if not vert.link_edges]
    if loose_verts:
        bmesh.ops.delete(bm, geom=loose_verts, context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(source_obj.data)
    bm.free()
    source_obj.data.update()
    return result, report


def create_smart_uv(mesh_obj):
    bpy.context.view_layer.objects.active = mesh_obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(island_margin=0.015, area_weight=0.25, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def remove_loose_geometry(mesh_obj):
    bm = bmesh.new()
    bm.from_mesh(mesh_obj.data)
    loose = [vert for vert in bm.verts if not vert.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(mesh_obj.data)
    bm.free()
    mesh_obj.data.update()


def decimate_source_mesh(source_obj, ratio, name):
    bpy.context.view_layer.objects.active = source_obj
    modifier = source_obj.modifiers.new("AssemblyLOD", "DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = ratio
    modifier.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    remove_loose_geometry(source_obj)
    create_smart_uv(source_obj)
    source_obj.name = name
    source_obj.data.name = name + "_Mesh"
    return source_obj


def extract_hard_leg_armor(source_obj, armature, steel):
    """Split front-facing leg armor into independent joint-rigid shell parts."""
    bm = bmesh.new()
    bm.from_mesh(source_obj.data)
    selected = {"thigh_armor": {"R": [], "L": []},
                "shin_armor": {"R": [], "L": []},
                "knee_cap": {"R": [], "L": []}}
    removed = []
    for face in bm.faces:
        center = face.calc_center_median()
        patch = leg_armor_patch_for_face(center.x, center.y, center.z, face.normal.y)
        if patch is None or patch[0] == "joint_liner" or face.normal.y < 0.20:
            continue
        region, side = patch
        if region not in selected:
            continue
        selected[region][side].append(face)
        removed.append(face)
    report = {"parts": {}, "source_faces_removed": len(removed),
              "selector": "leg_armor_patch_for_face + front normalY >= 0.20"}
    for region, sides in selected.items():
        for side, source_faces in sides.items():
            if len(source_faces) < 8:
                raise ValueError("insufficient authored surface for {}_{}: {} faces".format(region, side, len(source_faces)))
            vertex_map, coords, faces = {}, [], []
            for face in source_faces:
                face_indices = []
                for vert in face.verts:
                    if vert.index not in vertex_map:
                        vertex_map[vert.index] = len(coords)
                        coords.append(tuple(float(v) for v in vert.co + vert.normal * 0.004))
                    face_indices.append(vertex_map[vert.index])
                faces.append(tuple(face_indices))
            mesh = bpy.data.meshes.new("GuardLegArmor_{}_{}_Mesh".format(region, side))
            mesh.from_pydata(coords, [], faces)
            mesh.update()
            obj = bpy.data.objects.new("GuardLegArmor_{}_{}_LOD0".format(region, side), mesh)
            bpy.context.scene.collection.objects.link(obj)
            obj.data.materials.append(steel)
            for poly in obj.data.polygons:
                poly.material_index = 0
                poly.use_smooth = False
            solid = obj.modifiers.new("ClosedArmorRim", "SOLIDIFY")
            solid.thickness = 0.012
            solid.offset = 0.65
            solid.use_rim = True
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.modifier_apply(modifier=solid.name)
            group_name = "{}_{}".format("Thigh" if region in ("thigh_armor", "knee_cap") else "Shin", side)
            group = obj.vertex_groups.new(name=group_name)
            group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
            create_smart_uv(obj)
            attach_mesh_to_rig(obj, armature)
            report["parts"][obj.name] = {"source_faces": len(source_faces),
                "faces_after_shell": len(obj.data.polygons), "vertices": len(obj.data.vertices),
                "rigid_bone": group_name, "material": steel.name}
    if removed:
        bmesh.ops.delete(bm, geom=removed, context="FACES")
        loose_edges = [edge for edge in bm.edges if not edge.link_faces]
        if loose_edges:
            bmesh.ops.delete(bm, geom=loose_edges, context="EDGES")
        loose_verts = [vert for vert in bm.verts if not vert.link_edges]
        if loose_verts:
            bmesh.ops.delete(bm, geom=loose_verts, context="VERTS")
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(source_obj.data)
        source_obj.data.update()
    bm.free()
    return [bpy.data.objects[name] for name in report["parts"]], report


def segment_distance(point, start, end):
    axis = end - start
    length_sq = axis.length_squared
    if length_sq < 1e-12:
        return (point - start).length
    t = max(0.0, min(1.0, (point - start).dot(axis) / length_sq))
    return (point - (start + axis * t)).length


def build_source_padded_leg_layer(source_obj, armature, team_material, source_points=None):
    """Loft closed cloth liners from measured Hunyuan leg cross-sections."""
    source_points = source_points or [tuple(float(c) for c in vertex.co) for vertex in source_obj.data.vertices]
    vertices, faces, uv_by_vertex = [], [], {}
    ring_size = 20
    ring_count_total = 0
    profile_samples = 0
    for side, sign in (("R", 1.0), ("L", -1.0)):
        hip = Vector((sign * 0.146371, 0.0, 0.739862))
        knee = Vector((sign * 0.175646, 0.0, 0.408087))
        ankle = Vector((sign * 0.195162, 0.0, 0.134861))
        thigh_axis = (knee - hip).normalized()
        shin_axis = (ankle - knee).normalized()
        path = []
        for index in range(13):
            t = 0.04 + 0.96 * index / 12.0
            path.append((hip.lerp(knee, t), thigh_axis))
        for index in range(1, 13):
            t = index / 12.0
            path.append((knee.lerp(ankle, t), shin_axis))
        station_profiles = []
        bases = []
        for center, axis in path:
            side_basis = axis.cross(Vector((0.0, 1.0, 0.0))).normalized()
            front_basis = side_basis.cross(axis).normalized()
            bases.append((side_basis, front_basis))
            radii = fit_leg_profile_radii(
                source_points,
                tuple(float(v) for v in center),
                tuple(float(v) for v in axis),
                tuple(float(v) for v in side_basis),
                tuple(float(v) for v in front_basis),
                bins=ring_size, band_m=0.035, min_radius_m=0.045, max_radius_m=0.13,
            )
            station_profiles.append(radii)
            profile_samples += 1
        # Smooth source-retopology noise both around each ring and along the
        # limb so the finished fabric follows a padded volume instead of spikes.
        for _ in range(2):
            prior = [list(profile) for profile in station_profiles]
            for ring_index in range(1, len(prior) - 1):
                station_profiles[ring_index] = [
                    0.25 * prior[ring_index - 1][angle_index]
                    + 0.50 * prior[ring_index][angle_index]
                    + 0.25 * prior[ring_index + 1][angle_index]
                    for angle_index in range(ring_size)
                ]
        leg_rings = []
        for ring_index, ((center, axis), (side_basis, front_basis), radii) in enumerate(
            zip(path, bases, station_profiles)
        ):
            ring = []
            for angle_index, radius in enumerate(radii):
                angle = 2.0 * math.pi * angle_index / ring_size
                inset_radius = max(0.032, radius - 0.005)
                point = center + side_basis * (inset_radius * math.cos(angle)) \
                    + front_basis * (inset_radius * math.sin(angle))
                vertex_index = len(vertices)
                vertices.append(tuple(float(v) for v in point))
                uv_by_vertex[vertex_index] = (angle_index / ring_size, ring_index / (len(path) - 1))
                ring.append(vertex_index)
            leg_rings.append(ring)
        ring_count_total += len(leg_rings)
        for ring_index in range(len(leg_rings) - 1):
            current, following = leg_rings[ring_index], leg_rings[ring_index + 1]
            for angle_index in range(ring_size):
                nxt = (angle_index + 1) % ring_size
                faces.append((current[angle_index], current[nxt], following[nxt], following[angle_index]))
        faces.append(tuple(reversed(leg_rings[0])))
        faces.append(tuple(leg_rings[-1]))
    mesh = bpy.data.meshes.new("GuardPaddedLegLayerMesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("GuardPaddedLegLayer_LOD0", mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(team_material)
    for poly in obj.data.polygons:
        poly.material_index = 0
        poly.use_smooth = True
    uv_layer = obj.data.uv_layers.new(name="UVMap")
    for poly in obj.data.polygons:
        loops = list(poly.loop_indices)
        vertex_indices = [obj.data.loops[loop_index].vertex_index for loop_index in loops]
        if len(vertex_indices) != 4:
            for loop_index in loops:
                uv_layer.data[loop_index].uv = (0.5, 0.0 if min(vertex_indices) == 0 else 1.0)
            continue
        angle_values = [uv_by_vertex[index][0] for index in vertex_indices]
        if max(angle_values) - min(angle_values) > 0.5:
            angle_values = [value + 1.0 if value < 0.5 else value for value in angle_values]
        for loop_index, vertex_index, u in zip(loops, vertex_indices, angle_values):
            uv_layer.data[loop_index].uv = (u, uv_by_vertex[vertex_index][1])
    groups = {bone.name: obj.vertex_groups.new(name=bone.name) for bone in armature.data.bones}
    for vertex in obj.data.vertices:
        for name, weight in inner_layer_weights_for_point(vertex.co.x, vertex.co.z, vertex.co.y).items():
            if weight > 1e-8:
                groups[name].add([vertex.index], weight, "REPLACE")
    attach_mesh_to_rig(obj, armature)
    report = {
        "faces": len(obj.data.polygons),
        "vertices": len(obj.data.vertices),
        "source_vertices": len(source_points),
        "cross_section_samples": profile_samples,
        "rings_per_leg": ring_count_total // 2,
        "radial_samples": ring_size,
        "profile_radius_range_m": [0.045, 0.13],
        "surface_inset_m": 0.005,
    }
    return obj, report


def build_continuous_leg_armor(source_points, armature, steel):
    """Build continuous front control shells from fitted source cross-sections."""
    parts, report = [], {}
    profiles = []
    for side, sign in (("R", 1.0), ("L", -1.0)):
        hip = Vector((sign * 0.146371, 0.0, 0.739862))
        knee = Vector((sign * 0.175646, 0.0, 0.408087))
        ankle = Vector((sign * 0.195162, 0.0, 0.134861))
        thigh_axis = (knee - hip).normalized()
        shin_axis = (ankle - knee).normalized()
        profiles.extend([
            ("thigh_armor", side, hip.lerp(knee, 0.10), hip.lerp(knee, 0.88), thigh_axis, 8),
            ("shin_armor", side, knee.lerp(ankle, 0.10), knee.lerp(ankle, 0.88), shin_axis, 8),
            ("knee_cap", side, knee - thigh_axis * 0.055, knee + shin_axis * 0.055,
             (thigh_axis + shin_axis).normalized(), 5),
        ])
    for region, side, start, end, axis, ring_count in profiles:
        vertices, faces, uv_by_vertex = [], [], {}
        side_basis = axis.cross(Vector((0.0, 1.0, 0.0))).normalized()
        front_basis = side_basis.cross(axis).normalized()
        angle_count, profile_bins = 23, 24
        station_radii = []
        for ring_index in range(ring_count):
            center = start.lerp(end, ring_index / (ring_count - 1))
            station_radii.append(fit_leg_profile_radii(
                source_points, tuple(center), tuple(axis), tuple(side_basis), tuple(front_basis),
                bins=profile_bins, band_m=0.045, min_radius_m=0.045, max_radius_m=0.16,
            ))
        for _ in range(3):
            previous = [list(profile) for profile in station_radii]
            for ring_index in range(1, ring_count - 1):
                for bin_index in range(profile_bins):
                    station_radii[ring_index][bin_index] = (
                        0.25 * previous[ring_index - 1][bin_index]
                        + 0.50 * previous[ring_index][bin_index]
                        + 0.25 * previous[ring_index + 1][bin_index]
                    )
        rings = []
        for ring_index in range(ring_count):
            t = ring_index / (ring_count - 1)
            center = start.lerp(end, t)
            radii = station_radii[ring_index]
            ring = []
            for angle_index in range(angle_count):
                delta = -1.20 + 2.40 * angle_index / (angle_count - 1)
                angle = math.pi / 2.0 + delta
                profile_pos = (angle % (2.0 * math.pi)) * profile_bins / (2.0 * math.pi)
                lo = int(math.floor(profile_pos)) % profile_bins
                hi = (lo + 1) % profile_bins
                blend = profile_pos - math.floor(profile_pos)
                radius = radii[lo] * (1.0 - blend) + radii[hi] * blend + 0.003
                point = center + side_basis * (radius * math.cos(angle)) + front_basis * (radius * math.sin(angle))
                vertex_index = len(vertices)
                vertices.append(tuple(float(v) for v in point))
                uv_by_vertex[vertex_index] = (angle_index / (angle_count - 1), t)
                ring.append(vertex_index)
            rings.append(ring)
        for ring_index in range(len(rings) - 1):
            for angle_index in range(angle_count - 1):
                faces.append((rings[ring_index][angle_index], rings[ring_index + 1][angle_index],
                              rings[ring_index + 1][angle_index + 1], rings[ring_index][angle_index + 1]))
        name = "GuardLegArmor_{}_{}_LOD0".format(region, side)
        mesh = bpy.data.meshes.new(name + "_Mesh")
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.data.materials.append(steel)
        uv_layer = obj.data.uv_layers.new(name="UVMap")
        for poly in obj.data.polygons:
            poly.use_smooth = True
            for loop_index in poly.loop_indices:
                source_index = obj.data.loops[loop_index].vertex_index
                uv_layer.data[loop_index].uv = uv_by_vertex[source_index]
        shell = obj.modifiers.new("SealedArmorRim", "SOLIDIFY")
        shell.thickness = 0.006
        shell.offset = -0.15
        shell.use_rim = True
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=shell.name)
        bevel = obj.modifiers.new("SoftArmorEdge", "BEVEL")
        bevel.width = 0.0015
        bevel.segments = 2
        bevel.limit_method = "ANGLE"
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        group_name = rigid_leg_armor_bone(region, side)
        group = obj.vertex_groups.new(name=group_name)
        group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
        attach_mesh_to_rig(obj, armature)
        parts.append(obj)
        report[name] = {"rings": ring_count, "radial_samples": angle_count,
                        "faces": len(obj.data.polygons), "rigid_bone": group_name,
                        "material": steel.name, "edge_thickness_m": 0.006,
                        "source_cross_section_fit": True}
    return parts, report


def join_source_padded_leg_layer(body_obj, layer_obj):
    bpy.ops.object.select_all(action="DESELECT")
    body_obj.select_set(True)
    layer_obj.select_set(True)
    bpy.context.view_layer.objects.active = body_obj
    bpy.ops.object.join()
    body_obj.data.update()


def bind_nearest_bones(mesh_obj, armature):
    for group in list(mesh_obj.vertex_groups):
        mesh_obj.vertex_groups.remove(group)
    groups = {bone.name: mesh_obj.vertex_groups.new(name=bone.name) for bone in armature.data.bones}
    inner_vertices = set()
    for polygon in mesh_obj.data.polygons:
        index = polygon.material_index
        if index < len(mesh_obj.data.materials) and mesh_obj.data.materials[index].name == "TeamCloth":
            inner_vertices.update(polygon.vertices)
    batch = {}
    for vertex in mesh_obj.data.vertices:
        if vertex.index in inner_vertices:
            weights = inner_layer_weights_for_point(vertex.co.x, vertex.co.z, vertex.co.y)
        else:
            weights = body_weights_for_point(vertex.co.x, vertex.co.z, vertex.co.y, vertex.normal.y)
        for name, weight in weights.items():
            if weight > 1e-8:
                batch.setdefault(name, []).append((vertex.index, weight))
    for name, assignments in batch.items():
        for index, weight in assignments:
            groups[name].add([index], weight, "REPLACE")
    arm_mod = mesh_obj.modifiers.new("GuardRig20", "ARMATURE")
    arm_mod.object = armature
    arm_mod.use_vertex_groups = True


def attach_mesh_to_rig(mesh_obj, armature):
    mesh_obj.parent = armature
    mesh_obj.matrix_parent_inverse = armature.matrix_world.inverted()
    if not any(m.type == "ARMATURE" for m in mesh_obj.modifiers):
        mod = mesh_obj.modifiers.new("GuardRig20", "ARMATURE")
        mod.object = armature


def duplicate_lod(source_obj, name, ratio, armature):
    obj = source_obj.copy()
    obj.data = source_obj.data.copy()
    obj.name = name
    bpy.context.scene.collection.objects.link(obj)
    # remove source skinning; weights are rebuilt after collapse for actual LOD vertices
    for modifier in list(obj.modifiers):
        obj.modifiers.remove(modifier)
    for group in list(obj.vertex_groups):
        obj.vertex_groups.remove(group)
    mod = obj.modifiers.new("AssemblyLOD", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    remove_loose_geometry(obj)
    create_smart_uv(obj)
    bind_nearest_bones(obj, armature)
    attach_mesh_to_rig(obj, armature)
    return obj


def trim_decimated_old_arm_residual(mesh_obj):
    bm = bmesh.new()
    bm.from_mesh(mesh_obj.data)
    faces = [face for face in bm.faces if old_arm_residual_face(
        face.calc_center_median().x, face.calc_center_median().y, face.calc_center_median().z
    )]
    if faces:
        bmesh.ops.delete(bm, geom=faces, context="FACES")
        loose_edges = [edge for edge in bm.edges if not edge.link_faces]
        if loose_edges:
            bmesh.ops.delete(bm, geom=loose_edges, context="EDGES")
        loose_verts = [vert for vert in bm.verts if not vert.link_edges]
        if loose_verts:
            bmesh.ops.delete(bm, geom=loose_verts, context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh_obj.data)
    bm.free()
    mesh_obj.data.update()
    return len(faces)


def source_bounds(obj):
    points = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    z_min = min(point.z for point in points)
    z_max = max(point.z for point in points)
    torso = [point for point in points if 0.95 <= point.z <= 1.40 and abs(point.x) <= 0.24]
    legs = [point for point in points if point.z <= 0.74]
    return {
        "height_m": z_max - z_min,
        "torso_width_m": max(p.x for p in torso) - min(p.x for p in torso),
        "leg_height_m": 0.74 - z_min if legs else 0,
        "bounds_m": [[min(p[i] for p in points) for i in range(3)],
                     [max(p[i] for p in points) for i in range(3)]],
    }


def assembled_character_bounds(objects, armature, scene):
    """Measure the complete LOD0 character after replacement head/boots are attached."""
    previous_action = armature.animation_data.action
    armature.animation_data.action = bpy.data.actions.get("Idle")
    scene.frame_set(0)
    points = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        points.extend(evaluated.matrix_world @ vertex.co for vertex in mesh.vertices)
        evaluated.to_mesh_clear()
    armature.animation_data.action = previous_action
    if not points:
        raise ValueError("full-body bounds require at least one exported LOD0 mesh")
    z_min = min(point.z for point in points)
    z_max = max(point.z for point in points)
    torso = [point for point in points if 0.95 <= point.z <= 1.40 and abs(point.x) <= 0.24]
    legs = [point for point in points if point.z <= 0.74]
    if not torso or not legs:
        raise ValueError("full-body bounds are missing torso or leg samples")
    return {
        "height_m": z_max - z_min,
        "torso_width_m": max(point.x for point in torso) - min(point.x for point in torso),
        "leg_height_m": 0.74 - z_min,
        "bounds_m": [[min(point[i] for point in points) for i in range(3)],
                     [max(point[i] for point in points) for i in range(3)]],
    }


def contact_metrics(armature, sword, scene):
    action = bpy.data.actions["Attack"]
    armature.animation_data.action = action
    hand = armature.pose.bones["Hand_R"]

    def evaluated_points(frame):
        scene.frame_set(frame)
        depsgraph = bpy.context.evaluated_depsgraph_get()
        evaluated = sword.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        points = [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
        evaluated.to_mesh_clear()
        return points

    # Track one authored source vertex for every sample; never substitute the
    # lowest vertex per frame, which can create a false velocity spike.
    scene.frame_set(0)
    rest_points = evaluated_points(0)
    hand_rest = armature.matrix_world @ hand.head
    tip_index = max(range(len(rest_points)), key=lambda i: (rest_points[i] - hand_rest).length)
    target_y, target_z_min, target_z_max, target_half_width = 0.62, 0.62, 1.32, 0.15

    def target_gap(points):
        def gap(point):
            dx = max(abs(point.x) - target_half_width, 0.0)
            dy = abs(point.y - target_y)
            dz = max(target_z_min - point.z, point.z - target_z_max, 0.0)
            return math.sqrt(dx * dx + dy * dy + dz * dz)
        return min(gap(point) for point in points)

    samples = []
    for frame in (12, 14, 16):
        points = evaluated_points(frame)
        tip = points[tip_index]
        hand_world = armature.matrix_world @ hand.head
        samples.append({
            "frame": frame,
            "hand_world_m": [float(v) for v in hand_world],
            "source_tip_index": tip_index,
            "tip_world_m": [float(v) for v in tip],
            "hand_to_tip_m": float((tip - hand_world).length),
            "target_surface_gap_m": float(target_gap(points)),
            "weapon_bounds_world_m": [
                [float(min(p[i] for p in points)) for i in range(3)],
                [float(max(p[i] for p in points)) for i in range(3)],
            ],
        })
    contact_frame = round(ATTACK_CONTACT_S * FPS)
    frame16 = next(item for item in samples if item["frame"] == contact_frame)
    reach = frame16["hand_to_tip_m"]
    target_distance = frame16["target_surface_gap_m"]
    p0, p1 = evaluated_points(contact_frame - 1)[tip_index], evaluated_points(contact_frame + 1)[tip_index]
    speed = (p1 - p0).length * FPS / 2

    body = bpy.data.objects.get("GuardBody_LOD0")
    def foot_lift(name):
        bone = armature.pose.bones[name]
        ankle = armature.matrix_world @ bone.head
        evaluated_body = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
        body_mesh = evaluated_body.to_mesh()
        points = [evaluated_body.matrix_world @ vertex.co for vertex in body_mesh.vertices]
        contact = [p for p in points if abs(p.x - ankle.x) < 0.14 and p.z < 0.24]
        evaluated_body.to_mesh_clear()
        return max(0.0, min((p.z for p in contact), default=ankle.z))
    return {
        "blade_reach_m": float(reach),
        "blade_tip_world_m": frame16["tip_world_m"],
        "blade_target_distance_m": float(target_distance),
        "blade_speed_mps": float(speed),
        "left_foot_lift_m": float(foot_lift("Foot_L")),
        "right_foot_lift_m": float(foot_lift("Foot_R")),
        "target_volume": {"planeY_m": target_y, "heightRange_m": [target_z_min, target_z_max],
                          "halfWidthX_m": target_half_width, "maxSurfaceGap_m": 0.035},
        "contact_frame": contact_frame,
        "contact_seconds": ATTACK_CONTACT_S,
        "source_tip_vertex_index": tip_index,
        "frame_samples": samples,
    }


def setup_camera(view, center, run_dir):
    scene = bpy.context.scene
    camera = bpy.data.objects.get("AssemblyReviewCamera")
    if camera is None:
        data = bpy.data.cameras.new("AssemblyReviewCamera")
        camera = bpy.data.objects.new("AssemblyReviewCamera", data)
        scene.collection.objects.link(camera)
    direction = {
        # Canonical facing is Blender +Y; the enemy-facing shield face is +Y.
        "front": Vector((0, 3.8, 0)),
        "back": Vector((0, -3.8, 0)),
        "side": Vector((3.8, 0, 0)),
        "threequarter": Vector((2.7, 2.7, 0)),
    }[view]
    camera.location = center + direction + Vector((0, 0, 0.05))
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.18
    scene.camera = camera
    if bpy.data.objects.get("AssemblyKey") is None:
        light_data = bpy.data.lights.new("AssemblyKey", "AREA")
        light = bpy.data.objects.new("AssemblyKey", light_data)
        scene.collection.objects.link(light)
        light.location = (2.4, 3.0, 3.8)
        light.data.energy = 650
        light.data.shape = "DISK"
        light.data.size = 4.0
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.media_type = "IMAGE"
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.filepath = str(run_dir / "qa" / (view + ".png"))


def render_review(armature, run_dir, visible_names):
    scene = bpy.context.scene
    scene.render.fps = FPS
    center = Vector((0.0, 0.0, 0.92))
    # Explicitly isolate one LOD and its matching equipment for every review image.
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            obj.hide_render = obj.name not in visible_names
    for name, frame, view in (("Idle", 0, "front"), ("Idle", 0, "side"), ("Idle", 0, "back"),
                              ("Attack", 16, "attack"), ("Walk", 6, "walk")):
        armature.animation_data.action = bpy.data.actions[name]
        scene.frame_set(frame)
        target = run_dir / "qa" / (view + ".png")
        setup_camera("side" if view == "attack" else "front" if view == "walk" else view, center, run_dir)
        scene.render.filepath = str(target)
        bpy.ops.render.render(write_still=True)


def set_scene_extras(scene):
    scene["rtsMotion"] = {
        "version": 1,
        "locomotion": {"clip": "Walk", "strideMeters": 2.0, "cycleSeconds": 2.0 / 3.0},
        "attack": {"clip": "Attack", "durationSeconds": 1.2, "contactSeconds": 16.0 / 30.0},
    }


def sample_conservative_bounds(obj, armature, scene):
    previous_action = armature.animation_data.action
    previous_frame = scene.frame_current
    sampled_points = []
    sampled_counts = {}
    for clip, duration in CLIP_DURATIONS_S.items():
        action = bpy.data.actions.get(clip)
        if action is None:
            raise ValueError(f"missing action for skinned bounds sampling: {clip}")
        armature.animation_data.action = action
        count = round(duration * FPS) + 1
        sampled_counts[clip] = count
        for frame in range(count):
            scene.frame_set(frame)
            evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
            mesh = evaluated.to_mesh()
            # glTFLoader applies the metadata to each SkinnedMesh local sphere.
            # Blender's evaluated vertex coordinates are already object-local.
            sampled_points.extend(vertex.co.copy() for vertex in mesh.vertices)
            evaluated.to_mesh_clear()
    armature.animation_data.action = previous_action
    scene.frame_set(previous_frame)
    if not sampled_points:
        raise ValueError(f"no animated vertices sampled for {obj.name}")
    minimum = [min(point[axis] for point in sampled_points) for axis in range(3)]
    maximum = [max(point[axis] for point in sampled_points) for axis in range(3)]
    center_blender = Vector([(minimum[i] + maximum[i]) * 0.5 for i in range(3)])
    radius = max((point - center_blender).length for point in sampled_points)
    margin = 0.02
    # Blender XYZ (Z up, front +Y) -> GLTF Y-up local coordinates.
    center_y_up = [float(center_blender.x), float(center_blender.z), float(-center_blender.y)]
    return {
        "sphere_center_y_up_m": center_y_up,
        "sphere_radius_m": float(radius + margin),
        "sampled_clip_frames": sampled_counts,
        "max_sampled_vertex_distance_m": float(radius),
        "sampling_margin_m": margin,
    }


def export_lod(run_dir, armature, bodies, weapons, attachments, label):
    names = [bodies.name]
    names.extend(
        n for n in weapons
        if (label == "lod0" and n.endswith("LOD0")) or (label == "lod1" and n.endswith("LOD1"))
    )
    names.extend(obj.name for obj in attachments if obj.name.endswith("LOD0" if label == "lod0" else "LOD1"))
    objects = [armature] + [bpy.data.objects[n] for n in names]
    bounds_samples = {}
    for obj in objects:
        if obj.type == "MESH" and any(mod.type == "ARMATURE" for mod in obj.modifiers):
            bounds_samples[obj.name] = sample_conservative_bounds(obj, armature, bpy.context.scene)
            obj["rtsConservativeBounds"] = bounds_samples[obj.name]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_render = False
        obj.hide_viewport = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = armature
    path = run_dir / "candidate" / f"original-guard-assembly-{label}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True,
        export_animations=True, export_animation_mode="ACTIONS",
        export_image_format="JPEG", export_jpeg_quality=92,
        export_skins=True, export_yup=True, export_def_bones=True,
        export_extras=True,
    )
    return {"path": str(path), "bytes": path.stat().st_size, "sha256": sha256(path), "sampled_skin_bounds": bounds_samples}


def append_authored_meshes(blend_path, names, armature, group_map, prefix):
    with bpy.data.libraries.load(str(blend_path), link=False) as (source, target):
        missing = sorted(set(names) - set(source.objects))
        if missing:
            raise ValueError(f"attachment source missing objects: {missing}")
        target.objects = list(names)
    added = []
    for obj in target.objects:
        if obj is None or obj.type != "MESH":
            continue
        bpy.context.scene.collection.objects.link(obj)
        obj.name = prefix + "_" + obj.name + "_LOD0"
        for modifier in list(obj.modifiers):
            if modifier.type == "ARMATURE":
                obj.modifiers.remove(modifier)
        for group in list(obj.vertex_groups):
            if group.name in group_map:
                group.name = group_map[group.name]
        attach_mesh_to_rig(obj, armature)
        added.append(obj)
    return added


def merge_helmet_parts(objects, steel, brass, leather):
    for obj in objects:
        lowered = obj.name.lower()
        material = leather if "liner" in lowered else (
            brass if any(key in lowered for key in ("brass", "crest")) else steel
        )
        obj.data.materials.clear()
        obj.data.materials.append(material)
        for poly in obj.data.polygons:
            poly.material_index = 0
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    merged = bpy.context.view_layer.objects.active
    merged.name = "HelmetAssembly_LOD0"
    for modifier in list(merged.modifiers):
        if modifier.type == "ARMATURE":
            merged.modifiers.remove(modifier)
    attach_mesh_to_rig(merged, bpy.data.objects[ARMATURE_NAME])
    return merged


def duplicate_attachment(source, name, ratio, armature):
    obj = source.copy()
    obj.data = source.data.copy()
    obj.name = name
    bpy.context.scene.collection.objects.link(obj)
    for modifier in list(obj.modifiers):
        if modifier.type == "ARMATURE":
            obj.modifiers.remove(modifier)
    dec = obj.modifiers.new("AttachmentLOD", "DECIMATE")
    dec.decimate_type = "COLLAPSE"
    dec.ratio = ratio
    dec.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=dec.name)
    attach_mesh_to_rig(obj, armature)
    return obj


def make_neutral_team_material(material_dir, run_dir):
    source = bpy.data.images.load(str(material_dir / "cloth-512.png"), check_existing=True)
    image = bpy.data.images.new("NeutralGuardWeave_512", width=source.size[0], height=source.size[1], alpha=True)
    pixels = list(source.pixels)
    out = []
    for i in range(0, len(pixels), 4):
        luminance = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]
        value = max(0.42, min(0.84, 0.48 + luminance * 0.82))
        out.extend((value, value, value, pixels[i + 3]))
    image.pixels = out
    image.pack()
    image.filepath_raw = str(run_dir / "candidate" / "neutral-team-weave-512.png")
    image.file_format = "PNG"
    image.save()
    material = make_material("TeamCloth", Path(image.filepath_raw), 0.0, 0.78)
    material.name = "TeamCloth"
    return material


def ensure_tabard_drape_bone(armature):
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    edit = armature.data.edit_bones
    if "TabardDrape" not in edit:
        bone = edit.new("TabardDrape")
        bone.head = (0.0, 0.0, 0.7788941)
        bone.tail = (0.0, 0.0, 0.545)
        bone.parent = edit.get("Pelvis")
        bone.use_connect = False
        bone.use_deform = True
    bpy.ops.object.mode_set(mode="OBJECT")
    armature.pose.bones["TabardDrape"].rotation_mode = "QUATERNION"


def bake_tabard_drape_curves(armature, scene):
    tip = armature.pose.bones["TabardDrape"]
    pelvis = armature.pose.bones["Pelvis"]
    pivot_in_pelvis = pelvis.bone.matrix_local.inverted() @ tip.bone.head_local
    for clip, duration in CLIP_DURATIONS_S.items():
        action = bpy.data.actions.get(clip)
        if action is None:
            raise ValueError(f"missing original action while baking tabard drape: {clip}")
        armature.animation_data.action = action
        frame_count = round(duration * FPS)
        for frame in range(frame_count + 1):
            scene.frame_set(frame)
            pivot = pelvis.matrix @ pivot_in_pelvis
            _, pelvis_rotation, pelvis_scale = pelvis.matrix.decompose()
            fraction = tabard_drape_fraction(clip, frame / max(1, frame_count))
            rotation = pelvis_rotation.slerp(Quaternion(), fraction)
            tip.matrix = Matrix.LocRotScale(pivot, rotation, pelvis_scale)
            tip.keyframe_insert(data_path="location", frame=frame, group=tip.name)
            tip.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=tip.name)
        scene.frame_set(0)


def ensure_elbow_support_bones(armature):
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    edit = armature.data.edit_bones
    for side, sign in (("R", 1.0), ("L", -1.0)):
        name = f"ElbowSupport_{side}"
        if name in edit:
            continue
        bone = edit.new(name)
        bone.head = (sign * 0.3513, 0.0, 1.1009)
        bone.tail = (sign * 0.4035, 0.0, 1.1182)
        bone.parent = edit.get(f"UpperArm_{side}")
        bone.use_connect = False
        bone.use_deform = True
    bpy.ops.object.mode_set(mode="OBJECT")
    for side in ("R", "L"):
        armature.pose.bones[f"ElbowSupport_{side}"].rotation_mode = "QUATERNION"


def bake_elbow_support_curves(armature, scene):
    for action_name, duration in CLIP_DURATIONS_S.items():
        action = bpy.data.actions.get(action_name)
        if action is None:
            raise ValueError(f"missing original action while baking elbow support: {action_name}")
        armature.animation_data.action = action
        supports = [armature.pose.bones[f"ElbowSupport_{side}"] for side in ("R", "L")]
        for frame in range(0, round(duration * FPS) + 1):
            scene.frame_set(frame)
            for side, support in zip(("R", "L"), supports):
                upper = armature.pose.bones[f"UpperArm_{side}"]
                fore = armature.pose.bones[f"Forearm_{side}"]
                joint_upper = upper.matrix @ Vector((0.0, upper.bone.length, 0.0))
                joint_fore = fore.matrix.translation
                pivot = (joint_upper + joint_fore) * 0.5
                _, upper_q, upper_s = upper.matrix.decompose()
                _, fore_q, fore_s = fore.matrix.decompose()
                rot = upper_q.slerp(fore_q, 0.5)
                scale = (upper_s + fore_s) * 0.5
                support.matrix = Matrix.LocRotScale(pivot, rot, scale)
                support.keyframe_insert(data_path="location", frame=frame, group=support.name)
                support.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=support.name)
        scene.frame_set(0)


def ensure_knee_support_bones(armature):
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    edit = armature.data.edit_bones
    for side, sign in (("R", 1.0), ("L", -1.0)):
        name = "KneeSupport_{}".format(side)
        if name not in edit:
            bone = edit.new(name)
            bone.head = (sign * 0.175646, 0.0, 0.408087)
            bone.tail = (sign * 0.198, 0.015, 0.427)
            bone.parent = edit.get("Thigh_{}".format(side))
            bone.use_connect = False
            bone.use_deform = True
    bpy.ops.object.mode_set(mode="OBJECT")
    for side in ("R", "L"):
        armature.pose.bones["KneeSupport_{}".format(side)].rotation_mode = "QUATERNION"


def bake_knee_support_curves(armature, scene):
    for clip, duration in CLIP_DURATIONS_S.items():
        action = bpy.data.actions.get(clip)
        if action is None:
            raise ValueError("missing original action while baking knee support: {}".format(clip))
        armature.animation_data.action = action
        for side in ("R", "L"):
            helper = armature.pose.bones["KneeSupport_{}".format(side)]
            thigh = armature.pose.bones["Thigh_{}".format(side)]
            shin = armature.pose.bones["Shin_{}".format(side)]
            for frame in range(round(duration * FPS) + 1):
                scene.frame_set(frame)
                pivot_thigh = thigh.matrix @ Vector((0.0, thigh.bone.length, 0.0))
                pivot_shin = shin.matrix.translation
                pivot = (pivot_thigh + pivot_shin) * 0.5
                _, thigh_q, thigh_scale = thigh.matrix.decompose()
                _, shin_q, shin_scale = shin.matrix.decompose()
                rotation = thigh_q.slerp(shin_q, 0.5)
                scale = (thigh_scale + shin_scale) * 0.5
                helper.matrix = Matrix.LocRotScale(pivot, rotation, scale)
                helper.keyframe_insert(data_path="location", frame=frame, group=helper.name)
                helper.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=helper.name)
        scene.frame_set(0)


def bake_knee_support_clip(armature, scene, clip, sample_hz=120):
    """Rebake midpoint knee helpers after an external dense leg-IK refinement."""
    if clip not in CLIP_DURATIONS_S:
        raise ValueError("unknown knee-support clip: {}".format(clip))
    if sample_hz < FPS or sample_hz % FPS:
        raise ValueError("sample_hz must be an integer multiple of scene FPS")
    action = bpy.data.actions.get(clip)
    if action is None:
        raise ValueError("missing action while baking knee support: {}".format(clip))
    previous_action = armature.animation_data.action
    previous_frame = scene.frame_current
    armature.animation_data.action = action
    for curve in list(action.fcurves):
        if "KneeSupport_" in curve.data_path:
            action.fcurves.remove(curve)
    frame_count = round(CLIP_DURATIONS_S[clip] * sample_hz)
    for sample in range(frame_count + 1):
        frame_position = sample * FPS / sample_hz
        frame = math.floor(frame_position)
        subframe = frame_position - frame
        scene.frame_set(frame, subframe=subframe)
        for side in ("R", "L"):
            helper = armature.pose.bones["KneeSupport_{}".format(side)]
            thigh = armature.pose.bones["Thigh_{}".format(side)]
            shin = armature.pose.bones["Shin_{}".format(side)]
            pivot_thigh = thigh.matrix @ Vector((0.0, thigh.bone.length, 0.0))
            pivot_shin = shin.matrix.translation
            pivot = (pivot_thigh + pivot_shin) * 0.5
            _, thigh_q, thigh_scale = thigh.matrix.decompose()
            _, shin_q, shin_scale = shin.matrix.decompose()
            rotation = thigh_q.slerp(shin_q, 0.5)
            scale = (thigh_scale + shin_scale) * 0.5
            helper.matrix = Matrix.LocRotScale(pivot, rotation, scale)
            helper.keyframe_insert(data_path="location", frame=frame_position, group=helper.name)
            helper.keyframe_insert(data_path="rotation_quaternion", frame=frame_position, group=helper.name)
    armature.animation_data.action = previous_action
    scene.frame_set(previous_frame)
    return {
        "clip": clip,
        "sample_hz": sample_hz,
        "sampled_keys_per_helper": frame_count + 1,
        "helper_bones": ["KneeSupport_L", "KneeSupport_R"],
    }


def mirror_arm_mesh(source, armature):
    obj = source.copy()
    obj.data = source.data.copy()
    bpy.context.scene.collection.objects.link(obj)
    obj.name = source.name.replace("_R", "_L")
    for vertex in obj.data.vertices:
        vertex.co.x *= -1.0
    for group in obj.vertex_groups:
        if group.name.endswith("_R"):
            group.name = group.name[:-2] + "_L"
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    attach_mesh_to_rig(obj, armature)
    return obj


def combine_arm_materials(objects, steel, brass, teamcloth):
    bpy.context.view_layer.objects.active = objects[0]
    for obj in objects:
        old_slots = list(obj.data.materials)
        assignments = []
        for poly in obj.data.polygons:
            source_mat = old_slots[poly.material_index] if poly.material_index < len(old_slots) else None
            source_name = source_mat.name.lower() if source_mat else ""
            if obj.name.lower().find("sleeve") >= 0:
                assignments.append(2)
            elif any(token in source_name for token in ("brass", "gold", "trim")):
                assignments.append(1)
            else:
                assignments.append(0)
        obj.data.materials.clear()
        obj.data.materials.append(steel)
        obj.data.materials.append(brass)
        obj.data.materials.append(teamcloth)
        for poly, material_index in zip(obj.data.polygons, assignments):
            poly.material_index = material_index
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    merged = bpy.context.view_layer.objects.active
    merged.name = "GuardArms_LOD0"
    dec = merged.modifiers.new("GuardArmsLOD0", "DECIMATE")
    dec.decimate_type = "COLLAPSE"
    dec.ratio = 0.90
    dec.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = merged
    bpy.ops.object.modifier_apply(modifier=dec.name)
    for modifier in list(merged.modifiers):
        if modifier.type == "ARMATURE":
            merged.modifiers.remove(modifier)
    attach_mesh_to_rig(merged, bpy.data.objects[ARMATURE_NAME])
    return merged


def main():
    args = sys.argv[sys.argv.index("--") + 1:]
    motion_path, shape_path, material_dir, run_dir = [Path(v).resolve() for v in args[:4]]
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "candidate").mkdir(exist_ok=True)
    (run_dir / "qa").mkdir(exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(motion_path))
    scene = bpy.context.scene
    scene.render.fps = FPS
    armature = bpy.data.objects.get(ARMATURE_NAME)
    if armature is None:
        raise ValueError("motion blend is missing GuardRig20")
    ensure_knee_support_bones(armature)
    for body_name in BODY_NAMES:
        old = bpy.data.objects.get(body_name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)
    steel = make_material("GuardSteel_Surface", material_dir / "steel-512.png", 0.74, 0.34)
    cloth = make_material("GuardCloth_Surface", material_dir / "cloth-512.png", 0.02, 0.79)
    leather = make_material("GuardLeather_Surface", material_dir / "leather-512.png", 0.02, 0.63)
    brass = make_material("GuardBrass_Surface", material_dir / "brass-512.png", 0.68, 0.30)
    neutral_team = make_neutral_team_material(material_dir, run_dir)
    source = link_shape_mesh(shape_path)
    weld_report = weld_source_triangles(source)
    profile_source_points = [tuple(float(c) for c in vertex.co) for vertex in source.data.vertices]
    boot_objects, boot_report = extract_reoriented_boots(source, armature, leather)
    trim_report = trim_source_regions(source)
    add_uv_and_semantic_materials(source, steel, cloth, leather, brass)
    bounds = source_bounds(source)
    # Build the closed, source-fitted cloth liner before body decimation so its
    # radial profiles sample the full welded and trimmed authored surface.
    padded_layer, padded_layer_report = build_source_padded_leg_layer(source, armature, neutral_team, profile_source_points)
    leg_armor_parts, leg_armor_report = build_continuous_leg_armor(profile_source_points, armature, steel)
    source_obj = decimate_source_mesh(source, 0.027, "GuardBody_LOD0")
    # Collapse can bridge a removed source ROI. Re-cut only the measured old
    # outer-limb island after decimation so the new closed arm owns that volume.
    trim_decimated_old_arm_residual(source_obj)
    bind_nearest_bones(source_obj, armature)
    attach_mesh_to_rig(source_obj, armature)
    body_lod1 = duplicate_lod(source_obj, "GuardBody_LOD1", 0.26, armature)
    rts_root = Path(__file__).resolve().parents[1]
    helmet_path = rts_root / "runs" / "original-guard-helmet-rebuild" / "2026-10-05" / "candidate" / "original-guard-helmet-rebuild.blend"
    tabard_path = rts_root / "runs" / "original-guard-tabard" / "2026-10-05" / "candidate" / "original-guard-tabard.blend"
    ensure_tabard_drape_bone(armature)
    helmet_objects = (
        "OriginalCrownShell", "OriginalPerforatedVisor", "VisorLowerRolledBrass",
        "VisorUpperRolledBrass", "CrownContinuousBrowRim", "CrownOriginalCentralCrest",
        "OriginalPaddedHelmetLiner", "OriginalLayeredGorget", "GorgetRolledEdge",
    )
    attachments = append_authored_meshes(
        helmet_path, helmet_objects, armature,
        {"PortraitHead": "Head", "PortraitChest": "SpineUpper"}, "Helmet",
    )
    attachments = [merge_helmet_parts(attachments, steel, brass, leather)] + leg_armor_parts + boot_objects
    tabard = append_authored_meshes(
        tabard_path, ("OriginalGuardFrontTabard",), armature,
        {"TabardAnchor": "SpineLower", "TabardMiddle": "Pelvis", "TabardTip": "TabardDrape"}, "Tabard",
    )[0]
    tabard.data.materials.clear()
    tabard.data.materials.append(neutral_team)
    for poly in tabard.data.polygons:
        poly.material_index = 0
        poly.use_smooth = True
    attachments.append(tabard)
    attachments.append(padded_layer)
    arm_path = rts_root / "runs" / "original-guard-clean-arm" / "2026-10-05" / "candidate" / "original-guard-clean-arm.blend"
    arm_parts = (
        "ShoulderSpaulder", "UpperArmArmor", "ElbowArmor",
        "ForearmArmor", "WristCuff", "FlexibleSleeve",
    )
    ensure_elbow_support_bones(armature)
    right_arm_parts = append_authored_meshes(
        arm_path, arm_parts, armature,
        {"UpperArm_R": "UpperArm_R", "ElbowSupport_R": "ElbowSupport_R", "Forearm_R": "Forearm_R"},
        "GuardArm",
    )
    left_arm_parts = [mirror_arm_mesh(obj, armature) for obj in right_arm_parts]
    merged_arms = combine_arm_materials(
        right_arm_parts + left_arm_parts, steel, brass, neutral_team,
    )
    attachments.append(merged_arms)
    for attachment in list(attachments):
        base_name = attachment.name[:-5] if attachment.name.endswith("_LOD0") else attachment.name
        if attachment.name == "GuardArms_LOD0":
            ratio = 0.22
        elif base_name.startswith("HelmetAssembly"):
            ratio = 0.38
        elif base_name.startswith("GuardPaddedLegLayer"):
            ratio = 0.76
        elif base_name.startswith("GuardBoot_"):
            ratio = 0.42
        else:
            ratio = 0.76
        attachments.append(duplicate_attachment(attachment, base_name + "_LOD1", ratio, armature))
    for imported_action in ("OriginalGuardPortraitIdle", "OriginalTabardSwayStudy", "OriginalCleanArmRigAction"):
        action = bpy.data.actions.get(imported_action)
        if action is not None:
            bpy.data.actions.remove(action)
    bake_elbow_support_curves(armature, scene)
    bake_knee_support_curves(armature, scene)
    bake_tabard_drape_curves(armature, scene)
    # Hide the source from the scene after its evaluated geometry has become LOD0.
    # The mesh object itself is the source-derived LOD0 candidate.
    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and obj.name.startswith("GuardBody_SourceDerived"):
            bpy.data.objects.remove(obj, do_unlink=True)
    if set(CLP for CLP in CLIP_DURATIONS_S) - set(bpy.data.actions.keys()):
        raise ValueError("Imported motion blend is missing one or more original clips")
    set_scene_extras(scene)
    scene.frame_start = 0
    scene.frame_end = round(CLIP_DURATIONS_S["Idle"] * FPS)
    contacts = contact_metrics(armature, bpy.data.objects["KingdomSteelSword_LOD0"], scene)
    assembled_bounds = assembled_character_bounds(
        [source_obj] + [obj for obj in attachments if obj.name.endswith("LOD0")], armature, scene
    )
    try:
        contact_gate = validate_contact_metrics({
            "blade_reach_m": contacts["blade_reach_m"],
            "blade_target_distance_m": contacts["blade_target_distance_m"],
            "blade_speed_mps": contacts["blade_speed_mps"],
            "left_foot_lift_m": contacts["left_foot_lift_m"],
            "right_foot_lift_m": contacts["right_foot_lift_m"],
        })
    except ValueError as error:
        contact_gate = {"passed": False, "reason": str(error)}
    size_gate = validate_source_bounds(assembled_bounds)
    visible_lod0 = {source_obj.name, "KingdomSteelSword_LOD0", "KingdomSunShield_LOD0"}
    visible_lod0.update(obj.name for obj in attachments if obj.name.endswith("LOD0"))
    render_review(armature, run_dir, visible_lod0)
    blend = run_dir / "candidate" / "original-guard-assembly.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    weapons = list(WEAPON_NAMES)
    exports = {
        "lod0": export_lod(run_dir, armature, source_obj, weapons, attachments, "lod0"),
        "lod1": export_lod(run_dir, armature, body_lod1, weapons, attachments, "lod1"),
    }
    result = {
        "status": "candidate_visual_review_pending",
        "runtime_publish_allowed": False,
        "authorship": "Source-derived project-authored Hunyuan guard shape; original GuardRig20, procedural animations, sword, and shield. No third-party model, motion, rig, or textures.",
        "sources": {
            "motion_blend": {"path": str(motion_path), "sha256": sha256(motion_path)},
            "shape_blend": {"path": str(shape_path), "sha256": sha256(shape_path)},
            "helmet_blend": {"path": str(helmet_path), "sha256": sha256(helmet_path)},
            "tabard_blend": {"path": str(tabard_path), "sha256": sha256(tabard_path)},
            "arm_blend": {"path": str(arm_path), "sha256": sha256(arm_path),
                          "accepted_source_glb_sha256": "1879eecf9de41fb45b38013e9868aa34785aea1c3271e6bb2b75f4012b491544"},
            "team_cloth": {
                "source": {"path": str(material_dir / "cloth-512.png"), "sha256": sha256(material_dir / "cloth-512.png")},
                "derived": {"path": str(run_dir / "candidate" / "neutral-team-weave-512.png"),
                            "sha256": sha256(run_dir / "candidate" / "neutral-team-weave-512.png")},
                "method": "Rec.709 luminance to neutral gray, value clamp(0.42,0.84,0.48+0.82*luminance), preserving alpha.",
            },
            "surface_tiles": {name: {"path": str(material_dir / (name + "-512.png")),
                                     "sha256": sha256(material_dir / (name + "-512.png"))}
                              for name in ("steel", "brass", "cloth", "leather")},
        },
        "candidate": {"editable_blend": {"path": str(blend), "sha256": sha256(blend)}, "exports": exports},
        "geometry": {"source_bounds": bounds, "assembled_bounds": assembled_bounds, "weld": weld_report, "trim_regions": trim_report, "size_gate": size_gate,
                     "padded_leg_layer": padded_layer_report, "continuous_leg_armor": leg_armor_report,
                     "reoriented_boots": boot_report, "lod0_vertices": len(source_obj.data.vertices), "lod0_faces": len(source_obj.data.polygons),
                     "lod1_vertices": len(body_lod1.data.vertices), "lod1_faces": len(body_lod1.data.polygons)},
        "rig": {"name": ARMATURE_NAME, "bones": len(armature.data.bones), "weight_method": "nearest authored bone-segment projection"},
        "clips": {name: {"durationSeconds": value, "fps": FPS} for name, value in CLIP_DURATIONS_S.items()},
        "rtsMotion": motion_extras(),
        "contact": {"metrics": contacts, "gate": contact_gate},
        "qa_images": ["front.png", "side.png", "back.png", "attack.png", "walk.png"],
    }
    (run_dir / "qa" / "metadata.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print("ORIGINAL_GUARD_ASSEMBLY=" + json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
