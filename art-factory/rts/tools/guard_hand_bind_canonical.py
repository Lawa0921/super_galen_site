"""Rebase rigid hand assets without fitting or moving their posed world geometry.

The legacy IK target Q is used once as immutable provenance. New deformation
uses the actual rest wrist W. This candidate is never exported to runtime.
"""
import bpy, bmesh, collections, hashlib, json, math, sys
from pathlib import Path
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).parent))
from guard_digit02_grip_diagnose import ROOT, GUARD, GUARD_SHA
from guard_hand_frame_inventory import RUN as FRAME_RUN
from original_guard_walk_refine import action_fcurves
from original_guard_quadri_repair_math import oriented_boundary_loops
from hand_bind_math import canonical_hand_binding
from hand_socket_math import validate_socket_cap
from hand_bind_sampling import adaptive_linear_keys

RUN = FRAME_RUN.with_name('2026-10-08-v12-canonical-bind-adaptive')
REVISION = ROOT / 'art-factory/rts/runs/original-guard-assembly/revision-20261006/qa/build.json'
REVISION_SHA = '373e5ac6b541c4ac28d2385374b68f051b441d002c9d02526e0d57a004e9cae0'
CLIPS = ('Idle', 'Walk', 'Attack', 'Hurt', 'Death')
QA_SUBDIVISIONS = 128
KEY_SAMPLE_STRIDE = 2
LOCATION_SAMPLE_ERROR = .000015
MAX_WORLD_ERROR = .00005


def write(name, data):
    path = RUN / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')


def signature(rig):
    """All unaffected action curves, rest bones and mesh geometry remain frozen."""
    curves = {}
    for action in bpy.data.actions:
        curves[action.name] = [
            [fc.data_path, fc.array_index, [[list(k.co), list(k.handle_left), list(k.handle_right), k.interpolation] for k in fc.keyframe_points]]
            for fc in action_fcurves(action) if fc.data_path not in {f'pose.bones["Hand_{s}"].location' for s in ('R', 'L')}]
    bones = {b.name: {'rest': [list(r) for r in b.matrix_local], 'parent': b.parent.name if b.parent else None} for b in rig.data.bones}
    return hashlib.sha256(json.dumps({'curves': curves, 'bones': bones}, sort_keys=True).encode()).hexdigest()


