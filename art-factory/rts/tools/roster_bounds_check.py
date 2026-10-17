"""Verify each skinned node's rtsConservativeBounds against 60 Hz Three AnimationMixer samples.

Input is all_models_runtime_pose.mjs output sampled densely enough for 1/60 s spacing on every
clip (validated with animation_bounds.validate_sample_times). Every skinned vertex of every
sample must lie inside its node's published sphere. Usage:
  node all_models_runtime_pose.mjs <unit> 145   (RTS_POSE_RUN=<run>)
  python roster_bounds_check.py --run <run> --unit <unit>
"""
import argparse
import json
from pathlib import Path

import numpy as np

from animation_bounds import validate_sample_times
from procedural_gauntlet_publish import read_glb


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--unit', required=True)
    args = parser.parse_args()
    poses = json.loads((args.run / f'qa/{args.unit}-runtime-poses.json').read_text(encoding='utf-8'))
    rows, failures = [], []
    for lod in poses['lods']:
        doc, _ = read_glb(Path(lod['file']))
        bounds = {n['name']: n['extras']['rtsConservativeBounds'] for n in doc['nodes'] if 'mesh' in n}
        clips = {}
        for pose in lod['poses']:
            clips.setdefault(pose['clip'], []).append(pose['time'])
        for name, times in clips.items():
            duration = next(t for t in [max(times)])
            validate_sample_times({'sampleTimesSeconds': times, 'durationSeconds': duration, 'sampleCount': len(times),
                                   'allKeyTimesCovered': True, 'includesStart': times[0] == 0, 'includesEnd': True})
        static = []
        for meta in lod['geometry']:
            p = np.array(meta['positions']).reshape(-1, 3)
            p = np.column_stack((p, np.ones(len(p)))) @ np.array(meta['bind']).reshape(4, 4)
            parts = meta['name'].split('/')
            node = next(n for n in (parts[0], parts[-1], parts[-1].rsplit('_', 1)[0]) if n in bounds)
            static.append((node, p, np.array(meta['joints']).reshape(-1, 4), np.array(meta['weights']).reshape(-1, 4)))
        worst = {}
        for pose in lod['poses']:
            for (node, p, joints, weights), raw in zip(static, pose['meshes']):
                skin = np.array(raw['skin']).reshape(-1, 4, 4).transpose(0, 2, 1)
                points = (np.einsum('vwab,vb,vw->va', skin[joints], p, weights) @ np.array(raw['outer']).reshape(4, 4))[:, :3]
                sphere = bounds[node]
                margin = float(sphere['sphere_radius_m'] - np.linalg.norm(points - np.array(sphere['sphere_center_y_up_m']), axis=1).max())
                if node not in worst or margin < worst[node]['min_margin_m']:
                    worst[node] = {'min_margin_m': margin, 'clip': pose['clip'], 'time': pose['time']}
        for node, row in worst.items():
            rows.append({'lod': lod['lod'], 'node': node, **row})
            if row['min_margin_m'] < 0:
                failures.append(rows[-1])
    report = {'unit': args.unit, 'method': 'Three AnimationMixer skinned vertices at <=1/60 s spacing vs rtsConservativeBounds',
              'samples_per_clip': poses['samples'], 'rows': rows, 'failures': failures}
    (args.run / 'qa/bounds-check.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps({'nodes': len(rows), 'min_margin_m': min(r['min_margin_m'] for r in rows), 'failures': len(failures)}))
    assert not failures


if __name__ == '__main__':
    main()
