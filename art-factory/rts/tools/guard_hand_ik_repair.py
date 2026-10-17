"""Close failing wrist motion tracks while preserving rigid equipment world paths."""
import bpy, hashlib, json, math, sys
from pathlib import Path
import numpy as np
from mathutils import Matrix, Vector
sys.path.insert(0, str(Path(__file__).parent))
from guard_hand_ik_preflight import ROOT, BIND_RUN, RUN as PREFLIGHT_RUN, TARGETS, MAX_GAP
from original_guard_walk_refine import action_fcurves
from original_guard_walk_refine_math import solve_two_link
from hand_bind_sampling import adaptive_linear_keys
from hand_action_curve_write import replace_linear_curve

RUN = PREFLIGHT_RUN.with_name('2026-10-08-v15-wrist-motion-exact-curves')
SOURCE = BIND_RUN / 'candidate/guard-canonical-hand-bind.blend'
SOURCE_SHA = '987ed5120bd0dfc7e2fd193e546cef289b6ff77a7cd138676aba97324b65a82c'
CLIPS = ('Idle', 'Walk', 'Attack', 'Hurt', 'Death')
QA_STEP = 256
CONTROL_STEP = 128
LOCAL_CHANNEL_ERROR = .000001
DIAGNOSE = '--diagnose-hurt-left' in sys.argv
if DIAGNOSE:
    TARGETS = {'Hurt': ('L',)}
    CLIPS = ('Hurt',)
    RUN = RUN.with_name('2026-10-08-v15-hurt-diagnosis')


def allowed(clip, path):
    for side in TARGETS.get(clip, ()):
        if path == f'pose.bones["UpperArm_{side}"].rotation_quaternion':
            return True
        if any(path == f'pose.bones["{part}_{side}"].{prop}' for part in ('Forearm', 'Hand', 'ElbowSupport') for prop in ('location', 'rotation_quaternion')):
            return True
    return False


def protected_signature(rig):
    records = {'bones': {b.name: [list(r) for r in b.matrix_local] for b in rig.data.bones}, 'curves': {}}
    for action in bpy.data.actions:
        records['curves'][action.name] = [[fc.data_path, fc.array_index, [[list(k.co), list(k.handle_left), list(k.handle_right), k.interpolation] for k in fc.keyframe_points]] for fc in action_fcurves(action) if not allowed(action.name, fc.data_path)]
    return hashlib.sha256(json.dumps(records, sort_keys=True).encode()).hexdigest()


def mesh_signature():
    result = {}
    for obj in bpy.data.objects:
        if obj.type != 'MESH':
            continue
        data = {'vertices': [list(v.co) for v in obj.data.vertices], 'faces': [list(p.vertices) for p in obj.data.polygons],
                'weights': [[(g.group, g.weight) for g in v.groups] for v in obj.data.vertices]}
        result[obj.name] = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
    return result