def main():
    assert hashlib.sha256(GUARD.read_bytes()).hexdigest() == GUARD_SHA
    assert hashlib.sha256(REVISION.read_bytes()).hexdigest() == REVISION_SHA
    bpy.ops.wm.open_mainfile(filepath=str(GUARD))
    rig = bpy.data.objects['GuardRig20']
    assert not rig.get('canonical_hand_bind_version'), 'Already canonical; never apply legacy Q twice'
    assert np.max(np.abs(np.asarray(rig.matrix_world) - np.eye(4))) < 1e-7
    assert not rig.constraints and not rig.animation_data.drivers
    assert not any(track.strips for track in rig.animation_data.nla_tracks)
    rig.data.pose_position = 'POSE'
    scene = bpy.context.scene
    revision = json.loads(REVISION.read_text(encoding='utf-8'))
    targets = {s: np.asarray(revision['changes'][s + '_grip']['arm_cuff_target']) for s in ('R', 'L')}
    rest = {s: np.asarray(rig.data.bones['Hand_' + s].matrix_local, float) for s in ('R', 'L')}
    assets = {}
    for side in ('R', 'L'):
        bone = rig.pose.bones['Hand_' + side]
        assert not bone.children and not bone.constraints
    for obj in bpy.data.objects:
        assert not (obj.parent == rig and obj.parent_type == 'BONE' and obj.parent_bone in ('Hand_R', 'Hand_L')), obj.name
        if obj.type != 'MESH':
            continue
        active = []
        for vertex in obj.data.vertices:
            deform = {obj.vertex_groups[g.group].name: g.weight for g in vertex.groups if obj.vertex_groups[g.group].name in rig.data.bones and g.weight > 0}
            if any(n in deform for n in ('Hand_R', 'Hand_L')):
                assert len(deform) == 1 and next(iter(deform.values())) == 1.0, (obj.name, vertex.index, deform)
                active.append(next(iter(deform)))
        if not active:
            continue
        assert len(active) == len(obj.data.vertices) and len(set(active)) == 1
        assert obj.data.shape_keys is None and not obj.constraints and obj.parent_type != 'BONE'
        assert len(obj.modifiers) == 1 and obj.modifiers[0].type == 'ARMATURE' and obj.modifiers[0].object == rig
        assert not obj.modifiers[0].use_deform_preserve_volume
        assert np.max(np.abs(np.asarray(obj.matrix_world) - np.eye(4))) < 1e-7
        side = active[0][-1]
        assets[obj.name] = {'side': side, 'points': np.asarray([v.co for v in obj.data.vertices], float)}
    assert set(assets) == {f'GuardHandGrip_{s}_LOD{lod}' for s in ('R', 'L') for lod in (0, 1)} | {f'{p}_LOD{lod}' for p in ('KingdomSteelSword', 'KingdomSunShield') for lod in (0, 1)}
    protected = signature(rig)
    captured = {}
    source_gaps = {}
    key_counts = {}
    for clip in CLIPS:
        action = bpy.data.actions[clip]
        rig.animation_data.action = action
        end = round(action.frame_range[1])
        rows = []
        gap = {s: 0. for s in ('R', 'L')}
        for index in range(end * QA_SUBDIVISIONS + 1):
            frame = index / QA_SUBDIVISIONS
            scene.frame_set(math.floor(frame), subframe=frame % 1)
            row = {}
            for side in ('R', 'L'):
                pose = np.asarray(rig.pose.bones['Hand_' + side].matrix, float)
                skin = pose @ np.linalg.inv(rest[side])
                fore = rig.pose.bones['Forearm_' + side]
                endpoint = np.asarray(fore.tail)
                target = (skin @ np.r_[targets[side], 1])[:3]
                gap[side] = max(gap[side], float(np.linalg.norm(endpoint - target)))
                _, new_pose = canonical_hand_binding(np.empty((0, 3)), rest[side], pose, targets[side])
                parent_space = np.asarray(fore.matrix) @ np.linalg.inv(np.asarray(fore.bone.matrix_local)) @ rest[side]
                local = (np.linalg.inv(parent_space) @ new_pose)[:3, 3]
                row[side] = {'pose': pose, 'skin': skin, 'new_location': local}
            rows.append(row)
        captured[clip] = rows
        source_gaps[clip] = gap
        print('CANONICAL_CAPTURE', clip, len(rows), 'legacy_target_gaps', gap, flush=True)
    for name, asset in assets.items():
        side = asset['side']
        shifted, _ = canonical_hand_binding(asset['points'], rest[side], rest[side], targets[side])
        for vertex, point in zip(bpy.data.objects[name].data.vertices, shifted):
            vertex.co = point
        bpy.data.objects[name].data.update()
        asset['new_points'] = np.asarray([v.co for v in bpy.data.objects[name].data.vertices], float)
    for clip, rows in captured.items():
        action = bpy.data.actions[clip]
        rig.animation_data.action = action
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for fc in list(bag.fcurves):
                        if fc.data_path in {f'pose.bones["Hand_{s}"].location' for s in ('R', 'L')}:
                            bag.fcurves.remove(fc)
        by_side = {}
        indices = list(range(0, len(rows), KEY_SAMPLE_STRIDE))
        times = [index / QA_SUBDIVISIONS for index in indices]
        for side in ('R', 'L'):
            values = [rows[index][side]['new_location'] for index in indices]
            by_side[side] = {indices[i] for i in adaptive_linear_keys(times, values, LOCATION_SAMPLE_ERROR)}
        key_counts[clip] = {side: len(by_side[side]) for side in ('R', 'L')}
        for index in sorted(by_side['R'] | by_side['L']):
            frame = index / QA_SUBDIVISIONS
            scene.frame_set(math.floor(frame), subframe=frame % 1)
            for side in ('R', 'L'):
                if index not in by_side[side]:
                    continue
                bone = rig.pose.bones['Hand_' + side]
                bone.location = rows[index][side]['new_location']
                bone.keyframe_insert(data_path='location', frame=frame, group=bone.name)
        for fc in action_fcurves(action):
            if fc.data_path in {f'pose.bones["Hand_{s}"].location' for s in ('R', 'L')}:
                for key in fc.keyframe_points:
                    key.interpolation = 'LINEAR'
        print('CANONICAL_BAKE', clip, key_counts[clip], flush=True)
    assert signature(rig) == protected
    metrics = {}
    for clip, rows in captured.items():
        rig.animation_data.action = bpy.data.actions[clip]
        result = {'qa_frames': len(rows), 'maximum_world_vertex_error_m': 0., 'maximum_skin_rotation_error': 0.,
                  'joint_gap_m': {s: 0. for s in ('R', 'L')}, 'evaluated_modifier_checks': 0}
        for index, row in enumerate(rows):
            frame = index / QA_SUBDIVISIONS
            scene.frame_set(math.floor(frame), subframe=frame % 1)
            skins = {}
            for side in ('R', 'L'):
                bone = rig.pose.bones['Hand_' + side]
                skins[side] = np.asarray(bone.matrix) @ np.linalg.inv(rest[side])
                result['joint_gap_m'][side] = max(result['joint_gap_m'][side], (bone.head - rig.pose.bones['Forearm_' + side].tail).length)
                result['maximum_skin_rotation_error'] = max(result['maximum_skin_rotation_error'], float(np.max(np.abs(skins[side][:3, :3] - row[side]['skin'][:3, :3]))))
            for name, asset in assets.items():
                skin, old = skins[asset['side']], row[asset['side']]['skin']
                before = asset['points'] @ old[:3, :3].T + old[:3, 3]
                after = asset['new_points'] @ skin[:3, :3].T + skin[:3, 3]
                error = float(np.max(np.linalg.norm(after - before, axis=1)))
                if error > result['maximum_world_vertex_error_m']:
                    result['maximum_world_vertex_error_m'] = error
                    result['worst'] = {'mesh': name, 'frame': frame}
                if index in (0, len(rows) // 2, len(rows) - 1):
                    obj = bpy.data.objects[name].evaluated_get(bpy.context.evaluated_depsgraph_get())
                    mesh = obj.to_mesh()
                    actual = np.asarray([obj.matrix_world @ v.co for v in mesh.vertices])
                    assert actual.shape == after.shape and np.max(np.linalg.norm(actual - after, axis=1)) < 2e-6
                    obj.to_mesh_clear()
                    result['evaluated_modifier_checks'] += 1
            if index % 512 == 0:
                print('CANONICAL_VERIFY_PROGRESS', clip, index, flush=True)
        metrics[clip] = result
        print('CANONICAL_VERIFY', clip, json.dumps(result), flush=True)
    # Repair only inconsistent sleeve face orientations, preserving every vertex,
    # polygon identity, material and weight. Geometry positions stay identical.
    inventory = json.loads((FRAME_RUN / 'raw/current-arm-wrist-inventory.json').read_text(encoding='utf-8'))
    arm = bpy.data.objects['GuardArms_LOD0']
    old_positions = [tuple(v.co) for v in arm.data.vertices]
    old_faces = [list(p.vertices) for p in arm.data.polygons]
    bm = bmesh.new()
    bm.from_mesh(arm.data)
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    sleeve_ids = {v for component in (5, 11) for v in inventory['arm_components'][component]['vertex_ids']}
    selected = [f for f in bm.faces if all(v.index in sleeve_ids for v in f.verts)]
    bmesh.ops.recalc_face_normals(bm, faces=selected)
    bm.to_mesh(arm.data)
    bm.free()
    assert old_positions == [tuple(v.co) for v in arm.data.vertices]
    assert all(set(old) == set(new.vertices) for old, new in zip(old_faces, arm.data.polygons))
    changed_faces = [i for i, (old, new) in enumerate(zip(old_faces, arm.data.polygons)) if old != list(new.vertices)]
    right_sleeve_ids = set(inventory['arm_components'][5]['vertex_ids'])
    assert all(set(old_faces[i]) <= right_sleeve_ids for i in changed_faces), 'Unvalidated left sleeve normal change'
    source_socket = json.loads((FRAME_RUN / 'raw/current-sleeve-socket.json').read_text(encoding='utf-8'))
    sleeve = set(inventory['arm_components'][5]['vertex_ids'])
    cap_ids = set(source_socket['cap_polygon_ids'])
    cap = [list(p.vertices) for p in arm.data.polygons if p.index in cap_ids]
    retained = [list(p.vertices) for p in arm.data.polygons if set(p.vertices) <= sleeve and p.index not in cap_ids]
    loop, = oriented_boundary_loops(retained)
    weights = {i: {arm.vertex_groups[g.group].name: g.weight for g in arm.data.vertices[i].groups} for i in loop}
    materials = {arm.data.materials[p.material_index].name for p in arm.data.polygons if p.index in cap_ids}
    socket_gate = validate_socket_cap(cap, retained, loop, weights, materials)
    maximum_error = max(v['maximum_world_vertex_error_m'] for v in metrics.values())
    report = {'status': 'canonical_bind_candidate_pending_export_and_independent_review', 'runtime_publish_allowed': False,
              'rejected_predecessors': ['v10 rebaked rotations and failed 0.05 mm parity with 1.6905 mm error', 'v11 preserved rotations but uniform 960 Hz locations missed 0.05 mm gate with 0.05527 mm error; neither candidate was saved'],
              'correction': 'Preserve original rotation curves exactly. Solve new local location analytically from parent/rest matrices; retain measured extrema adaptively to 0.015 mm, then audit independent intervening samples.',
              'source_guard_sha256': GUARD_SHA, 'legacy_revision_report_sha256': REVISION_SHA,
              'legacy_wrist_targets_Q_m': {s: targets[s].tolist() for s in targets},
              'canonical_wrist_W_m': {s: rest[s][:3, 3].tolist() for s in rest},
              'rest_mesh_translation_m': {s: (rest[s][:3, 3] - targets[s]).tolist() for s in rest},
              'representation': "p'=p+W-Q; S'=S*T(Q-W). Legacy Q must never be reapplied; future IK target is S'*W.",
              'assets': {name: {'side': a['side'], 'vertices': len(a['points']), 'rigid_weight': 1.0, 'object_matrix_identity': True} for name, a in assets.items()},
              'source_subframe_joint_target_gaps_m': source_gaps,
              'key_selection_sample_hz': 30 * QA_SUBDIVISIONS // KEY_SAMPLE_STRIDE, 'key_counts_per_location_channel': key_counts,
              'sampled_local_error_limit_m': LOCATION_SAMPLE_ERROR,
              'qa_hz': 30 * QA_SUBDIVISIONS, 'action_metrics': metrics,
              'maximum_world_vertex_error_m': maximum_error, 'world_error_limit_m': MAX_WORLD_ERROR,
              'protected_bones_and_other_curves_sha256': protected,
              'sleeve_normal_repair_changed_polygon_ids': changed_faces,
              'socket_validation': socket_gate,
              'ordered_interface': [{'vertex': i, 'world_m': list(arm.matrix_world @ arm.data.vertices[i].co), 'weights': weights[i]} for i in loop],
              'cap_polygon_ids': sorted(cap_ids),
              'limits': ['No GLB export/interpolation verification yet', 'No new hand geometry, grip contact, sleeve/armor collision or commercial art approval', 'No-action rest equipment intentionally rebased; posed geometry parity is separately measured', 'Original IK subframe endpoint error is retained, not corrected']}
    write('qa/canonical-bind.json', report)
    assert maximum_error <= MAX_WORLD_ERROR, maximum_error
    assert signature(rig) == protected
    rig['canonical_hand_bind_version'] = 'guard-hands-v1'
    rig['canonical_hand_ik_target'] = "skin * rest wrist W; never legacy Q"
    rig.animation_data.action = bpy.data.actions['Idle']
    scene.frame_set(0)
    candidate = RUN / 'candidate/guard-canonical-hand-bind.blend'
    candidate.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(candidate))
    report['candidate_sha256'] = hashlib.sha256(candidate.read_bytes()).hexdigest()
    report['candidate_path'] = str(candidate.relative_to(ROOT)).replace('\\', '/')
    write('qa/canonical-bind.json', report)
    print('CANONICAL_SAVED', report['candidate_sha256'], flush=True)


if __name__ == '__main__':
    main()
