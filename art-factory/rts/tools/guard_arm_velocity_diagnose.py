"""Locate real arm velocity spikes before changing armor or motion sources."""
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from original_guard_walk_refine import action_fcurves

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / 'art-factory/rts/runs/guard-right-hand-cage'
RUN = BASE / '2026-10-08-v23-arm-velocity-diagnosis'
SOURCES = (
    ('v12', BASE / '2026-10-08-v12-canonical-bind-adaptive/candidate/guard-canonical-hand-bind.blend', '987ed5120bd0dfc7e2fd193e546cef289b6ff77a7cd138676aba97324b65a82c'),
    ('v17', BASE / '2026-10-08-v17-tabard-continuity/candidate/guard-tabard-continuity.blend', 'cb1f0bf304b82b27792b7fe57abcdc4ff2ed48f302d9dcd97531652096f5a751'),
)


def main():
    reports = {}
    for label, source, expected in SOURCES:
        assert hashlib.sha256(source.read_bytes()).hexdigest() == expected
        bpy.ops.wm.open_mainfile(filepath=str(source))
        rig, scene = bpy.data.objects['GuardRig20'], bpy.context.scene
        reports[label] = {'source_sha256': expected, 'clips': {}}
        for clip in ('Idle', 'Walk', 'Attack', 'Hurt', 'Death'):
            action = bpy.data.actions[clip]
            rig.animation_data.action = action
            names = [p + '_' + s for s in ('R', 'L') for p in ('UpperArm', 'Forearm', 'Hand')]
            points, quaternions = [], []
            times = np.arange(round(action.frame_range[1] * 64) + 1) / 64
            for frame in times:
                scene.frame_set(math.floor(frame), subframe=frame % 1)
                points.append([list(rig.pose.bones[n].head) for n in names])
                quaternions.append([list(rig.pose.bones[n].rotation_quaternion) for n in names])
            points, quaternions = np.asarray(points), np.asarray(quaternions)
            rows = {}
            for i, name in enumerate(names):
                speed = np.linalg.norm(np.diff(points[:, i], axis=0), axis=1) * 64 * scene.render.fps
                norms = np.linalg.norm(quaternions[:, i], axis=1)
                index = int(np.argmax(speed))
                rows[name] = {'maximum_head_speed_m_s': float(speed[index]), 'worst_frame': float(times[index]),
                              'minimum_raw_local_quaternion_norm': float(norms.min()), 'minimum_norm_frame': float(times[np.argmin(norms)])}
            reports[label]['clips'][clip] = rows
            print('ARM_VELOCITY', label, clip, json.dumps(rows), flush=True)
            if clip == 'Attack':
                selected = [i for i, t in enumerate(times) if 12.75 <= t <= 13.5]
                reports[label]['attack_witness'] = [{'frame': float(times[i]), 'points': points[i].tolist(), 'raw_local_quaternions': quaternions[i].tolist()} for i in selected]
                reports[label]['bone_order'] = names
                reports[label]['attack_source_curves'] = [{'path': fc.data_path, 'index': fc.array_index,
                                                          'keys': [[list(k.co), k.interpolation] for k in fc.keyframe_points if 11 <= k.co.x <= 15]}
                                                         for fc in action_fcurves(action) if any(n in fc.data_path for n in names[:3])]
    report = {'status': 'source_motion_velocity_diagnosis_only', 'runtime_publish_allowed': False,
              'samples_per_frame': 64, 'sources': reports, 'source_files_modified': False,
              'note': 'Finite-difference speed is a diagnostic. It does not alone establish pose quality or authorize a speed threshold.'}
    (RUN / 'qa').mkdir(parents=True, exist_ok=True)
    (RUN / 'qa/source-velocity.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
