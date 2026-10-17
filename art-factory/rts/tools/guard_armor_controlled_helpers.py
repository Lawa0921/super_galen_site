"""Assemble original armor shells and six explicit animated helper bones.

This authoring candidate is never published by this script. The original 25
bones, their curves, non-arm meshes, and actual cloth wrist seams are protected.
"""
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Matrix

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from armor_twist_track import TwistWindow, correct_module_skins, signed_twist
from original_guard_articulated_armor import module_skin_matrices
from guard_armor_relief_inventory import components, CLIPS
from guard_hand_ik_repair import mesh_signature
from hand_action_curve_write import replace_linear_curve
from original_guard_walk_refine import action_fcurves

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT/'art-factory/rts/runs/guard-right-hand-cage'
INPUT = BASE/'2026-10-08-v30-armor-interface-fit'
RUN = BASE/'2026-10-08-v32-controlled-armor-verified'
SOURCE = BASE/'2026-10-08-v29-attack-start-exterior-tangent/candidate/guard-authored-attack.blend'
SOURCE_SHA = 'd010152889219efed40023ef689b14b9440562c6bb3f3e2d00acc5da62381d54'
CANDIDATE = RUN/'candidate/guard-controlled-armor.blend'
HELPERS = {side: ['Armor'+part+'_'+side for part in ('Upper', 'Fore', 'Elbow')] for side in ('R', 'L')}
STEP = 32


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def curve_signature(original_only=True):
    rows = {}
    for action in bpy.data.actions:
        rows[action.name] = [[fc.data_path, fc.array_index, fc.extrapolation,
            [[list(k.co), list(k.handle_left), list(k.handle_right), k.interpolation, k.handle_left_type, k.handle_right_type] for k in fc.keyframe_points]]
            for fc in action_fcurves(action) if not (original_only and fc.data_path.startswith('pose.bones["Armor'))]
    return hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()


def window_from_source():
    meta = json.loads((INPUT/'qa/source-poses.json').read_text(encoding='utf-8'))
    assert meta['source_sha256'] == SOURCE_SHA
    assert sha(INPUT/'raw/source-poses.npz') == meta['artifacts_sha256']['source-poses.npz']
    frozen = np.load(INPUT/'raw/source-poses.npz')
    names = meta['bones']
    rest = frozen['rest'][[names.index(n+'_R') for n in ('UpperArm', 'Forearm', 'Hand')], :3, 3]
    angles, raw_matrices = [], []
    for k, posed in enumerate(frozen['Death_joints'][:, 0]):
        raw = module_skin_matrices(rest, posed)
        axes = np.diff(posed, axis=0)
        axes /= np.linalg.norm(axes, axis=1)[:, None]
        row = [signed_twist(raw[i][:3, :3], frozen['Death_skin'][k, names.index(n+'_R'), :3, :3], axes[i]) for i, n in enumerate(('UpperArm', 'Forearm'))]
        angles.append(row)
        raw_matrices.append(raw)
    angles = np.unwrap(angles, axis=0)
    angles[:, 1] += round(np.mean(angles[:, 0]-angles[:, 1])/(2*np.pi))*2*np.pi
    window = TwistWindow(frozen['Death_times'], angles, 10., 22.)
    return window


def planned_skins(rig, rest, side, clip, time, window):
    posed = np.array([rig.pose.bones[n+'_'+side].head[:] for n in ('UpperArm', 'Forearm', 'Hand')])
    raw = np.array(module_skin_matrices(rest, posed))
    if clip != 'Death' or side != 'R' or not window.start < time < window.end:
        return raw
    axes = np.diff(posed, axis=0)
    axes /= np.linalg.norm(axes, axis=1)[:, None]
    original = [np.array(rig.pose.bones[n+'_'+side].matrix @ rig.data.bones[n+'_'+side].matrix_local.inverted()) for n in ('UpperArm', 'Forearm')]
    angles = [signed_twist(raw[i, :3, :3], original[i][:3, :3], axes[i]) for i in range(2)]
    return correct_module_skins(rest, posed, raw, window.correction(time, angles))


