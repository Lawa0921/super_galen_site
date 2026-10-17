"""Bounded geometry-only articulation probe; not a baked rig or release gate."""
import hashlib
import itertools
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils.bvhtree import BVHTree

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from guard_articulation_source import RUN
from original_guard_articulated_armor import build_module, module_skin_matrices
from original_guard_arm_hinge import strict_triangle_crossings

RUN = RUN.with_name('2026-10-08-v30-armor-interface-fit')


def geometry(points, faces):
    triangles = [[f[0], f[k], f[k+1]] for f in faces for k in range(1, len(f)-1)]
    points = np.asarray(points)
    return points[np.array(triangles)], BVHTree.FromPolygons(points.tolist(), triangles, all_triangles=True)


def crossing(a, b):
    ta, ba = a
    tb, bb = b
    return [[i, j] for i, j in ba.overlap(bb) if len(strict_triangle_crossings(ta[i:i+1], tb[j:j+1]))]


def main():
    source = np.load(RUN/'raw/source-poses.npz')
    meta = json.loads((RUN/'qa/source-poses.json').read_text(encoding='utf-8'))
    arms = json.loads((RUN/'raw/source-arms.json').read_text(encoding='utf-8'))
    names = meta['bones']
    models, rest = {}, {}
    for side in ('R', 'L'):
        rest[side] = source['rest'][[names.index(n+'_'+side) for n in ('UpperArm', 'Forearm', 'Hand')], :3, 3]
        for lod in (0, 1):
            models[f'{side}{lod}'] = build_module(rest[side], lod, include_interfaces=True)
    (RUN/'raw/modules-v3.json').write_text(json.dumps(models)+'\n', encoding='utf-8')
    ideal_rows, actual_rows = [], []
    for lod in (0, 1):
        for bend in (58, 75, 90, 110, 125):
            lengths = np.linalg.norm(np.diff(rest['R'], axis=0), axis=1)
            a = np.deg2rad(bend)
            pose = np.array([[0, 0, lengths[0]], [0, 0, 0], [0, lengths[1]*np.sin(a), -lengths[1]*np.cos(a)]])
            matrices = module_skin_matrices(rest['R'], pose)
            geom = {}
            for name, matrix in zip(('UpperArmArmor', 'ForearmArmor', 'ElbowArmor'), matrices):
                part = models[f'R{lod}'][name]
                points = np.array(part['points']) @ matrix[:3, :3].T+matrix[:3, 3]
                geom[name] = geometry(points, part['faces'])
            for n, m in itertools.combinations(geom, 2):
                hits = crossing(geom[n], geom[m])
                ideal_rows.append({'lod': lod, 'bend': bend, 'pair': [n, m], 'strict_pairs': hits})
    witness = [('Idle', 0), ('Walk', 4), ('Attack', 1.5), ('Attack', 10.75), ('Attack', 13.125), ('Attack', 16), ('Death', 15.5), ('Death', 40.375), ('Death', 48)]
    sweep = '--sweep' in sys.argv
    if sweep:
        witness = [(clip, i/8) for clip in meta['clips'] for i in range(len(source[clip+'_skin']))]
    for clip, t in witness:
        index = int(round(t*8))
        skins = source[clip+'_skin'][index]
        for lod in (0, 1):
            original = arms[str(lod)]
            p = np.array(original['points'])
            weights = np.zeros((len(p), len(names)))
            for v, row in enumerate(original['weights']):
                for bone, w in row.items():
                    if bone in names:
                        weights[v, names.index(bone)] = w
            posed_original = np.einsum('vb,bij,vj->vi', weights, skins, np.column_stack((p, np.ones(len(p)))))[:, :3]
            for si, side in enumerate(('R', 'L')):
                matrices = module_skin_matrices(rest[side], source[clip+'_joints'][index, si])
                bindings = dict(zip(('UpperArmArmor', 'ForearmArmor', 'ElbowArmor'), matrices))
                bindings['ShoulderSpaulder'] = skins[names.index('UpperArm_'+side)]
                bindings['WristCuff'] = skins[names.index('Forearm_'+side)]
                geom = {}
                for name, part in models[f'{side}{lod}'].items():
                    matrix = bindings[name]
                    points = np.array(part['points']) @ matrix[:3, :3].T+matrix[:3, 3]
                    geom[name] = geometry(points, part['faces'])
                for name in ('FlexibleSleeve',):
                    geom[name] = geometry(posed_original, original['parts'][side+'_'+name]['triangles'])
                pairs = list(itertools.combinations(geom, 2))
                for n, m in pairs:
                    hits = crossing(geom[n], geom[m])
                    if hits:
                        actual_rows.append({'clip': clip, 'frame': t, 'side': side, 'lod': lod, 'pair': [n, m], 'strict_pairs': hits})
        if not sweep or t % 6 == 0:
            print('ARTICULATION_PROBE', clip, t, 'cumulative_crossing_witnesses', len(actual_rows), flush=True)
    report = {'status': 'geometry_preflight_only', 'runtime_publish_allowed': False,
              'recipe_sha256': hashlib.sha256((Path(__file__).parent/'original_guard_articulated_armor.py').read_bytes()).hexdigest(),
              'source_sha256': meta['source_sha256'], 'ideal': ideal_rows, 'actual_witnesses': actual_rows,
              'limitations': ['Analytic anatomical frames are diagnostic only; known fast twist is not approved animation',
                             'Coarse full-clip1/8-frame scan' if sweep else 'Nine finite actual poses, not dense sweep',
                             'Inclusive contact and containment not tested',
                             'No source/candidate blend or runtime asset saved']}
    report['actual_pose_count'] = len(witness)
    (RUN/('qa/geometry-sweep-step8-v3.json' if sweep else 'qa/geometry-preflight-v3.json')).write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print('IDEAL_CROSSING_CASES', sum(bool(r['strict_pairs']) for r in ideal_rows), flush=True)
    print('ACTUAL_CROSSING_CASES', len(actual_rows), flush=True)


if __name__ == '__main__':
    main()
