"""Measure actual plate-vertex error instead of only a broad 2m matrix bound."""
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from guard_armor_controlled_helpers import BASE, CLIPS, HELPERS, sha, window_from_source, planned_skins

RUN = BASE/'2026-10-08-v33-armor-sleeve-winding'


def main():
    source = RUN/'candidate/guard-controlled-armor.blend'
    report = json.loads((RUN/'qa/authoring.json').read_text(encoding='utf-8'))
    assert sha(source) == report['candidate_sha256']
    bpy.ops.wm.open_mainfile(filepath=str(source))
    rig, scene = bpy.data.objects['GuardRig20'], bpy.context.scene
    window = window_from_source()
    rest = {s: np.array([rig.data.bones[n+'_'+s].head_local[:] for n in ('UpperArm', 'Forearm', 'Hand')]) for s in HELPERS}
    vertices = {side: {i: np.array([v.co[:] for lod in (0, 1) for v in bpy.data.objects['Guard'+part+'_'+side+'_LOD'+str(lod)].data.vertices])
                       for i, part in enumerate(('UpperArmArmor', 'ForearmArmor', 'ElbowArmor'))} for side in HELPERS}
    worst, bound = {'distance_m': 0.}, {'distance_m': 0.}
    totals = {}
    for clip in CLIPS:
        rig.animation_data.action = bpy.data.actions[clip]
        count = round(rig.animation_data.action.frame_range[1]*64)+1
        clip_maximum = 0.
        for index in range(count):
            time = index/64
            scene.frame_set(math.floor(time), subframe=time % 1)
            for side, helpers in HELPERS.items():
                planned = planned_skins(rig, rest[side], side, clip, time, window)
                for i, name in enumerate(helpers):
                    actual = np.array(rig.pose.bones[name].matrix @ rig.data.bones[name].matrix_local.inverted())
                    delta = actual-planned[i]
                    conservative = float(np.linalg.norm(delta[:3, 3])+2*np.linalg.norm(delta[:3, :3], 2))
                    points = vertices[side][i]
                    errors = np.linalg.norm(points @ delta[:3, :3].T+delta[:3, 3], axis=1)
                    j = int(np.argmax(errors))
                    maximum = float(errors[j])
                    clip_maximum = max(clip_maximum, maximum)
                    if maximum > worst['distance_m']:
                        worst = {'distance_m': maximum, 'clip': clip, 'frame': time, 'helper': name, 'rest_vertex': points[j].tolist(),
                                 'actual_vertex': (points[j] @ actual[:3, :3].T+actual[:3, 3]).tolist(),
                                 'planned_vertex': (points[j] @ planned[i][:3, :3].T+planned[i][:3, 3]).tolist()}
                    if conservative > bound['distance_m']:
                        bound = {'distance_m': conservative, 'clip': clip, 'frame': time, 'helper': name}
        totals[clip] = {'poses': count, 'maximum_actual_plate_vertex_error_m': clip_maximum}
        print('HELPER_FIDELITY', clip, clip_maximum, flush=True)
    result = {'status': 'measured_fidelity_not_visual_approval', 'runtime_publish_allowed': False, 'candidate_sha256': sha(source),
              'samples_per_frame': 64, 'control_samples_per_frame': report['samples_per_frame'], 'clips': totals,
              'maximum_actual_plate_vertex_error': worst, 'maximum_two_metre_bound': bound,
              'interpretation': 'Interpolated saved helper skin versus continuously evaluated authored anatomical/twist plan; no original bone or gameplay changes',
              'recipe_sha256': {n: sha(Path(__file__).parent/n) for n in ('guard_armor_helper_fidelity.py', 'guard_armor_controlled_helpers.py', 'armor_twist_track.py', 'original_guard_articulated_armor.py')}}
    (RUN/'qa/helper-fidelity-step64.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8', newline='\n')
    print('HELPER_FIDELITY_MAX', json.dumps(worst), flush=True)


if __name__ == '__main__':
    main()