def assemble_geometry(rig, models):
    report = {}
    for lod in (0, 1):
        arm = bpy.data.objects[f'GuardArms_LOD{lod}']
        islands = components(arm.data)
        assert len(islands) == 12
        kept = set(islands[5]+islands[11])
        mesh = arm.data
        identity = mesh.attributes.new(name='original_arm_vertex', type='INT', domain='POINT')
        for i, item in enumerate(identity.data):
            item.value = i
        before = {i: (list(mesh.vertices[i].co), [(g.group, g.weight) for g in mesh.vertices[i].groups]) for i in kept}
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in kept], context='VERTS')
        bm.to_mesh(mesh)
        bm.free()
        after = {mesh.attributes['original_arm_vertex'].data[v.index].value: (list(v.co), [(g.group, g.weight) for g in v.groups]) for v in mesh.vertices}
        assert before == after, 'Retained sleeve positions and weights changed'
        report[arm.name] = {'retained_vertices': len(kept), 'source_ids': sorted(kept), 'unchanged_positions_and_weights': True}
        for side in ('R', 'L'):
            for name, part in models[side+str(lod)].items():
                data = bpy.data.meshes.new(name+'_'+side+'_authored_LOD'+str(lod))
                data.from_pydata(part['points'], [], part['faces'])
                data.update()
                for material in mesh.materials:
                    data.materials.append(material)
                uv = data.uv_layers.new(name='AuthoredArmorUV')
                for p in data.polygons:
                    p.use_smooth = True
                    p.material_index = part['materials'][p.index]
                    coords = [part['uv'][v] for v in p.vertices]
                    wrap = part.get('periodic_columns') and max(c[0] for c in coords)-min(c[0] for c in coords) > .875
                    for li in p.loop_indices:
                        coord = list(part['uv'][data.loops[li].vertex_index])
                        if wrap and coord[0] < .875:
                            coord[0] += 1.75
                        uv.data[li].uv = coord
                obj = bpy.data.objects.new('Guard'+name+'_'+side+'_LOD'+str(lod), data)
                arm.users_collection[0].objects.link(obj)
                obj.parent = rig
                obj.hide_render = lod == 1
                obj['original_module_part'] = name
                obj['source_geometry_sha256'] = sha(INPUT/'raw/modules-v3.json')
                obj['shell_thickness_m'] = part['thickness_m']
                mapping = dict(zip(('UpperArmArmor', 'ForearmArmor', 'ElbowArmor'), HELPERS[side]))
                mapping.update({'ShoulderSpaulder': 'UpperArm_'+side, 'WristCuff': 'Forearm_'+side})
                obj.vertex_groups.new(name=mapping[name]).add(list(range(len(data.vertices))), 1., 'REPLACE')
                mod = obj.modifiers.new('Original armor skin', 'ARMATURE')
                mod.object = rig
                for column, attr_name in enumerate(('module_row', 'module_column')):
                    attr = data.attributes.new(name=attr_name, type='INT', domain='POINT')
                    for i, identity_row in enumerate(part['surface_ids']):
                        attr.data[i].value = int(identity_row[column+1])
                attr = data.attributes.new(name='module_inner_surface', type='BOOLEAN', domain='POINT')
                for i, identity_row in enumerate(part['surface_ids']):
                    attr.data[i].value = identity_row[-1] == 'inner'
                data.calc_loop_triangles()
                report[obj.name] = {'vertices': len(data.vertices), 'triangles': len(data.loop_triangles), 'binding': mapping[name]}
    return report


