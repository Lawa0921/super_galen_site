"""Repair only inherited TabardDrape antipodal keys, preserving key poses."""
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Quaternion

sys.path.insert(0, str(Path(__file__).parent))
from guard_wrist_export_verify import BASE, SOURCE, SOURCE_SHA
from original_guard_walk_refine import action_fcurves
from guard_hand_ik_repair import mesh_signature

TARGETS = ('Idle', 'Death')
PATH = 'pose.bones["TabardDrape"].rotation_quaternion'
RUN = BASE / '2026-10-08-v17-tabard-continuity'


def protected():
    return hashlib.sha256(json.dumps([
        [a.name, [[f.data_path, f.array_index, [[list(k.co), list(k.handle_left), list(k.handle_right), k.interpolation] for k in f.keyframe_points]]
                  for f in action_fcurves(a) if not (a.name in TARGETS and f.data_path == PATH)]]
        for a in bpy.data.actions], sort_keys=True).encode()).hexdigest()


def main():
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == SOURCE_SHA
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    rig = bpy.data.objects['GuardRig20']
    initial, meshes = protected(), mesh_signature()
    reports = {}
    for clip in TARGETS:
        action = bpy.data.actions[clip]
        rig.animation_data.action = action
        curves = sorted([f for f in action_fcurves(action) if f.data_path == PATH], key=lambda f: f.array_index)
        assert len(curves) == 4
        times = [float(k.co.x) for k in curves[0].keyframe_points]
        assert all([float(k.co.x) for k in f.keyframe_points] == times for f in curves)
        before = [[f.keyframe_points[i].co.y for f in curves] for i in range(len(times))]
        assert all(k.interpolation in ('LINEAR', 'BEZIER') for f in curves for k in f.keyframe_points)
        negative = sum(Quaternion(a).dot(Quaternion(b)) < 0 for a, b in zip(before, before[1:]))
        if '--verify-only' in sys.argv:
            assert negative == 0, (clip, 'antipodal key intervals', negative)
            continue
        previous, changed = None, 0
        for index in range(len(times)):
            current = Quaternion(before[index])
            assert current.magnitude > .99
            if previous is not None and current.dot(previous) < 0:
                for curve in curves:
                    key = curve.keyframe_points[index]
                    key.co.y *= -1
                    key.handle_left.y *= -1
                    key.handle_right.y *= -1
                current.negate()
                changed += 1
            previous = current.copy()
        for curve in curves:
            curve.id_data.update_tag()
        after = [[f.keyframe_points[i].co.y for f in curves] for i in range(len(times))]
        assert all(min(sum((a[i] - b[i]) ** 2 for i in range(4)), sum((a[i] + b[i]) ** 2 for i in range(4))) == 0 for a, b in zip(before, after))
        assert all(Quaternion(a).dot(Quaternion(b)) >= 0 for a, b in zip(after, after[1:]))
        minimum = min(Quaternion([f.evaluate(i / 256) for f in curves]).magnitude for i in range(round(times[-1] * 256) + 1))
        assert minimum > .99
        reports[clip] = {'negative_intervals_before': negative, 'changed_sign_keys': changed, 'authored_key_rotation_error': 0, 'minimum_dense_quaternion_length': minimum}
    assert protected() == initial and mesh_signature() == meshes
    rig.animation_data.action = bpy.data.actions['Idle']
    bpy.context.scene.frame_set(0)
    rig['tabard_quaternion_continuity'] = 'v1'
    (RUN / 'candidate').mkdir(parents=True, exist_ok=True)
    (RUN / 'qa').mkdir(exist_ok=True)
    candidate = RUN / 'candidate/guard-tabard-continuity.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(candidate))
    report = {'status': 'candidate_pending_reload_export_and_collision', 'source_sha256': SOURCE_SHA,
              'candidate_sha256': hashlib.sha256(candidate.read_bytes()).hexdigest(), 'runtime_publish_allowed': False,
              'protected_curve_signature': initial, 'mesh_signatures_unchanged': True, 'scope': 'Idle/Death TabardDrape only; all source key rotations preserved, invalid antipodal interpolation deliberately corrected',
              'clips': reports, 'remaining': ['Actual GLB interpolation parity', 'Known v15 armor collision failures', 'Complete hand and character art']}
    (RUN / 'qa/repair.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print('TABARD_REPAIR', json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
