"""Append original actions to source-locked rigs; write candidates only.

blender --background --factory-startup --python-exit-code 1 --python <this>
No runtime files or published registries are written.
"""
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Quaternion, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from animation_append import append_animations
from procedural_gauntlet_publish import read_glb, write_glb
from work_cast_spec import POSES
from rigid_weapon_transform import flip_weapon_x

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / 'art-factory/rts/runs/work-cast/2026-10-11-v2'
OLD_CLIPS = ('Idle', 'Walk', 'Attack', 'Hurt', 'Death')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def curves(action):
    return [curve for layer in action.layers for strip in layer.strips for slot in action.slots
            for bag in [strip.channelbag(slot)] if bag for curve in bag.fcurves]


def value(raw):
    if isinstance(raw, (bool, int, float, str)) or raw is None:
        return raw
    try:
        return list(raw)
    except TypeError:
        return getattr(raw, 'name', str(raw))


def fingerprint(rig):
    meshes = []
    for obj in sorted((o for o in bpy.data.objects if o.type == 'MESH'), key=lambda o: o.name):
        meshes.append({'name': obj.name, 'vertices': [list(v.co) for v in obj.data.vertices],
                       'faces': [[*p.vertices, p.material_index] for p in obj.data.polygons],
                       'uv': [[list(loop.uv) for loop in layer.data] for layer in obj.data.uv_layers],
                       'weights': [[[g.group, g.weight] for g in v.groups] for v in obj.data.vertices],
                       'groups': [g.name for g in obj.vertex_groups], 'materials': [m.name for m in obj.data.materials],
                       'matrix': [list(row) for row in obj.matrix_world]})
    bones = [[b.name, b.parent.name if b.parent else None, *[list(row) for row in b.matrix_local]] for b in rig.data.bones]
    actions = {name: [[c.data_path, c.array_index, [[*p.co, *p.handle_left, *p.handle_right, p.interpolation] for p in c.keyframe_points]]
                      for c in curves(bpy.data.actions[name])] for name in OLD_CLIPS}
    materials = []
    for mat in sorted(bpy.data.materials, key=lambda m: m.name):
        nodes = []
        if mat.use_nodes:
            for node in mat.node_tree.nodes:
                nodes.append([node.name, node.bl_idname, [[socket.identifier, value(socket.default_value)] for socket in node.inputs if hasattr(socket, 'default_value')],
                              node.image.name if hasattr(node, 'image') and node.image else None])
        materials.append([mat.name, nodes, [[l.from_node.name, l.from_socket.identifier, l.to_node.name, l.to_socket.identifier] for l in mat.node_tree.links] if mat.use_nodes else []])
    payload = {'meshes': meshes, 'bones': bones, 'actions': actions, 'materials': materials, 'fps': bpy.context.scene.render.fps}
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def set_action(rig, action):
    rig.animation_data.action = action
    if action.slots:
        rig.animation_data.action_slot = action.slots[0]


def ground(objects):
    dependency = bpy.context.evaluated_depsgraph_get(); minima = []
    for obj in objects:
        evaluated = obj.evaluated_get(dependency); mesh = evaluated.to_mesh()
        try:
            coords = np.empty(len(mesh.vertices) * 3, dtype=np.float64)
            mesh.vertices.foreach_get('co', coords); coords = coords.reshape(-1, 3)
            matrix = np.array(evaluated.matrix_world)
            minima.append(float((coords @ matrix[2, :3] + matrix[2, 3]).min()))
        finally:
            evaluated.to_mesh_clear()
    return min(minima)


