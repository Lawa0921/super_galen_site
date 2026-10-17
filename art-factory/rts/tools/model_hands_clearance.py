"""Clearance gate for the hand polish pass: hands / shields vs the body in every clip, baseline vs candidate.

Usage: python art-factory/rts/tools/model_hands_clearance.py [unit ...]
For each clip it samples 12 frames, skins the body and the probe meshes (new hand meshes, shields, held weapons) and
counts body vertices closer than 8 mm to a probe vertex, ignoring the body's own arm chain on that side (Upper arm,
Forearm, Hand weights > 0.3, where the glove legitimately meets the sleeve). It also reports the wrist cuff's
worst stretch (max edge length ratio vs bind) so a collapsing / candy-wrapper wrist shows up as a number.
Writes qa/clearance.json under the hands run.
"""
from pathlib import Path
import json, sys
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from model_polish_glb import Glb  # noqa: E402
from model_hands_pose import skin_matrices, joint_names, skin_points  # noqa: E402
import model_hands_measure as M  # noqa: E402
import model_hands_build as B  # noqa: E402

TOL = 0.008


def near_count(a, b, tol=TOL):
    """Number of points in a within tol of any point in b (voxel hash, no scipy)."""
    if not len(a) or not len(b):
        return 0
    lo, hi = b.min(0) - tol, b.max(0) + tol
    a = a[((a >= lo) & (a <= hi)).all(1)]
    key = lambda p: np.floor(p / tol).astype(np.int64)
    kb = key(b); h = {}
    for i, k in enumerate(map(tuple, kb)):
        h.setdefault(k, []).append(i)
    hits = 0
    offs = [(x, y, z) for x in (-1, 0, 1) for y in (-1, 0, 1) for z in (-1, 0, 1)]
    for p, k in zip(a, key(a)):
        found = False
        for o in offs:
            for j in h.get((k[0] + o[0], k[1] + o[1], k[2] + o[2]), ()):
                if np.sum((b[j] - p) ** 2) < tol * tol:
                    found = True; break
            if found:
                break
        hits += found
    return hits


def probes_for(unit):
    names = set()
    for cfg in M.HANDS[unit]:
        names.add(cfg.get('host') or cfg['old'])
        if cfg['held'] and 'Shield' in cfg['held']:
            names.add(cfg['held'])
    return sorted(names)


def evaluate(path, unit):
    g = Glb(path); names = joint_names(g)
    _, body = M.body_node(g, 0)
    arm_slots = [names.index(f'{b}_{s}') for s in 'LR' for b in ('UpperArm', 'Forearm', 'Hand')]
    out = {}
    for anim in g.json.get('animations', []):
        if anim['name'] == 'Death':
            continue
        times = np.concatenate([g.accessor(s['input']).reshape(-1) for s in anim['samplers']])
        t0, t1 = float(times.min()), float(times.max())
        worst = {}
        for t in np.linspace(t0, t1, 12):
            mats, _ = skin_matrices(g, 0, anim['name'], t)
            bp = M.prims(g, body, mats)
            bpts = np.vstack([p['posed'][sum(M.weight_of(p, s) for s in arm_slots) < 0.3] for p in bp])
            for probe in probes_for(unit):
                _, node = M.node_by_base(g, probe, 0)
                pts = np.vstack([p['posed'] for p in M.prims(g, node, mats)])
                worst[probe] = max(worst.get(probe, 0), near_count(bpts, pts))
        out[anim['name']] = worst
    return out


def cuff_stretch(path, unit):
    """Worst edge-length ratio (posed / bind) over the new hand meshes' Forearm-blended vertices, all clips."""
    g = Glb(path); worst = 1.0
    for probe in {cfg.get('host') or cfg['old'] for cfg in M.HANDS[unit]}:
        _, node = M.node_by_base(g, probe, 0)
        for p in g.json['meshes'][node['mesh']]['primitives']:
            a = p['attributes']; pos = g.accessor(a['POSITION']).astype(float); jj = g.accessor(a['JOINTS_0']); ww = g.accessor(a['WEIGHTS_0']).astype(float)
            tri = g.accessor(p['indices']).reshape(-1, 3)
            blended = (ww[:, 1] > 0.01)
            sel = tri[blended[tri].any(1)]
            if not len(sel):
                continue
            e = np.concatenate([sel[:, [0, 1]], sel[:, [1, 2]], sel[:, [2, 0]]])
            for anim in g.json.get('animations', []):
                times = np.concatenate([g.accessor(s['input']).reshape(-1) for s in anim['samplers']])
                for t in np.linspace(times.min(), times.max(), 10):
                    mats, _ = skin_matrices(g, 0, anim['name'], t)
                    P = skin_points(pos, jj, ww, mats)
                    lb = np.linalg.norm(pos[e[:, 0]] - pos[e[:, 1]], axis=1); lp = np.linalg.norm(P[e[:, 0]] - P[e[:, 1]], axis=1)
                    ok = lb > 0.003  # ignore pole-fan slivers
                    r = lp[ok] / lb[ok]
                    if len(r):
                        worst = max(worst, float(r.max()), float(1 / max(r.min(), 1e-6)))
    return worst


if __name__ == '__main__':
    units = sys.argv[1:] or list(M.HANDS)
    path = B.RUN / 'qa/clearance.json'
    result = json.loads(path.read_text()) if path.exists() else {}
    for unit in units:
        base = evaluate(B.baseline_path(f'{unit}.glb'), unit)
        cand = evaluate(B.CANDIDATE / f'{unit}.glb', unit)
        rows = {clip: {probe: {'before': base[clip].get(probe, 0), 'after': cand[clip].get(probe, 0)} for probe in cand[clip]} for clip in cand}
        try:
            before = round(cuff_stretch(B.baseline_path(f'{unit}.glb'), unit), 3)
        except (KeyError, IndexError):  # baseline hand mesh had no Forearm-blended vertices / no such host
            before = None
        result[unit] = {'tolerance_m': TOL, 'clips': 'all but Death (12 frames each)', 'body_vertices_near_probe_max_per_clip': rows,
                        'cuff_worst_edge_stretch': round(cuff_stretch(B.CANDIDATE / f'{unit}.glb', unit), 3), 'cuff_worst_edge_stretch_before': before}
        print(unit, 'stretch', result[unit]['cuff_worst_edge_stretch'])
        for clip, r in rows.items():
            print('  ', clip, {k: f"{v['before']}->{v['after']}" for k, v in r.items()})
    path.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