def main():
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == SOURCE_SHA
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    rig = bpy.data.objects['GuardRig20']
    scene = bpy.context.scene
    assert rig['canonical_hand_bind_version'] == 'guard-hands-v1'
    rig.data.pose_position = 'POSE'
    before_signature, meshes = protected_signature(rig), mesh_signature()
    rest = {s: rig.data.bones['Hand_' + s].matrix_local.copy() for s in ('R', 'L')}
    binding = json.loads((BIND_RUN / 'qa/canonical-bind.json').read_text(encoding='utf-8'))
    assets = {name: {'side': item['side'], 'points': np.asarray([v.co for v in bpy.data.objects[name].data.vertices], float)} for name, item in binding['assets'].items()}
    captured, plan, reach, key_sets, channels, curve_roundtrip = {}, {}, {}, {}, {}, {}
    for clip in CLIPS:
        rig.animation_data.action = bpy.data.actions[clip]
        count = round(rig.animation_data.action.frame_range[1]) * QA_STEP + 1
        rows, solutions = [], {}
        for index in range(count):
            frame = index / QA_STEP
            scene.frame_set(math.floor(frame), subframe=frame % 1)
            row = {side: {part: rig.pose.bones[part + '_' + side].matrix.copy() for part in ('Hand', 'UpperArm', 'Forearm')} for side in ('R', 'L')}
            rows.append(row)
            if clip not in TARGETS or index % (QA_STEP // CONTROL_STEP):
                continue
            solved_rows = {}
            for side in TARGETS[clip]:
                upper, fore, hand = (rig.pose.bones[n + '_' + side] for n in ('UpperArm', 'Forearm', 'Hand'))
                result = solve_two_link(upper.head, hand.head, fore.head, upper.bone.length, fore.bone.length)
                assert result['reach_margin'] > .001 and result['source_pole_offset'] > .001 and result['bend_radius'] > .001
                reach.setdefault(clip + '_' + side, []).append(result)
                elbow = Vector(result['knee'])
                matrices = {}
                for bone, head, tail in ((upper, upper.head.copy(), elbow), (fore, elbow, hand.head.copy())):
                    rotation = bone.matrix.to_3x3().col[1].normalized().rotation_difference((tail - head).normalized()) @ bone.matrix.to_quaternion()
                    matrices[bone.name] = Matrix.LocRotScale(head, rotation, Vector((1, 1, 1)))
                upper_matrix, fore_matrix = matrices[upper.name], matrices[fore.name]
                support = rig.pose.bones['ElbowSupport_' + side]
                rest_rotation = upper.bone.matrix_local.to_quaternion().slerp(fore.bone.matrix_local.to_quaternion(), .5)
                pose_rotation = upper_matrix.to_quaternion().slerp(fore_matrix.to_quaternion(), .5)
                support_rotation = pose_rotation @ rest_rotation.inverted() @ support.bone.matrix_local.to_quaternion()
                matrices[support.name] = Matrix.LocRotScale(elbow, support_rotation, Vector((1, 1, 1)))
                matrices[hand.name] = hand.matrix.copy()
                matrices['_upper_parent'] = upper.parent.matrix.copy()
                solved_rows[side] = matrices
            solutions[index] = solved_rows
        captured[clip], plan[clip] = rows, solutions
        if clip in TARGETS:
            indices = sorted(solutions)
            key_sets[clip] = {}
            channels[clip] = {}
            for side in TARGETS[clip]:
                values, last = [], {}
                channels[clip][side] = {}
                for index in indices:
                    matrices = solutions[index][side]
                    value = []
                    channel_row = {}
                    for part in ('UpperArm', 'Forearm', 'ElbowSupport', 'Hand'):
                        bone = rig.pose.bones[part + '_' + side]
                        assert bone.bone.use_inherit_rotation and bone.bone.inherit_scale == 'FULL' and bone.bone.use_local_location
                        parent_pose = matrices['_upper_parent'] if part == 'UpperArm' else matrices[bone.parent.name]
                        parent_frame = parent_pose @ bone.parent.bone.matrix_local.inverted() @ bone.bone.matrix_local
                        basis = parent_frame.inverted() @ matrices[bone.name]
                        q = basis.to_quaternion().normalized()
                        if part in last and q.dot(last[part]) < 0:
                            q.negate()
                        last[part] = q.copy()
                        value.extend(q)
                        channel_row[part] = {'rotation_quaternion': list(q)}
                        if part == 'ElbowSupport':
                            value.extend(basis.translation)
                            channel_row[part]['location'] = list(basis.translation)
                        elif part in ('Forearm', 'Hand'):
                            channel_row[part]['location'] = [0., 0., 0.]
                    channels[clip][side][index] = channel_row
                    values.append(value)
                kept = adaptive_linear_keys([i / QA_STEP for i in indices], values, LOCAL_CHANNEL_ERROR * .8)
                key_sets[clip][side] = {indices[i] for i in kept}
        print('WRIST_CAPTURE', clip, count, flush=True)
    for clip in TARGETS:
        action = bpy.data.actions[clip]
        rig.animation_data.action = action
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in list(bag.fcurves):
                        if allowed(clip, curve.data_path):
                            bag.fcurves.remove(curve)
        curve_roundtrip[clip] = {}
        for side in TARGETS[clip]:
            indices = sorted(key_sets[clip][side])
            times = [index / QA_STEP for index in indices]
            lookup = {}
            for part in ('UpperArm', 'Forearm', 'ElbowSupport', 'Hand'):
                bone = rig.pose.bones[part + '_' + side]
                bone.rotation_mode = 'QUATERNION'
                for prop, width in [('rotation_quaternion', 4)] + ([] if part == 'UpperArm' else [('location', 3)]):
                    # Seed a unique layered-action channel once, then overwrite
                    # its entire key array. Never insert adjacent subframe keys.
                    bone.keyframe_insert(data_path=prop, frame=times[0], group=bone.name)
                    path = f'pose.bones["{bone.name}"].{prop}'
                    found = [fc for fc in action_fcurves(action) if fc.data_path == path]
                    assert len(found) == width and {fc.array_index for fc in found} == set(range(width))
                    for fc in found:
                        values = [channels[clip][side][index][part][prop][fc.array_index] for index in indices]
                        replace_linear_curve(fc, times, values)
                        lookup[(part, prop, fc.array_index)] = fc
            maximum = 0.
            for index, expected in channels[clip][side].items():
                wanted, evaluated = [], []
                for part in ('UpperArm', 'Forearm', 'ElbowSupport', 'Hand'):
                    for prop in ('rotation_quaternion',) + (('location',) if part == 'ElbowSupport' else ()):
                        for component, value in enumerate(expected[part][prop]):
                            wanted.append(value)
                            evaluated.append(lookup[(part, prop, component)].evaluate(index / QA_STEP))
                maximum = max(maximum, float(np.linalg.norm(np.asarray(wanted) - evaluated)))
            assert maximum <= LOCAL_CHANNEL_ERROR, (clip, side, maximum)
            curve_roundtrip[clip][side] = {'maximum_control_vector_error': maximum, 'control_samples': len(channels[clip][side]),
                                         'keys_per_channel': len(indices), 'duplicate_channels': 0}
        print('WRIST_BAKE', clip, {s: len(ids) for s, ids in key_sets[clip].items()}, flush=True)
    assert protected_signature(rig) == before_signature
    assert mesh_signature() == meshes
    metrics = {}
    for clip, rows in captured.items():
        rig.animation_data.action = bpy.data.actions[clip]
        result = {'samples': len(rows), 'max_joint_gap_m': 0., 'max_equipment_world_error_m': 0., 'max_upper_head_error_m': 0.}
        for index, row in enumerate(rows):
            frame = index / QA_STEP
            scene.frame_set(math.floor(frame), subframe=frame % 1)
            for side in ('R', 'L'):
                upper, fore, hand = (rig.pose.bones[n + '_' + side] for n in ('UpperArm', 'Forearm', 'Hand'))
                result['max_joint_gap_m'] = max(result['max_joint_gap_m'], (fore.tail - hand.head).length)
                result['max_upper_head_error_m'] = max(result['max_upper_head_error_m'], (upper.head - row[side]['UpperArm'].translation).length)
                old = np.asarray(row[side]['Hand'] @ rest[side].inverted())
                new = np.asarray(hand.matrix @ rest[side].inverted())
                for name, asset in assets.items():
                    if asset['side'] != side:
                        continue
                    points = asset['points']
                    error = float(np.linalg.norm(points @ (new[:3, :3] - old[:3, :3]).T + new[:3, 3] - old[:3, 3], axis=1).max())
                    if error > result['max_equipment_world_error_m']:
                        result['max_equipment_world_error_m'] = error
                        result['worst_equipment'] = {'mesh': name, 'frame': frame}
            if index % 2048 == 0:
                print('WRIST_QA_PROGRESS', clip, index, flush=True)
        metrics[clip] = result
        print('WRIST_QA', clip, json.dumps(result), flush=True)
        if DIAGNOSE:
            worst = round(1.484375 * QA_STEP)  # Frozen v14 failure witness on the control grid.
            side = 'L'
            selected = sorted(key_sets[clip][side])
            indices = [max(i for i in selected if i <= worst), worst, min(i for i in selected if i >= worst)]
            for index in indices:
                frame = index / QA_STEP
                scene.frame_set(math.floor(frame), subframe=frame % 1)
                matrices = plan[clip][index][side]
                for part in ('UpperArm', 'Forearm', 'Hand'):
                    bone = rig.pose.bones[part + '_' + side]
                    parent_pose = matrices['_upper_parent'] if part == 'UpperArm' else matrices[bone.parent.name]
                    basis = (parent_pose @ bone.parent.bone.matrix_local.inverted() @ bone.bone.matrix_local).inverted() @ matrices[bone.name]
                    expected = basis.to_quaternion().normalized()
                    actual = bone.rotation_quaternion.normalized()
                    print('WRIST_LOCAL_DIAG', frame, part, 'kept', index in selected,
                          'q_error', min((expected - actual).magnitude, (expected + actual).magnitude),
                          'pose_error', float(np.max(np.abs(np.asarray(bone.matrix) - np.asarray(matrices[bone.name])))),
                          'local_scale', list(bone.scale), flush=True)
    report = {'status': 'wrist_ik_candidate_pending_reload_export_collision_and_visual_review', 'runtime_publish_allowed': False,
              'rejected_predecessors': ['v13 uniform 960 Hz: joints closed but Attack world error 0.32038 mm', 'v14: Blender keyframe_insert merged nearby adaptive keys; world errors up to 7.83565 mm. Neither candidate saved.'],
              'curve_write_correction': 'Write the exact precomputed adaptive local channels with keyframe_points.add/foreach_set and sort/handles_recalc; neither nearby keyframe_insert nor FCurve.update deduplication. Real Blender regression RED then GREEN.',
              'source_sha256': SOURCE_SHA, 'changed_clips_and_sides': TARGETS, 'rest_meshes_changed': False,
              'protected_signature': before_signature, 'mesh_signatures': meshes,
              'control_sample_hz': CONTROL_STEP * 30, 'qa_hz': QA_STEP * 30, 'joint_and_world_error_limit_m': MAX_GAP,
              'adaptive_key_counts': {clip: {side: len(keys) for side, keys in sides.items()} for clip, sides in key_sets.items()},
              'local_channel_sample_error_limit': LOCAL_CHANNEL_ERROR,
              'written_curve_control_roundtrip': curve_roundtrip,
              'method': 'Solve fixed-length arms at canonical Hand head; retain original bend side, recompute ElbowSupport; restore absolute Hand pose last. Forearm/Hand local translations are zero for exact hierarchy continuity.',
              'reach': {name: {key: min(r[key] for r in rows) for key in ('reach_margin', 'source_pole_offset', 'bend_radius')} for name, rows in reach.items()},
              'metrics': metrics, 'pending': ['Independent review', 'Save/reload and GLB interpolation verification', 'Dense sleeve/armor collision and visual action inspection', 'Complete authored hand and actual grip contact']}
    (RUN / 'qa').mkdir(parents=True, exist_ok=True)
    (RUN / 'qa/repair.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    assert all(r['max_joint_gap_m'] <= MAX_GAP and r['max_equipment_world_error_m'] <= MAX_GAP and r['max_upper_head_error_m'] <= 2e-6 for r in metrics.values()), metrics
    assert protected_signature(rig) == before_signature and mesh_signature() == meshes
    rig['canonical_wrist_motion_repair'] = 'v1'
    rig.animation_data.action = bpy.data.actions['Idle']
    scene.frame_set(0)
    candidate = RUN / 'candidate/guard-wrist-motion.blend'
    candidate.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(candidate))
    report['candidate_sha256'] = hashlib.sha256(candidate.read_bytes()).hexdigest()
    report['candidate_path'] = str(candidate.relative_to(ROOT)).replace('\\', '/')
    (RUN / 'qa/repair.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print('WRIST_SAVED', report['candidate_sha256'], flush=True)


if __name__ == '__main__':
    main()
