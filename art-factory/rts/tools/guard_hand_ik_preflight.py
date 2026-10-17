"""Read-only preflight of the specific wrist tracks that fail the joint gate."""
import bpy, hashlib, json, math, sys
from pathlib import Path
import numpy as np
from mathutils import Vector
sys.path.insert(0, str(Path(__file__).parent))
from guard_hand_bind_canonical import ROOT, RUN as BIND_RUN
from original_guard_walk_refine_math import solve_two_link

RUN = BIND_RUN.with_name('2026-10-08-v13-wrist-motion')
TARGETS = {'Attack': ('R',), 'Hurt': ('R', 'L'), 'Death': ('R', 'L')}
MAX_GAP = .00005


def main():
    source = BIND_RUN / 'candidate/guard-canonical-hand-bind.blend'
    source_sha = '987ed5120bd0dfc7e2fd193e546cef289b6ff77a7cd138676aba97324b65a82c'
    assert hashlib.sha256(source.read_bytes()).hexdigest() == source_sha
    bpy.ops.wm.open_mainfile(filepath=str(source))
    rig = bpy.data.objects['GuardRig20']
    assert rig['canonical_hand_bind_version'] == 'guard-hands-v1'
    scene = bpy.context.scene
    metrics = {}
    for clip, sides in TARGETS.items():
        action = bpy.data.actions[clip]
        rig.animation_data.action = action
        result = {side: {'maximum_source_joint_gap_m': 0., 'minimum_reach_margin_m': float('inf'),
                         'minimum_bend_radius_m': float('inf'), 'minimum_pole_offset_m': float('inf'),
                         'maximum_length_error_m': 0., 'maximum_elbow_displacement_m': 0.,
                         'minimum_adjacent_pole_dot': 1., 'failures': []} for side in sides}
        previous = {}
        samples = round(action.frame_range[1]) * 64 + 1
        for index in range(samples):
            frame = index / 64
            scene.frame_set(math.floor(frame), subframe=frame % 1)
            for side in sides:
                upper, fore, hand = (rig.pose.bones[n + '_' + side] for n in ('UpperArm', 'Forearm', 'Hand'))
                target = hand.head.copy()
                row = result[side]
                gap = (fore.tail - target).length
                if gap > row['maximum_source_joint_gap_m']:
                    row['maximum_source_joint_gap_m'] = gap
                    row['worst_frame'] = frame
                try:
                    solved = solve_two_link(upper.head, target, fore.head, upper.bone.length, fore.bone.length)
                except ValueError as error:
                    row['failures'].append({'frame': frame, 'error': str(error)})
                    continue
                elbow = Vector(solved['knee'])
                axis = (target - upper.head).normalized()
                pole = elbow - upper.head
                pole = (pole - axis * pole.dot(axis)).normalized()
                if side in previous:
                    row['minimum_adjacent_pole_dot'] = min(row['minimum_adjacent_pole_dot'], pole.dot(previous[side]))
                previous[side] = pole
                row['minimum_reach_margin_m'] = min(row['minimum_reach_margin_m'], solved['reach_margin'])
                row['minimum_bend_radius_m'] = min(row['minimum_bend_radius_m'], solved['bend_radius'])
                row['minimum_pole_offset_m'] = min(row['minimum_pole_offset_m'], solved['source_pole_offset'])
                row['maximum_length_error_m'] = max(row['maximum_length_error_m'], abs(solved['length1_error']), abs(solved['length2_error']))
                row['maximum_elbow_displacement_m'] = max(row['maximum_elbow_displacement_m'], (elbow - fore.head).length)
        metrics[clip] = {'samples': samples, 'sides': result}
        print('IK_PREFLIGHT', clip, json.dumps(metrics[clip]), flush=True)
    report = {'status': 'source_joint_gate_failed_repair_plan_only', 'source_candidate_sha256': source_sha,
              'runtime_publish_allowed': False, 'source_modified': False,
              'source_frame': 'Canonical hand bind v12; use Hand pose head, never legacy Q',
              'joint_gap_limit_m': MAX_GAP, 'actions_to_repair': TARGETS, 'metrics': metrics,
              'protected': ['All Idle and Walk curves', 'All rest meshes, bones and lengths', 'All non-target action channels', 'Hand absolute pose and every rigid equipment vertex'],
              'pending': ['Bake solved parent chain, then ElbowSupport, then preserved Hand absolute pose', 'Dense full-five-clip validation, save/reload and actual GLB interpolation', 'Arm/sleeve/armor intersections and full action visual inspection']}
    (RUN / 'qa').mkdir(parents=True, exist_ok=True)
    (RUN / 'qa/preflight.json').write_text(json.dumps(report, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    assert all(not row['failures'] for clip in metrics.values() for row in clip['sides'].values()), 'Unreachable or degenerate IK target'
    assert all(row['maximum_source_joint_gap_m'] <= MAX_GAP for clip in metrics.values() for row in clip['sides'].values()), 'Expected RED: source wrist motion exceeds the 0.05 mm joint gate'


if __name__ == '__main__':
    main()
