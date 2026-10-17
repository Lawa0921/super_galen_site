"""Author only Attack right arm 9..18; preserve the gameplay contact at 16.

This is a new motion design, not a representation-preserving repair. The old
hand path is deliberately superseded inside the declared window. Original
rig, meshes, equipment binding, all other clips and outside poses stay fixed.
"""
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from arm_pole_motion import hermite_track, sample_derivative, transport_pole_basis, pole_direction_track
from hand_action_curve_write import replace_linear_curve
from original_guard_walk_refine import action_fcurves
from original_guard_walk_refine_math import solve_two_link
from guard_hand_ik_repair import mesh_signature

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / 'art-factory/rts/runs/guard-right-hand-cage'
SOURCE = BASE / '2026-10-08-v17-tabard-continuity/candidate/guard-tabard-continuity.blend'
SOURCE_SHA = 'cb1f0bf304b82b27792b7fe57abcdc4ff2ed48f302d9dcd97531652096f5a751'
RUN = BASE / '2026-10-08-v25-authored-attack'
PARTS = ('UpperArm_R', 'Forearm_R', 'Hand_R', 'ElbowSupport_R')
START, CONTACT, END, STEP = 9., 16., 18., 256
KNOTS = np.array([9., 12., 16., 18.])


def allowed(path):
    return any(path == f'pose.bones["{n}"].rotation_quaternion' for n in PARTS) or path == 'pose.bones["ElbowSupport_R"].location'


def protected(rig):
    data = {'rest_bones': {b.name: [list(r) for r in b.matrix_local] for b in rig.data.bones}, 'curves': {}}
    for action in bpy.data.actions:
        rows = []
        for fc in action_fcurves(action):
            if action.name == 'Attack' and allowed(fc.data_path):
                continue
            rows.append([fc.data_path, fc.array_index, fc.extrapolation,
                         [[list(k.co), list(k.handle_left), list(k.handle_right), k.interpolation] for k in fc.keyframe_points]])
        data['curves'][action.name] = rows
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()