def build(record):
    unit = record['unit']; source = ROOT / record['source']['path']
    assert sha(source) == record['source']['sha256'], 'Source lock changed'
    bpy.ops.wm.open_mainfile(filepath=str(source))
    rigs = [o for o in bpy.data.objects if o.type == 'ARMATURE']; assert len(rigs) == 1
    rig = rigs[0]; scene = bpy.context.scene; assert scene.render.fps == 24
    before = fingerprint(rig)
    set_action(rig, bpy.data.actions['Idle']); scene.frame_set(0)
    baseline = {b.name: (b.location.copy(), b.rotation_quaternion.copy(), b.scale.copy()) for b in rig.pose.bones}
    hand_orientation = rig.pose.bones['Hand_R'].matrix.to_quaternion()
    objects = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.endswith('LOD0')]
    assert objects
    body = [o for o in objects if 'Body' in o.name]; assert len(body) == 1
    idle_floor = ground(body); motion = {}
    for name, frames in POSES[unit].items():
        assert name not in bpy.data.actions, 'Do not replace an existing action'
        action = bpy.data.actions.new(name); rig.animation_data.action = action
        for frame, pose in frames:
            for bone in rig.pose.bones:
                location, rotation, scale = baseline[bone.name]
                bone.rotation_mode = 'QUATERNION'; bone.location = location; bone.rotation_quaternion = rotation; bone.scale = scale
                if bone.name in pose:
                    turns = pose[bone.name]; turns = turns if isinstance(turns[0], tuple) else (turns,)
                    delta = Quaternion((1, 0, 0, 0))
                    for axis, degrees in turns:
                        world = {'X': Vector((1, 0, 0)), 'Y': Vector((0, 1, 0)), 'Z': Vector((0, 0, 1))}[axis]
                        delta = delta @ Quaternion(bone.bone.matrix_local.to_3x3().inverted() @ world, math.radians(degrees))
                    bone.rotation_quaternion = rotation @ delta
                for channel in ('location', 'rotation_quaternion', 'scale'):
                    bone.keyframe_insert(data_path=channel, frame=frame, group=bone.name)
        action.use_fake_user = True
        for curve in curves(action):
            for key in curve.keyframe_points:
                key.interpolation = 'BEZIER'; key.handle_left_type = key.handle_right_type = 'AUTO_CLAMPED'
        if unit == 'priest':
            # Preserve the staff's Idle world orientation while the shoulder
            # reaches forward. Solve the evaluated parent chain per exported
            # frame rather than adding Euler angles from different bone axes.
            hand = rig.pose.bones['Hand_R']
            for frame in range(frames[-1][0] + 1):
                scene.frame_set(frame); bpy.context.view_layer.update()
                desired = hand_orientation.to_matrix().to_4x4(); desired.translation = hand.matrix.translation
                hand.matrix = desired
                hand.keyframe_insert(data_path='rotation_quaternion', frame=frame, group=hand.name)
        floors = []
        for frame in range(frames[-1][0] + 1):
            scene.frame_set(frame); floors.append(ground(body))
        deviation = max(abs(f - idle_floor) for f in floors)
        assert deviation <= .015, f'{unit}/{name} moved feet: {deviation}'
        motion[name] = {'frames': [f for f, _ in frames], 'seconds': frames[-1][0] / scene.render.fps,
                        'body_floor_min': min(floors), 'body_floor_max': max(floors), 'idle_floor': idle_floor,
                        'max_floor_deviation': deviation, 'ground_pass': True}
    set_action(rig, bpy.data.actions['Idle']); scene.frame_set(0)
    after = fingerprint(rig); assert before == after, 'Source mesh/material/rig/old actions changed'
    grip_revision = []
    if unit == 'commander':
        for obj in (o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('CommanderLongsword_LOD')):
            indices = {i for p in obj.data.polygons if obj.data.materials[p.material_index].name == 'WornLeatherGrip' for i in p.vertices}
            assert indices, 'Missing source leather grip'
            pivot = [(min(obj.data.vertices[i].co[axis] for i in indices)+max(obj.data.vertices[i].co[axis] for i in indices))/2 for axis in range(3)]
            for vertex in obj.data.vertices:
                vertex.co.y = 2*pivot[1]-vertex.co.y; vertex.co.z = 2*pivot[2]-vertex.co.z
            obj.data.update(); grip_revision.append({'mesh': obj.name, 'pivot_blender': pivot, 'rotation_x_degrees': 180})
    blend = RUN / f'raw/{unit}-work-cast.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [rig, *objects]:
        obj.hide_set(False); obj.hide_viewport = False; obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    exported = RUN / f'raw/{unit}-animation-source.glb'
    bpy.ops.export_scene.gltf(filepath=str(exported), export_format='GLB', use_selection=True, export_extras=True,
                             export_animations=True, export_animation_mode='ACTIONS', export_nla_strips=False,
                             export_force_sampling=True, export_optimize_animation_size=False, export_frame_step=1,
                             export_skins=True, export_morph=False, export_materials='EXPORT', export_apply=False,
                             export_yup=True, export_cameras=False, export_lights=False)
    source_doc, source_bin = read_glb(exported); candidates = []
    for lod in (0, 1):
        base = RUN / f'raw/input/{unit}-lod{lod}.glb'
        assert sha(base) == record['base_glbs'][lod]['sha256']
        doc, binary = read_glb(base)
        out, packed = append_animations(doc, binary, source_doc, source_bin, list(POSES[unit]))
        weapon = None
        if unit == 'commander':
            out, packed, weapon = flip_weapon_x(out, packed, f'CommanderLongsword_LOD{lod}')
        target = RUN / f'candidate/{unit}-lod{lod}.glb'; write_glb(target, out, packed)
        candidates.append({'lod': lod, 'path': target.relative_to(ROOT).as_posix(), 'sha256': sha(target), 'bytes': target.stat().st_size, 'weapon_transform': weapon})
    return {'unit': unit, 'source_fingerprint_before': before, 'source_fingerprint_after': after,
            'editable_source': {'path': blend.relative_to(ROOT).as_posix(), 'sha256': sha(blend)},
            'motion': motion, 'candidates': candidates, 'grip_revision': grip_revision,
            'derivative_fingerprint': fingerprint(rig), 'runtime_publish_allowed': False}


def main():
    lock = json.loads((RUN / 'source-lock.json').read_text(encoding='utf-8'))
    rows = []
    for record in lock['units']:
        row = build(record); rows.append(row)
        (RUN / 'qa/build.json').write_text(json.dumps({'units': rows, 'runtime_publish_allowed': False}, indent=2) + '\n', encoding='utf-8')
        print('WORK_CAST_CANDIDATE=' + json.dumps({'unit': row['unit'], 'candidates': row['candidates']}), flush=True)


if __name__ == '__main__':
    main()
