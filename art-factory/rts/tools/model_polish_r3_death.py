"""Death-clip shield clearance (model polish round 3): the hands pass measured every clip but Death.

Usage: python art-factory/rts/tools/model_polish_r3_death.py
For guard / knight / commander, samples 24 frames of Death and counts body vertices (own arm chain excluded, as in
model_hands_clearance.py) closer than 8 mm to a shield vertex, plus shield vertices below the ground plane (y < -2 cm),
for the 2026-10-16 pre-hands baseline, the published-before-round-3 file and the round-3 candidate.
Writes qa/death-clearance.json under the round-3 run.
"""
from pathlib import Path
import json, sys
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
from model_polish_glb import Glb  # noqa: E402
from model_hands_pose import skin_matrices, joint_names  # noqa: E402
import model_hands_measure as M  # noqa: E402
from model_hands_clearance import near_count  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / 'art-factory/rts/runs/model-polish/2026-10-17-v1'
SHIELDS = {'guard': 'KingdomSunShield', 'knight': 'KnightSunShield', 'commander': 'CommanderDawnShield'}


def death(path, shield):
    g = Glb(path); names = joint_names(g); _, body = M.body_node(g, 0); _, node = M.node_by_base(g, shield, 0)
    arm = [names.index(f'{b}_{s}') for s in 'LR' for b in ('UpperArm', 'Forearm', 'Hand')]
    anim = next(a for a in g.json['animations'] if a['name'] == 'Death')
    times = np.concatenate([g.accessor(s['input']).reshape(-1) for s in anim['samplers']])
    worst = {'body_vertices_near_shield': 0, 'frame_s': None, 'shield_vertices_below_ground': 0}
    for t in np.linspace(times.min(), times.max(), 24):
        mats, _ = skin_matrices(g, 0, 'Death', t)
        bp = M.prims(g, body, mats)
        bpts = np.vstack([p['posed'][sum(M.weight_of(p, s) for s in arm) < 0.3] for p in bp])
        spts = np.vstack([p['posed'] for p in M.prims(g, node, mats)])
        n = near_count(bpts, spts)
        if n > worst['body_vertices_near_shield']:
            worst.update(body_vertices_near_shield=int(n), frame_s=round(float(t), 3))
        worst['shield_vertices_below_ground'] = max(worst['shield_vertices_below_ground'], int((spts[:, 1] < -0.02).sum()))
    return worst


if __name__ == '__main__':
    out = {'tolerance_m': 0.008, 'frames': 24, 'units': {}}
    for unit, shield in SHIELDS.items():
        rows = {'pre-hands-2026-10-16': ROOT / 'art-factory/rts/runs/model-polish/2026-10-16-hands-v1/raw/publication-before/models' / f'{unit}.glb',
                'published-before-r3': RUN / 'raw/publication-before/models' / f'{unit}.glb',
                'r3-candidate': RUN / 'candidate/models' / f'{unit}.glb'}
        out['units'][unit] = {k: death(p, shield) for k, p in rows.items() if p.exists()}
        print(unit, out['units'][unit])
    (RUN / 'qa/death-clearance.json').write_text(json.dumps(out, indent=2) + '\n', encoding='utf-8')