def main(*, source=SOURCE, source_sha=SOURCE_SHA, run=RUN, start=START, end=END,
         knots=KNOTS, wrist_delta=None, pole_override=None, pole_mode='cartesian', endpoint_policy='centered'):
    SOURCE, SOURCE_SHA, RUN, START, END, KNOTS = source, source_sha, run, start, end, np.asarray(knots, float)
    wrist_delta = {1: [.10, 0., .06]} if wrist_delta is None else wrist_delta
    pole_override = {1: [.25, .10, -.20], 2: [.16, .22, -.12]} if pole_override is None else pole_override
    assert KNOTS[0] == START and KNOTS[-1] == END and 0 <= START < END <= 36
    assert endpoint_policy in ('centered', 'outside')
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == SOURCE_SHA
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    rig, scene = bpy.data.objects['GuardRig20'], bpy.context.scene
    action = bpy.data.actions['Attack']
    rig.animation_data.action = action
    assert tuple(action.frame_range) == (0., 36.) and scene.render.fps == 30
    protected_before, meshes_before = protected(rig), mesh_signature()
    body_rest_inverse = rig.data.bones['SpineUpper'].matrix_local.inverted()
    names = (*PARTS, rig.pose.bones['UpperArm_R'].parent.name)
    source, body_skins, original_points = [], [], []
    for i in range(36*STEP+1):
        frame = i/STEP
        scene.frame_set(math.floor(frame), subframe=frame % 1)
        source.append({n: rig.pose.bones[n].matrix.copy() for n in names})
        body_skins.append(rig.pose.bones['SpineUpper'].matrix @ body_rest_inverse)
        original_points.append([list(rig.pose.bones[n].head) for n in PARTS[:3]])
    original_points = np.array(original_points)
    indices = np.arange(round(START*STEP), round(END*STEP)+1)
    times = indices/STEP

    def offset(i, name):
        delta = source[i][name].translation-source[i]['UpperArm_R'].translation
        return np.array(body_skins[i].to_3x3().inverted() @ delta)

    def relative_q(i, name, reference=None):
        q = (body_skins[i].inverted() @ source[i][name]).to_quaternion().normalized()
        if reference is not None and q.dot(Quaternion(reference)) < 0:
            q.negate()
        return np.array(q)

    def endpoint_side(key):
        if endpoint_policy == 'centered':
            return 'centered'
        if key == 0:
            return 'backward' if START > 0 else 'forward'
        return 'forward' if END < 36 else 'backward'

    def track_derivatives(values, function):
        derivatives = np.zeros_like(values)
        # Both boundary velocities come from the actual source on either side.
        for key in (0, len(KNOTS)-1):
            i = round(KNOTS[key]*STEP)
            derivatives[key] = sample_derivative(lambda j: function(j, key), i, 1/STEP, len(source)-1, endpoint_side(key))
        for key in range(1, len(KNOTS)-1):
            derivatives[key] = (values[key+1]-values[key-1])/(KNOTS[key+1]-KNOTS[key-1])
        return derivatives

    wrist_keys = np.array([offset(round(t*STEP), 'Hand_R') for t in KNOTS])
    # Intentional outward/lifted transit gives the sword room beside the body.
    for key, delta in wrist_delta.items():
        wrist_keys[key] += delta
    wrist_velocity = track_derivatives(wrist_keys, lambda i, k: offset(i, 'Hand_R'))
    wrist_offsets = hermite_track(times, KNOTS, wrist_keys, wrist_velocity)
    pole_keys = np.array([offset(round(t*STEP), 'Forearm_R') for t in KNOTS])
    for key, value in pole_override.items():
        pole_keys[key] = value
    pole_velocity = track_derivatives(pole_keys, lambda i, k: offset(i, 'Forearm_R'))
    pole_offsets = hermite_track(times, KNOTS, pole_keys, pole_velocity)
    pole_angles = None
    if pole_mode == 'transported-angle':
        assert len(KNOTS) == 2 and not pole_override
        first, second = transport_pole_basis(wrist_offsets, pole_keys[0])
        angle_derivatives = []
        for key, j in ((0, 0), (1, len(times)-1)):
            reference = math.atan2(np.dot(pole_keys[key], second[j]), np.dot(pole_keys[key], first[j]))
            def angle_at(i):
                # Transport the boundary basis onto each measured source reach
                # axis, so angular endpoint velocity includes moving-frame rate.
                a, b = transport_pole_basis([wrist_offsets[j], offset(i, 'Hand_R')], first[j])
                pole = offset(i, 'Forearm_R')
                value = math.atan2(np.dot(pole, b[-1]), np.dot(pole, a[-1]))
                return reference+math.atan2(math.sin(value-reference), math.cos(value-reference))
            angle_derivatives.append(float(sample_derivative(angle_at, int(indices[j]), 1/STEP, len(source)-1, endpoint_side(key))))
        directions, pole_angles = pole_direction_track(times, wrist_offsets, pole_keys[0], pole_keys[-1], angle_derivatives)
        pole_offsets = wrist_offsets*.5+directions*.20
    elif pole_mode != 'cartesian':
        raise ValueError('Explicit pole authoring mode required')
    reach_axes = wrist_offsets/np.linalg.norm(wrist_offsets, axis=1)[:, None]
    pole_radial = pole_offsets-np.sum(pole_offsets*reach_axes, axis=1)[:, None]*reach_axes
    minimum_pole_offset = float(np.linalg.norm(pole_radial, axis=1).min())
    rotations, minimum_quaternion_norm = {}, 1.
    for name in PARTS[:3]:
        keys = []
        for frame in KNOTS:
            keys.append(relative_q(round(frame*STEP), name, keys[-1] if keys else None))
        keys = np.asarray(keys)
        derivatives = track_derivatives(keys, lambda i, k: relative_q(i, name, keys[k]))
        derivatives -= np.sum(derivatives*keys, axis=1)[:, None]*keys
        raw = hermite_track(times, KNOTS, keys, derivatives)
        norms = np.linalg.norm(raw, axis=1)
        minimum_quaternion_norm = min(minimum_quaternion_norm, float(norms.min()))
        assert norms.min() > .5, (name, 'ambiguous quaternion authoring arc')
        rotations[name] = raw/norms[:, None]

    plans, local_values, reach = {}, {}, []
    last_q = {}
    for j, i in enumerate(indices):
        row = source[i]
        if i in (indices[0], indices[-1]):
            planned = {n: row[n].copy() for n in PARTS}
        else:
            body = body_skins[i]
            shoulder = row['UpperArm_R'].translation.copy()
            wrist = shoulder+body.to_3x3() @ Vector(wrist_offsets[j])
            pole = shoulder+body.to_3x3() @ Vector(pole_offsets[j])
            solved = solve_two_link(shoulder, wrist, pole, rig.data.bones['UpperArm_R'].length, rig.data.bones['Forearm_R'].length)
            reach.append(solved['reach_margin'])
            elbow = Vector(solved['knee'])
            planned = {}
            for name, head, tail in (('UpperArm_R', shoulder, elbow), ('Forearm_R', elbow, wrist)):
                q = body.to_quaternion() @ Quaternion(rotations[name][j])
                aim = (tail-head).normalized()
                q = (q @ Vector((0,1,0))).rotation_difference(aim) @ q
                planned[name] = Matrix.LocRotScale(head, q, Vector((1,1,1)))
            q = body.to_quaternion() @ Quaternion(rotations['Hand_R'][j])
            planned['Hand_R'] = Matrix.LocRotScale(wrist, q, Vector((1,1,1)))
            old_middle = row['UpperArm_R'].to_quaternion().slerp(row['Forearm_R'].to_quaternion(), .5)
            new_middle = planned['UpperArm_R'].to_quaternion().slerp(planned['Forearm_R'].to_quaternion(), .5)
            correction = new_middle @ old_middle.inverted()
            support_head = elbow + correction @ (row['ElbowSupport_R'].translation-row['Forearm_R'].translation)
            planned['ElbowSupport_R'] = Matrix.LocRotScale(support_head, correction @ row['ElbowSupport_R'].to_quaternion(), Vector((1,1,1)))
        plans[i] = planned
        values = {}
        for name in PARTS:
            bone = rig.data.bones[name]
            parent = planned.get(bone.parent.name, row.get(bone.parent.name))
            basis = (parent @ bone.parent.matrix_local.inverted() @ bone.matrix_local).inverted() @ planned[name]
            q = basis.to_quaternion().normalized()
            if name in last_q and q.dot(last_q[name]) < 0:
                q.negate()
            last_q[name] = q.copy()
            values[(name, 'rotation_quaternion')] = list(q)
            if name == 'ElbowSupport_R':
                values[(name, 'location')] = list(basis.translation)
        local_values[i] = values

    outside_keys_before = {}
    for fc in action_fcurves(action):
        if not allowed(fc.data_path):
            continue
        assert all(k.interpolation == 'LINEAR' for k in fc.keyframe_points)
        name = fc.data_path.split('"')[1]
        prop = fc.data_path.rsplit('.', 1)[1]
        outside = {float(k.co.x): float(k.co.y) for k in fc.keyframe_points if k.co.x <= START or k.co.x >= END}
        original_boundary = {t: fc.evaluate(t) for t in (START, END)}
        # Match the source quaternion hemisphere at the splice boundary.
        sign = 1.
        if prop == 'rotation_quaternion':
            curves = sorted([c for c in action_fcurves(action) if c.data_path == fc.data_path], key=lambda c: c.array_index)
            old_q = np.array([c.evaluate(START) for c in curves])
            sign = 1. if np.dot(old_q, local_values[indices[0]][(name, prop)]) >= 0 else -1.
        merged = dict(outside)
        for i in indices[::2]:
            if START < i/STEP < END:
                merged[i/STEP] = sign*local_values[i][(name, prop)][fc.array_index]
        merged.update(original_boundary)
        ordered = sorted(merged)
        key = (fc.data_path, fc.array_index)
        outside_keys_before[key] = outside
        replace_linear_curve(fc, ordered, [merged[t] for t in ordered])

    assert protected(rig) == protected_before and mesh_signature() == meshes_before
    for fc in action_fcurves(action):
        key = (fc.data_path, fc.array_index)
        if key in outside_keys_before:
            actual = {float(k.co.x): float(k.co.y) for k in fc.keyframe_points if k.co.x <= START or k.co.x >= END}
            assert all(actual[t] == v for t,v in outside_keys_before[key].items())
    actual_points, max_gap, max_plan_error, max_outside_error = [], 0., 0., 0.
    for i in range(len(source)):
        frame = i/STEP
        scene.frame_set(math.floor(frame), subframe=frame % 1)
        actual_points.append([list(rig.pose.bones[n].head) for n in PARTS[:3]])
        max_gap = max(max_gap, (rig.pose.bones['Forearm_R'].tail-rig.pose.bones['Hand_R'].head).length)
        for name in PARTS:
            expected = plans[i][name] if i in plans else source[i][name]
            # Conservative point error for any point within 2 m of bone origin.
            error = np.asarray(rig.pose.bones[name].matrix)-np.asarray(expected)
            bound = np.linalg.norm(error[:3,3])+2*np.linalg.norm(error[:3,:3],2)
            if START < frame < END:
                max_plan_error = max(max_plan_error, float(bound))
            else:
                max_outside_error = max(max_outside_error, float(bound))
    actual_points = np.asarray(actual_points)
    def speeds(points, first_frame=0):
        result = {}
        for j,n in enumerate(PARTS[:3]):
            values = np.linalg.norm(np.diff(points[:,j],axis=0),axis=1)*STEP*30
            k = int(np.argmax(values))
            result[n] = {'maximum_m_s': float(values[k]), 'frame': first_frame+k/STEP}
        return result
    report = {'status': 'authored_attack_candidate_pending_visual_collision_reload_and_export', 'runtime_publish_allowed': False,
              'source_sha256': SOURCE_SHA, 'window_frames': [START, END], 'contact_frame': CONTACT, 'duration_seconds': 1.2,
              'changed': [f'Attack right UpperArm/Forearm/Hand rotations and derived ElbowSupport pose inside {START}..{END}'],
              'body_space_wrist_keys': wrist_keys.tolist(), 'body_space_pole_keys': pole_keys.tolist(), 'key_frames': KNOTS.tolist(),
              'pole_mode': pole_mode, 'minimum_pole_plane_offset_m': minimum_pole_offset,
              'endpoint_derivative_policy': endpoint_policy,
              'pole_angle_range_degrees': None if pole_angles is None else np.rad2deg([pole_angles.min(), pole_angles.max()]).tolist(),
              'old_hand_trajectory_superseded_only_inside_window': True, 'protected_signature': protected_before, 'meshes_unchanged': True,
              'maximum_joint_gap_m': max_gap, 'maximum_authored_plan_point_bound_m': max_plan_error,
              'maximum_outside_window_point_bound_m': max_outside_error, 'minimum_reach_margin_m': min(reach),
              'minimum_unnormalized_authored_quaternion_norm': minimum_quaternion_norm,
              'source_speed': speeds(original_points), 'candidate_speed': speeds(actual_points),
              'source_window_speed': speeds(original_points[indices], START), 'candidate_window_speed': speeds(actual_points[indices], START),
              'qa_samples_per_frame': STEP, 'control_samples_per_frame': STEP//2,
              'pending': ['Whole-body normal and quarter-speed visual review', 'Armor and body collision regression', 'Saved file reload', 'Actual Three.js export and runtime contact review']}
    (RUN/'qa').mkdir(parents=True, exist_ok=True)
    (RUN/'qa/authoring.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print('AUTHORED_ATTACK_QA', json.dumps(report), flush=True)
    assert max_gap <= .00005 and max_plan_error <= .00005 and max_outside_error <= .00005
    rig.animation_data.action = bpy.data.actions['Idle']
    scene.frame_set(0)
    candidate = RUN/'candidate/guard-authored-attack.blend'
    candidate.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(candidate))
    report['candidate_sha256'] = hashlib.sha256(candidate.read_bytes()).hexdigest()
    (RUN/'qa/authoring.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print('AUTHORED_ATTACK_SAVED', report['candidate_sha256'], flush=True)


if __name__ == '__main__':
    main()