def main():
    assert sha(SOURCE) == SOURCE_SHA
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    scene, rig = bpy.context.scene, bpy.data.objects['GuardRig20']
    names = [b.name for b in rig.data.bones]
    assert len(names) == 25 and scene.render.fps == 30
    rest_bones = {b.name: b.matrix_local.copy() for b in rig.data.bones}
    rest = {s: np.array([rig.data.bones[n+'_'+s].head_local[:] for n in ('UpperArm', 'Forearm', 'Hand')]) for s in HELPERS}
    curves_before, meshes_before = curve_signature(), mesh_signature()
    visibility_before = {obj.name: obj.hide_render for obj in bpy.data.objects if obj.type == 'MESH'}
    window = window_from_source()
    # Capture intended helpers while the original rig still has no added bones.
    captured = {}
    for clip in CLIPS:
        rig.animation_data.action = bpy.data.actions[clip]
        times = np.arange(round(rig.animation_data.action.frame_range[1]*STEP)+1)/STEP
        rows = {side: [] for side in HELPERS}
        source_rows = []
        for time in times:
            scene.frame_set(math.floor(time), subframe=time % 1)
            for side in HELPERS:
                rows[side].append(planned_skins(rig, rest[side], side, clip, time, window))
            source_rows.append([np.array(rig.pose.bones[n].matrix) for n in names])
        captured[clip] = {'times': times, **{s: np.array(v) for s, v in rows.items()}, 'original_poses': np.array(source_rows)}
        print('HELPER_CAPTURE', clip, len(times), flush=True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for side, helpers in HELPERS.items():
        for name, original in zip(helpers, ('UpperArm_', 'Forearm_', 'ElbowSupport_')):
            b = rig.data.edit_bones.new(name)
            b.matrix = rest_bones[original+side]
            b.length = .10
            b.use_deform = True
    bpy.ops.object.mode_set(mode='OBJECT')
    rest_error = max(float(np.max(np.abs(np.array(rig.data.bones[n].matrix_local)-np.array(rest_bones[n])))) for n in names)
    assert rest_error < 2e-7, rest_error
    for side, helpers in HELPERS.items():
        for name in helpers:
            rig.pose.bones[name].rotation_mode = 'QUATERNION'
    for clip, capture in captured.items():
        action = bpy.data.actions[clip]
        rig.animation_data.action = action
        bag = action.layers[0].strips[0].channelbag(rig.animation_data.action_slot)
        for side, helpers in HELPERS.items():
            for i, name in enumerate(helpers):
                bind = rig.data.bones[name].matrix_local.copy()
                inverse = bind.inverted()
                location, quats = [], []
                previous = None
                for skin in capture[side][:, i]:
                    basis = inverse @ Matrix(skin.tolist()) @ bind
                    loc, q, scale = basis.decompose()
                    assert max(abs(v-1) for v in scale) < 2e-5
                    if previous is not None and q.dot(previous) < 0:
                        q.negate()
                    previous = q.copy()
                    location.append(list(loc))
                    quats.append(list(q))
                for prop, values in (('location', np.array(location)), ('rotation_quaternion', np.array(quats))):
                    for index in range(values.shape[1]):
                        fc = bag.fcurves.new(f'pose.bones["{name}"].{prop}', index=index)
                        replace_linear_curve(fc, capture['times'], values[:, index])
        print('HELPER_CURVES', clip, flush=True)
    assert curve_signature() == curves_before, 'Protected original action curves changed'
    maximum_original_pose_error, maximum_helper_point_bound = 0., 0.
    for clip, capture in captured.items():
        rig.animation_data.action = bpy.data.actions[clip]
        for index in range(len(capture['times'])):
            time = capture['times'][index]
            scene.frame_set(math.floor(time), subframe=time % 1)
            actual = np.array([np.array(rig.pose.bones[n].matrix) for n in names])
            maximum_original_pose_error = max(maximum_original_pose_error, float(np.max(np.abs(actual-capture['original_poses'][index]))))
            for side, helpers in HELPERS.items():
                for i, name in enumerate(helpers):
                    actual_skin = np.array(rig.pose.bones[name].matrix @ rig.data.bones[name].matrix_local.inverted())
                    delta = actual_skin-capture[side][index, i]
                    maximum_helper_point_bound = max(maximum_helper_point_bound, float(np.linalg.norm(delta[:3, 3])+2*np.linalg.norm(delta[:3, :3], 2)))
    assert maximum_original_pose_error < 2e-6, maximum_original_pose_error
    assert maximum_helper_point_bound < .00001, maximum_helper_point_bound
    geometry = assemble_geometry(rig, json.loads((INPUT/'raw/modules-v3.json').read_text(encoding='utf-8')))
    meshes_after = mesh_signature()
    assert all(meshes_after[n] == h for n, h in meshes_before.items() if n not in ('GuardArms_LOD0', 'GuardArms_LOD1'))
    assert all(bpy.data.objects[n].hide_render == value for n, value in visibility_before.items())
    rig['armor_helper_authoring'] = 'v32-original-controlled-Death-R10-22'
    rig.animation_data.action = bpy.data.actions['Idle']
    scene.frame_set(0)
    CANDIDATE.parent.mkdir(parents=True, exist_ok=True)
    (RUN/'qa').mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(CANDIDATE))
    report = {'status': 'saved_authoring_candidate_pending_visual_dense_collision_reload_export', 'runtime_publish_allowed': False,
        'source_sha256': SOURCE_SHA, 'geometry_sha256': sha(INPUT/'raw/modules-v3.json'), 'candidate_sha256': sha(CANDIDATE),
        'window': window.record(), 'samples_per_frame': STEP, 'validation_samples_per_frame': STEP,
        'control_samples_validated': sum(len(row['times']) for row in captured.values()), 'helpers': HELPERS,
        'source_poses_npz_sha256': sha(INPUT/'raw/source-poses.npz'),
        'recipe_sha256': {name: sha(Path(__file__).parent/name) for name in ('armor_twist_track.py', 'guard_armor_controlled_helpers.py', 'hand_action_curve_write.py', 'original_guard_articulated_armor.py')},
        'original_mesh_visibility': visibility_before,
        'original_bones': names, 'original_curves_signature': curves_before, 'non_arm_mesh_signatures': {n: h for n, h in meshes_before.items() if n not in ('GuardArms_LOD0', 'GuardArms_LOD1')},
        'maximum_rest_matrix_component_error': rest_error, 'maximum_original_pose_component_error': maximum_original_pose_error,
        'maximum_helper_two_metre_point_bound_m': maximum_helper_point_bound, 'geometry': geometry,
        'limitations': ['Original helper analytical roll retained except declared Death_R window', 'Dense inclusive/containment, off-grid reload, visual motion and new export parity are pending', 'Full original hand remains unfinished']}
    (RUN/'qa/authoring.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8', newline='\n')
    print('CONTROLLED_ARMOR_SAVED', report['candidate_sha256'], 'max_pose_error', maximum_original_pose_error, 'helper_bound_m', maximum_helper_point_bound, flush=True)


if __name__ == '__main__':
    main()
