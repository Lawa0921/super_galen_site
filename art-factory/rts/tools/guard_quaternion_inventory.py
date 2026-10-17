"""Find source quaternion hemisphere discontinuities; never edit the source."""
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Quaternion

sys.path.insert(0, str(Path(__file__).parent))
from guard_wrist_export_verify import BASE, SOURCE, SOURCE_SHA, CLIPS
from original_guard_walk_refine import action_fcurves


def main():
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == SOURCE_SHA
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    rig, scene = bpy.data.objects['GuardRig20'], bpy.context.scene
    findings = []
    for clip in CLIPS:
        action = bpy.data.actions[clip]
        rig.animation_data.action = action
        curves = list(action_fcurves(action))
        for bone in rig.pose.bones:
            path = f'pose.bones["{bone.name}"].rotation_quaternion'
            group = sorted([f for f in curves if f.data_path == path], key=lambda f: f.array_index)
            if not group:
                continue
            assert [f.array_index for f in group] == [0, 1, 2, 3]
            times = sorted(set(float(k.co.x) for f in group for k in f.keyframe_points))
            for start, end in zip(times, times[1:]):
                qa = Quaternion([f.evaluate(start) for f in group])
                qb = Quaternion([f.evaluate(end) for f in group])
                dot = qa.normalized().dot(qb.normalized())
                if dot >= 0:
                    continue
                middle = (start + end) / 2
                scene.frame_set(math.floor(middle), subframe=middle % 1)
                findings.append({'clip': clip, 'bone': bone.name, 'start': start, 'end': end, 'dot': dot,
                                 'start_quaternion': list(qa), 'end_quaternion': list(qb),
                                 'middle_curve_length': Quaternion([f.evaluate(middle) for f in group]).magnitude,
                                 'middle_pose_quaternion': list(bone.rotation_quaternion),
                                 'middle_skin_matrix': [list(row) for row in (bone.matrix @ bone.bone.matrix_local.inverted())]})
    report = {'source_sha256': SOURCE_SHA, 'status': 'source_hemisphere_discontinuities' if findings else 'no_negative_adjacent_quaternion_dot',
              'runtime_publish_allowed': False, 'findings': findings}
    output = BASE / '2026-10-08-v16-wrist-export/qa/quaternion-source-inventory.json'
    output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'status': report['status'], 'count': len(findings),
                      'summary': [{k: row[k] for k in ('clip', 'bone', 'start', 'end', 'dot', 'middle_curve_length')} for row in findings]}, indent=2), flush=True)


if __name__ == '__main__':
    main()
