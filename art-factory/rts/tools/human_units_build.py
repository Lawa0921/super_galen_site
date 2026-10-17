"""Build original generated RTS human bodies into finite rigged factory candidates.

Run with Blender 5.2 in background mode. No runtime/public paths are written.
"""

import argparse
import base64
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Quaternion, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from human_units_probe import welded_vertex_components
from human_units_spec import BONE_NAMES, UNITS, clip_frames, derive_landmarks, skirt_weights
from neural_blender_qa import add_area, render_view


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def active(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def triangles(obj):
    return sum(len(poly.vertices) - 2 for poly in obj.data.polygons)


def material(name, color, metallic=0.0, roughness=0.5, image_path=None, tintable=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if image_path:
        image = bpy.data.images.load(str(image_path.resolve()), check_existing=True)
        image.colorspace_settings.name = 'sRGB'
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = image
        if tintable:
            tint = mat.node_tree.nodes.new('ShaderNodeMix')
            tint.data_type = 'RGBA'
            tint.blend_type = 'MULTIPLY'
            next(sock for sock in tint.inputs if sock.identifier == 'Factor_Float').default_value = 1.0
            next(sock for sock in tint.inputs if sock.identifier == 'A_Color').default_value = (*color, 1)
            mat.node_tree.links.new(tex.outputs['Color'], next(sock for sock in tint.inputs if sock.identifier == 'B_Color'))
            mat.node_tree.links.new(next(sock for sock in tint.outputs if sock.identifier == 'Result_Color'), bsdf.inputs['Base Color'])
        else:
            mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    return mat


def set_team_tint(mat, rgba):
    if mat is None:
        return
    mix = next(node for node in mat.node_tree.nodes if node.bl_idname == 'ShaderNodeMix')
    next(sock for sock in mix.inputs if sock.identifier == 'A_Color').default_value = rgba


def mesh_object(name, vertices, faces, mat):
    mesh = bpy.data.meshes.new(name + 'Mesh')
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


def sphere(name, radius, location, mat, segments=12, rings=8, scale=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    if scale:
        obj.scale = scale
    obj.data.materials.append(mat)
    return apply_transforms(obj)


def box(name, location, size, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    apply_transforms(obj)
    if bevel:
        mod = obj.modifiers.new('WorkedEdge', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        active(obj)
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.materials.append(mat)
    return obj


def join_meshes(parts, name):
    bpy.ops.object.select_all(action='DESELECT')
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    return obj


def rigid_skin(obj, arm, bone):
    group = obj.vertex_groups.new(name=bone)
    group.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
    obj.parent = arm
    obj.modifiers.new('RigidEquipmentSkin', 'ARMATURE').object = arm


def remove_tiny_islands(obj):
    mesh = obj.data
    points = [vertex.co for vertex in mesh.vertices]
    groups = welded_vertex_components(points, [edge.vertices[:] for edge in mesh.edges])
    if len(groups) == 1:
        return {'components_before': 1, 'removed_vertices': 0, 'removed_triangles': 0}
    minor = [index for group in groups[1:] for index in group]
    if len(minor) > 100 or len(minor) > len(mesh.vertices) * .01:
        raise RuntimeError(f'Unexpected large detached source geometry: {len(minor)} verts')
    before = triangles(obj)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[index] for index in minor], context='VERTS')
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    return {'components_before': len(groups), 'removed_vertices': len(minor), 'removed_triangles': before - triangles(obj)}


def load_original_body(root, unit, run):
    source = root / 'art-factory/rts/runs/unit-bodies' / unit / 'v1'
    blend = source / 'projected/candidate/guard-neural-v3.blend'
    uv_obj = source / 'neural/candidate/guard-neural-uv.obj'
    bpy.ops.wm.open_mainfile(filepath=str(blend))
    bodies = [obj for obj in bpy.data.objects if obj.type == 'MESH']
    if len(bodies) != 1:
        raise RuntimeError(f'{unit}: expected one projected original body, got {len(bodies)}')
    body = bodies[0]
    for obj in list(bpy.data.objects):
        if obj != body:
            bpy.data.objects.remove(obj, do_unlink=True)
    active(body)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    cleanup = remove_tiny_islands(body)
    source_min = [min(vertex.co[axis] for vertex in body.data.vertices) for axis in range(3)]
    source_max = [max(vertex.co[axis] for vertex in body.data.vertices) for axis in range(3)]
    scale = UNITS[unit]['height_m'] / (source_max[2] - source_min[2])
    source_center_x = (source_min[0] + source_max[0]) / 2
    source_center_y = (source_min[1] + source_max[1]) / 2
    for vertex in body.data.vertices:
        x, y, z = tuple(vertex.co)
        vertex.co = (-(y - source_center_y) * scale, (x - source_center_x) * scale, (z - source_min[2]) * scale)
    body.data.update()
    height = UNITS[unit]['height_m']
    arm_half = max(abs(vertex.co.x) for vertex in body.data.vertices)
    low = [abs(vertex.co.x) for vertex in body.data.vertices if vertex.co.z < height * .17 and abs(vertex.co.x) > height * .018]
    low.sort()
    foot_half = low[len(low) // 2] if low else height * .07
    landmarks = derive_landmarks(UNITS[unit], arm_half, foot_half)
    source_record = {'source_blend': str(blend), 'source_blend_sha256': sha256(blend), 'source_uv_obj': str(uv_obj), 'source_uv_obj_sha256': sha256(uv_obj),
                     'source_bounds': {'minimum': source_min, 'maximum': source_max}, 'source_to_blender': 'source +X forward, +Z up -> Blender +Y forward, +Z up; recentered and grounded',
                     'scale': scale, 'cleanup': cleanup, 'landmarks': landmarks, 'runtime_publish_allowed': False}
    (run / 'qa').mkdir(parents=True, exist_ok=True)
    (run / 'qa/landmarks.json').write_text(json.dumps(source_record, indent=2) + '\n', encoding='utf-8', newline='\n')
    return body, landmarks, source_record


def armature_object(unit, landmarks):
    data = bpy.data.armatures.new(unit + '20BoneData')
    arm = bpy.data.objects.new(unit + 'Rig20', data)
    bpy.context.collection.objects.link(arm)
    active(arm)
    bpy.ops.object.mode_set(mode='EDIT')
    for name in BONE_NAMES:
        head, tail, parent = landmarks['bones'][name]
        bone = data.edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        if parent:
            bone.parent = data.edit_bones[parent]
            bone.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    arm.show_in_front = True
    return arm


def decimate(obj, target):
    current = triangles(obj)
    if current <= target:
        return current
    mod = obj.modifiers.new('BoundedLODReduction', 'DECIMATE')
    mod.ratio = target / current
    mod.use_collapse_triangulate = True
    obj.modifiers.move(len(obj.modifiers) - 1, 0)
    active(obj)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return triangles(obj)


def bind_auto(obj, arm):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO', keep_transform=True)
    active(obj)
    bpy.ops.object.vertex_group_limit_total(limit=4)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)


def weight_metrics(obj):
    unweighted = 0
    most = 0
    max_error = 0.0
    for vertex in obj.data.vertices:
        weights = [group.weight for group in vertex.groups if group.weight > 1e-6]
        unweighted += not weights
        most = max(most, len(weights))
        max_error = max(max_error, abs(sum(weights) - 1))
    return {'vertices': len(obj.data.vertices), 'unweighted': unweighted, 'max_influences': most, 'max_weight_sum_error': round(max_error, 7)}


def fill_sparse_auto_weights(obj, arm):
    repaired = []
    for vertex in obj.data.vertices:
        if any(group.weight > 1e-6 for group in vertex.groups):
            continue
        point = obj.matrix_world @ vertex.co
        nearest = None
        for bone in arm.data.bones:
            a, b = arm.matrix_world @ bone.head_local, arm.matrix_world @ bone.tail_local
            delta = b - a
            fraction = max(0.0, min(1.0, (point-a).dot(delta)/max(delta.length_squared,1e-9)))
            distance = (point-(a+delta*fraction)).length_squared
            if nearest is None or distance < nearest[0]:
                nearest = (distance,bone.name)
        group = obj.vertex_groups.get(nearest[1]) or obj.vertex_groups.new(name=nearest[1])
        group.add([vertex.index],1.0,'REPLACE')
        repaired.append({'vertex':vertex.index,'bone':nearest[1]})
    return repaired


def worker_axe(landmarks, materials, arm):
    hand = palm(landmarks, 'R')
    cx, cy, grip_z = hand.x, hand.y + .015, hand.z
    wood, steel, brass, leather = [materials[key] for key in ('wood', 'steel', 'brass', 'leather')]
    parts = []
    # Faceted tapered working haft with a leather grip and metal cap.
    ring_z = [grip_z - .18, grip_z - .08, grip_z + .16, grip_z + .35]
    ring_r = [.015, .019, .023, .020]
    verts = []
    for z, radius in zip(ring_z, ring_r):
        for index in range(12):
            angle = index * math.tau / 12
            verts.append((cx + math.cos(angle) * radius, cy + math.sin(angle) * radius, z))
    faces = []
    for ring in range(len(ring_z) - 1):
        for index in range(12):
            nxt = (index + 1) % 12
            faces.append((ring * 12 + index, ring * 12 + nxt, (ring + 1) * 12 + nxt, (ring + 1) * 12 + index))
    faces.extend([tuple(range(11, -1, -1)), tuple(range(36, 48))])
    parts.append(mesh_object('AxeTaperedAshHaft', verts, faces, wood))
    for index in range(5):
        parts.append(cylinder('AxeGripBinding', .020, .008, (cx, cy, grip_z - .10 + index * .031), leather, 12))
    parts.append(cylinder('AxeButtFerrule', .021, .030, (cx, cy, grip_z - .167), steel, 12))
    head_z = grip_z + .28
    # The convex cutting bit has a thin forged edge and full 3D wedge thickness.
    outline = [(-.035, -.065), (.065, -.078), (.167, -.113), (.218, -.092), (.236, -.042), (.236, .042), (.218, .092), (.167, .113), (.065, .078), (-.035, .065)]
    vertices = []
    for ysign in (-1, 1):
        for x, z in outline:
            thickness = .007 if x > .20 else .032
            vertices.append((cx + x, cy + ysign * thickness, head_z + z))
    n = len(outline)
    axe_faces = []
    for index in range(1, n - 1):
        axe_faces.extend([(0, index + 1, index), (n, n + index, n + index + 1)])
    for index in range(n):
        nxt = (index + 1) % n
        axe_faces.append((index, nxt, n + nxt, n + index))
    parts.append(mesh_object('AxeForgedWedgeAndSharpBit', vertices, axe_faces, steel))
    parts.append(cylinder('AxeSocketCollar', .035, .090, (cx, cy, head_z), steel, 16))
    for z in (head_z - .048, head_z + .048):
        parts.append(cylinder('AxeSocketBrassBand', .036, .009, (cx, cy, z), brass, 16))
    axe = join_meshes(parts, 'WorkerCraftAxe_LOD0')
    rigid_skin(axe, arm, 'Hand_R')
    return axe


def equipment_materials(prep, unit, team_mask=False):
    mats = {
        'body': material(('TeamClothMasked_' if team_mask else unit + 'BodyPBR') + (unit if team_mask else ''),
                         (1, 1, 1), .05, .62, prep / 'body-1024-q90.jpg'),
        'wood': material('WorkedAshWood', (.26, .13, .055), .02, .68),
        'steel': material('ForgedToolSteel', (.53, .58, .63), .78, .36),
        'brass': material('OldBrassFittings', (.57, .38, .14), .68, .39),
        'leather': material('WornLeatherGrip', (.20, .11, .061), .02, .8),
        'dark': material('DarkIron', (.17, .19, .21), .67, .51),
    }
    if UNITS[unit]['teamcloth'] and not team_mask:
        mats['team'] = material('TeamCloth_' + unit, (1, 1, 1), 0, .75, prep / 'teamcloth-neutral-1024-q90.jpg', tintable=True)
    return mats


def palm(landmarks, side):
    wrist, tip, _ = landmarks['bones']['Hand_' + side]
    hand = Vector(wrist).lerp(Vector(tip), .58)
    hand.x += (-1 if side == 'R' else 1) * landmarks['height_m'] * .037
    return hand


def raider_axe(landmarks, mats, arm):
    hand = palm(landmarks, 'R')
    cx, cy, cz = hand.x, hand.y + .015, hand.z
    parts = [cylinder('RaidAxeAshHaft', .018, .58, (cx, cy, cz + .105), mats['wood'], 10),
             cylinder('RaidAxeGrip', .020, .17, (cx, cy, cz - .045), mats['leather'], 10),
             cylinder('RaidAxeCollar', .032, .10, (cx, cy, cz + .32), mats['dark'], 12)]
    outline = [(-.03, -.07), (.055, -.075), (.155, -.11), (.21, -.09), (.23, 0), (.21, .09), (.155, .11), (.055, .075), (-.03, .07)]
    verts = [(cx + x, cy + dy, cz + .32 + z) for dy in (-.026, .026) for x, z in outline]
    n = len(outline)
    faces = [(0, i + 1, i) for i in range(1, n - 1)] + [(n, n + i, n + i + 1) for i in range(1, n - 1)]
    faces += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    parts.append(mesh_object('RaidAxeBlade', verts, faces, mats['steel']))
    obj = join_meshes(parts, 'RaiderShortAxe_LOD0')
    rigid_skin(obj, arm, 'Hand_R')
    return [obj]


def priest_staff(landmarks, mats, arm):
    hand = palm(landmarks, 'R')
    cx, cy, cz = hand.x, hand.y + .015, hand.z
    parts = [cylinder('StaffWorkedWood', .018, 1.72, (cx, cy, .88), mats['wood'], 12),
             cylinder('StaffLeatherGrip', .022, .23, (cx, cy, cz), mats['leather'], 12),
             cylinder('StaffFootFerrule', .028, .10, (cx, cy, .055), mats['brass'], 12),
             cylinder('StaffCrownSocket', .042, .12, (cx, cy, 1.69), mats['brass'], 12),
             sphere('StaffDawnOrb', .075, (cx, cy, 1.79), mats['brass'])]
    for dx in (-.06, .06):
        parts.append(box('StaffCrownRay', (cx + dx, cy, 1.76), (.018, .03, .13), mats['brass'], .005))
    obj = join_meshes(parts, 'PriestDawnStaff_LOD0')
    rigid_skin(obj, arm, 'Hand_R')
    return [obj]


def crossbow_weapon(landmarks, mats, arm):
    hand = palm(landmarks, 'R')
    cx, cy, cz = hand.x, hand.y + .015, hand.z
    parts = [box('CrossbowStock', (cx, cy + .28, cz + .04), (.075, .65, .08), mats['wood'], .012),
             box('CrossbowSteelRail', (cx, cy + .29, cz + .09), (.018, .60, .012), mats['steel'], .003),
             box('CrossbowTrigger', (cx, cy + .045, cz - .045), (.018, .065, .085), mats['dark'], .003),
             box('CrossbowGrip', (cx, cy + .02, cz - .10), (.055, .085, .15), mats['wood'], .010)]
    bow_cx = cx - .13
    verts = [(bow_cx + x, cy + y, cz + .06 + z) for x,y,z in [(-.31,.48,0),(-.18,.52,.04),(0,.55,.08),(.18,.52,.04),(.31,.48,0),(-.31,.48,.018),(-.18,.52,.058),(0,.55,.098),(.18,.52,.058),(.31,.48,.018)]]
    faces = [(i,i+1,i+6,i+5) for i in range(4)]
    parts.append(mesh_object('CrossbowBentSteelProd', verts, faces, mats['steel']))
    verts = [(bow_cx + x, cy + y, cz + z) for x,y,z in [(-.31,.48,.07),(0,.18,.10),(.31,.48,.07)]]
    for i in range(2):
        a,b = verts[i],verts[i+1]
        midpoint = (Vector(a)+Vector(b))/2
        diff = Vector(b)-Vector(a)
        bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=.0035,depth=diff.length,location=midpoint)
        obj = bpy.context.object
        obj.name = 'CrossbowDrawnString'
        obj.data.materials.append(mats['leather'])
        obj.rotation_euler = diff.to_track_quat('Z','Y').to_euler()
        apply_transforms(obj)
        parts.append(obj)
    obj = join_meshes(parts, 'CrossbowWeapon_LOD0')
    rigid_skin(obj, arm, 'Hand_R')
    return [obj]


def commander_weapons(landmarks, mats, arm):
    right, left = palm(landmarks, 'R'), palm(landmarks, 'L')
    x,y,z = right.x,right.y+.015,right.z
    sword_parts = [cylinder('SwordLeatherGrip', .021, .20, (x,y,z), mats['leather'], 12),
                   cylinder('SwordPommel', .038, .035, (x,y,z-.12), mats['brass'], 16),
                   box('SwordCrossguard', (x,y,z+.13), (.30,.055,.038), mats['brass'], .008)]
    verts = [(x+dx,y+dy,z+zz) for zz,half,depth in [(.16,.036,.015),(.45,.048,.013),(.93,.004,.003)] for dx,dy in [(-half,-depth),(half,-depth),(half,depth),(-half,depth)]]
    faces = [(ring*4+i,ring*4+(i+1)%4,(ring+1)*4+(i+1)%4,(ring+1)*4+i) for ring in (0,1) for i in range(4)] + [(0,1,2,3),(8,9,10,11)]
    sword_parts.append(mesh_object('CommanderTaperedSteelBlade',verts,faces,mats['steel']))
    sword = join_meshes(sword_parts,'CommanderLongsword_LOD0')
    rigid_skin(sword,arm,'Hand_R')
    x,y,z = left.x,left.y+.24,left.z+.12
    shield_mats = material('TeamCloth_Shield',(1,1,1),.13,.53)
    mats['shield_team'] = shield_mats
    shield_parts = [box('ShieldCurvedWoodCore',(x,y,z),(.43,.075,.66),mats['wood'],.035),
                    box('ShieldNeutralTeamFace',(x,y+.043,z),(.38,.018,.61),shield_mats,.022),
                    box('ShieldSteelBoss',(x,y+.068,z),(.12,.045,.12),mats['steel'],.018)]
    for dx in (-.207,.207):
        shield_parts.append(box('ShieldSteelRim',(x+dx,y+.038,z),(.025,.05,.66),mats['steel'],.007))
    shield = join_meshes(shield_parts,'CommanderDawnShield_LOD0')
    rigid_skin(shield,arm,'Hand_L')
    return [sword,shield]


def setup_render_scene(height):
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.view_settings.view_transform = 'AgX'
    center = Vector((0, 0, height / 2))
    distance = 6.2
    add_area('Key', center + Vector((distance, distance, distance)), 700, height * 3, center)
    add_area('Fill', center + Vector((-distance, -distance, distance / 2)), 450, height * 3, center)
    add_area('Rim', center + Vector((distance, -distance, distance)), 650, height * 2, center)
    return center, distance


def apply_priest_skirt_weights(body, landmarks):
    height = landmarks['height_m']
    groups = {name: body.vertex_groups.get(name) or body.vertex_groups.new(name=name) for name in ('Pelvis','Thigh_L','Thigh_R')}
    adjusted = 0
    for vertex in body.data.vertices:
        if vertex.co.z >= height * .44 or abs(vertex.co.x) >= height * .28:
            continue
        values = skirt_weights(vertex.co.x, vertex.co.z, height)
        for group in body.vertex_groups:
            try:
                group.remove([vertex.index])
            except RuntimeError:
                pass
        for name, weight in values.items():
            groups[name].add([vertex.index], weight, 'REPLACE')
        adjusted += 1
    return adjusted


def duplicate_lod(source, target):
    obj = source.copy()
    obj.data = source.data.copy()
    bpy.context.collection.objects.link(obj)
    obj.name = source.name.replace('LOD0','LOD1')
    decimate(obj, target)
    active(obj)
    bpy.ops.object.vertex_group_limit_total(limit=4)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    return obj


def make_actions(arm, unit, contact_objects):
    arm.animation_data_create()
    actions = {}
    for clip, frames in clip_frames(unit).items():
        action = bpy.data.actions.new(clip)
        arm.animation_data.action = action
        for frame, state in frames:
            for bone in arm.pose.bones:
                bone.rotation_mode = 'QUATERNION'
                bone.rotation_quaternion = Quaternion((1,0,0,0))
                bone.location = (0,0,0)
            for name, value in state.items():
                if name == '$root_z':
                    root = arm.pose.bones['Root']
                    root.location = (root.bone.matrix_local.to_3x3().inverted() @ Vector((0,0,1))) * value
                    continue
                pose = arm.pose.bones[name]
                turns = value if isinstance(value[0], tuple) else (value,)
                rotation = Quaternion((1,0,0,0))
                for axis,degrees in turns:
                    world_axis = {'X':Vector((1,0,0)), 'Y':Vector((0,1,0)), 'Z':Vector((0,0,1))}[axis]
                    rotation = rotation @ Quaternion(pose.bone.matrix_local.to_3x3().inverted() @ world_axis, math.radians(degrees))
                pose.rotation_quaternion = rotation
            if clip == 'Death' and frame:
                bpy.context.view_layer.update()
                floor = evaluated_min_z(contact_objects)
                root = arm.pose.bones['Root']
                local_up = root.bone.matrix_local.to_3x3().inverted() @ Vector((0,0,1))
                root.location += local_up * (.012 - floor)
                bpy.context.view_layer.update()
            for bone in arm.pose.bones:
                bone.keyframe_insert(data_path='rotation_quaternion',frame=frame,group=bone.name)
                if bone.name == 'Root':
                    bone.keyframe_insert(data_path='location',frame=frame,group=bone.name)
        action.use_fake_user = True
        actions[clip] = action
    arm.animation_data.action = actions['Idle']
    return actions


def evaluated_min_z(objects):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    minimum = float('inf')
    for obj in objects:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            minimum = min(minimum, *((obj.matrix_world @ vertex.co).z for vertex in mesh.vertices))
        finally:
            evaluated.to_mesh_clear()
    return minimum


def inspect_ground(scene, arm, actions, objects):
    report = {}
    for clip in ('Idle','Walk','Attack','Death'):
        arm.animation_data.action = actions[clip]
        frames = [frame for frame,_ in clip_frames(arm.name.split('Rig')[0])[clip]]
        values = []
        for frame in frames:
            scene.frame_set(frame)
            values.append({'frame':frame,'body_min_z_m':round(evaluated_min_z(objects[:1]),4),'equipment_min_z_m':round(evaluated_min_z(objects[1:]),4) if len(objects)>1 else None})
        report[clip] = values
    arm.animation_data.action = actions['Idle']
    scene.frame_set(0)
    return report


def select_export(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def production(root, unit, run, team_mask=False):
    body, landmarks, source = load_original_body(root, unit, run)
    candidate, qa = run / 'candidate', run / 'qa'
    cloth_faces = set() if team_mask else set(json.loads((candidate / 'cloth-faces.json').read_text(encoding='utf-8')))
    mats = equipment_materials(candidate, unit, team_mask=team_mask)
    if team_mask:
        mask_path = candidate / 'team-mask-1024.png'
        mats['body']['teamTintMask'] = 'data:image/png;base64,' + base64.b64encode(mask_path.read_bytes()).decode('ascii')
        if len(mats['body']['teamTintMask']) > 3000000:
            raise RuntimeError('Embedded team mask exceeds runtime metadata limit')
    body.data.materials.clear()
    body.data.materials.append(mats['body'])
    if 'team' in mats:
        body.data.materials.append(mats['team'])
    for index, face in enumerate(body.data.polygons):
        face.material_index = 1 if index in cloth_faces and 'team' in mats else 0
        face.use_smooth = True
    body.name = unit + 'OriginalBody_LOD0'
    decimate(body, 16000 if unit != 'worker' else 15800)
    arm = armature_object(unit, landmarks)
    bind_auto(body, arm)
    skirt_count = apply_priest_skirt_weights(body, landmarks) if unit == 'priest' else 0
    repaired_weights = fill_sparse_auto_weights(body,arm)
    makers = {'worker':lambda:[worker_axe(landmarks,mats,arm)],'crossbow':lambda:crossbow_weapon(landmarks,mats,arm),
              'priest':lambda:priest_staff(landmarks,mats,arm),'commander':lambda:commander_weapons(landmarks,mats,arm),
              'neutral-raider':lambda:raider_axe(landmarks,mats,arm)}
    equipment = makers[unit]()
    lod0 = [body,*equipment]
    body1 = duplicate_lod(body, max(7100,9200-sum(triangles(item) for item in equipment)))
    repaired_weights_lod1 = fill_sparse_auto_weights(body1,arm)
    equipment1 = []
    for obj in equipment:
        copy = obj.copy()
        copy.data = obj.data.copy()
        bpy.context.collection.objects.link(copy)
        copy.name = obj.name.replace('LOD0','LOD1')
        equipment1.append(copy)
    lod1 = [body1,*equipment1]
    counts = {label:{obj.name:triangles(obj) for obj in objects} for label,objects in (('lod0',lod0),('lod1',lod1))}
    counts['lod0_total'] = sum(counts['lod0'].values())
    counts['lod1_total'] = sum(counts['lod1'].values())
    if counts['lod0_total'] >= 20000 or not 7000 <= counts['lod1_total'] <= 10000:
        raise RuntimeError(f'Triangle budget failed: {counts}')
    weights = {obj.name:weight_metrics(obj) for obj in lod0+lod1}
    if any(item['unweighted'] or item['max_influences']>4 or item['max_weight_sum_error']>.01 for item in weights.values()):
        raise RuntimeError(f'Skin failed: {weights}')
    actions = make_actions(arm,unit,lod0)
    center,distance = setup_render_scene(landmarks['height_m'])
    scene = bpy.context.scene
    scene.world.color = (.45,.45,.45)
    for obj in lod1:
        obj.hide_render = True
    renders = {}
    body_texture_node = next(node for node in mats['body'].node_tree.nodes if node.bl_idname == 'ShaderNodeTexImage')
    original_body_image = body_texture_node.image
    for color,rgba in (('blue',(.28,.48,.90,1)),('red',(.87,.20,.17,1))):
        if team_mask:
            body_texture_node.image = bpy.data.images.load(str((candidate/f'preview-{color}-1024-q90.jpg').resolve()),check_existing=True)
        if 'team' in mats:
            set_team_tint(mats['team'],rgba)
        if 'shield_team' in mats:
            mats['shield_team'].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = rgba
        for view,location in (('front',center+Vector((0,distance,0))),('side',center+Vector((distance,0,0))),('back',center+Vector((0,-distance,0)))):
            if color == 'blue':
                renders[view] = render_view(view,location,center,landmarks['height_m']*1.22,640,800,qa/f'{view}.png')
            elif team_mask and view == 'front':
                renders['red-front'] = render_view('red-front',location,center,landmarks['height_m']*1.22,640,800,qa/'front-red.png')
        renders[color+'-64'] = render_view(color+'-64',center+Vector((distance,distance,distance*.75)),center,landmarks['height_m']*1.38,64,64,qa/f'{color}-64.png')
    if 'team' in mats:
        set_team_tint(mats['team'],(1,1,1,1))
    if team_mask:
        body_texture_node.image = original_body_image
    if 'shield_team' in mats:
        mats['shield_team'].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (1,1,1,1)
    for clip in ('Walk','Attack','Death'):
        arm.animation_data.action = actions[clip]
        for frame,_ in clip_frames(unit)[clip]:
            scene.frame_set(frame)
            motion_scale = landmarks['height_m'] * (1.9 if clip == 'Death' else 1.38)
            render_view(clip+str(frame),center+Vector((distance,distance,distance*.75)),center,motion_scale,200,240,qa/f'{clip.lower()}-{frame:02d}.png')
            if unit == 'crossbow' and clip == 'Attack' and frame == 16:
                render_view('CrossbowAttackFront',center+Vector((0,distance,0)),center,landmarks['height_m']*1.22,640,800,qa/'attack-front.png')
    ground = inspect_ground(scene,arm,actions,lod0)
    blend = candidate / f'{unit}-production-{"v2" if team_mask else "v1"}.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    exports = {}
    for label, objects in (('lod0',lod0),('lod1',lod1)):
        for obj in lod0+lod1:
            obj.hide_render = obj not in objects
        select_export([arm,*objects])
        path = candidate / f'{unit}-production-{label}.glb'
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=True,
            export_animation_mode='ACTIONS',export_image_format='JPEG',export_jpeg_quality=90,
            export_skins=True,export_yup=True,export_def_bones=True,export_extras=team_mask)
        exports[label] = {'path':str(path),'bytes':path.stat().st_size,'sha256':sha256(path)}
    report = {'unit':unit,'source':source,'team_masked_v2':team_mask,'skirt_vertices':skirt_count,'repaired_sparse_weights':{'lod0':repaired_weights,'lod1':repaired_weights_lod1},'triangles':counts,'weights':weights,
              'bones':list(arm.data.bones.keys()),'clips':list(actions),'renders':renders,'ground':ground,
              'blend':{'path':str(blend),'sha256':sha256(blend)},'exports':exports,'runtime_publish_allowed':False}
    (qa/'production-build.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
    print('HUMAN_UNIT_PRODUCTION='+json.dumps({'unit':unit,'triangles':counts,'exports':exports}),flush=True)


def worker_milestone(root, run):
    body, landmarks, source = load_original_body(root, 'worker', run)
    prep = run / 'candidate'
    cloth_faces = set(json.loads((prep / 'cloth-faces.json').read_text(encoding='utf-8')))
    mats = {
        'body': material('WorkerBodyPBR', (1, 1, 1), .05, .62, prep / 'body-1024-q90.jpg'),
        'team': material('TeamCloth_Worker', (1, 1, 1), 0, .75, prep / 'teamcloth-neutral-1024-q90.jpg', tintable=True),
        'wood': material('WorkedAshWood', (.26, .13, .055), .02, .68),
        'steel': material('ForgedToolSteel', (.53, .58, .63), .78, .36),
        'brass': material('OldBrassAxeFittings', (.57, .38, .14), .68, .39),
        'leather': material('WornLeatherAxeGrip', (.20, .11, .061), .02, .8),
    }
    body.data.materials.clear()
    body.data.materials.append(mats['body'])
    body.data.materials.append(mats['team'])
    for index, face in enumerate(body.data.polygons):
        face.material_index = 1 if index in cloth_faces else 0
        face.use_smooth = True
    body.name = 'WorkerOriginalBody_LOD0'
    decimate(body, 15800)
    arm = armature_object('worker', landmarks)
    bind_auto(body, arm)
    axe = worker_axe(landmarks, mats, arm)
    weights = weight_metrics(body)
    metrics = {'source': source, 'body_triangles': triangles(body), 'axe_triangles': triangles(axe), 'bones': len(arm.data.bones), 'weights': weights,
               'equipment_socket': {'bone': 'Hand_R', 'rest_world_position': list(landmarks['bones']['Hand_R'][0])}, 'runtime_publish_allowed': False}
    if weights['unweighted'] or weights['max_influences'] > 4 or weights['max_weight_sum_error'] > .01:
        raise RuntimeError(f'Worker skin failed: {weights}')
    center, distance = setup_render_scene(landmarks['height_m'])
    set_team_tint(mats['team'], (.28, .48, .9, 1))
    qa = run / 'qa'
    renders = {
        'front': render_view('worker-front', center + Vector((0, distance, 0)), center, landmarks['height_m'] * 1.22, 640, 800, qa / 'worker-milestone-front.png'),
        'side': render_view('worker-side', center + Vector((distance, 0, 0)), center, landmarks['height_m'] * 1.22, 640, 800, qa / 'worker-milestone-side.png'),
        'back': render_view('worker-back', center + Vector((0, -distance, 0)), center, landmarks['height_m'] * 1.22, 640, 800, qa / 'worker-milestone-back.png'),
    }
    metrics['renders'] = renders
    set_team_tint(mats['team'], (1, 1, 1, 1))
    blend = prep / 'worker-milestone.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    metrics['blend'] = str(blend)
    metrics['blend_sha256'] = sha256(blend)
    (qa / 'worker-milestone.json').write_text(json.dumps(metrics, indent=2) + '\n', encoding='utf-8', newline='\n')
    print('HUMAN_WORKER_MILESTONE=' + json.dumps({'body_triangles': metrics['body_triangles'], 'axe_triangles': metrics['axe_triangles'], 'bones': metrics['bones'], 'weights': weights, 'blend': str(blend)}), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--project-root', type=Path, required=True)
    parser.add_argument('--unit', choices=UNITS, required=True)
    parser.add_argument('--stage', choices=('worker-milestone','production','masked-v2'), required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    root = args.project_root.resolve()
    version = '2026-10-05-v2' if args.stage == 'masked-v2' else '2026-10-05-v1'
    run = root / 'art-factory/rts/runs/human-units' / version / args.unit
    if args.stage == 'worker-milestone':
        if args.unit != 'worker':
            raise ValueError('Worker milestone is specific to the worker input')
        worker_milestone(root, run)
    elif args.stage == 'production':
        production(root, args.unit, run)
    elif args.stage == 'masked-v2':
        if args.unit not in ('priest','commander'):
            raise ValueError('Masked v2 stage is scoped to priest and commander')
        production(root,args.unit,run,team_mask=True)


if __name__ == '__main__':
    main()
