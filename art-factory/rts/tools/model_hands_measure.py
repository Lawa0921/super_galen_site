"""Measures every humanoid hand of the published unit GLBs in a real pose for the hand polish pass (2026-10-16).

For each hand it reports, in the Idle t=0 pose: the held grip (axis, centre, radius) taken from the held piece's
own grip surface near the old hand, the anatomical wrist (the body's Hand/Forearm weight blend zone, or the old
cuff), the forearm direction and sleeve radius, and the unit's lateral outward direction. The hand builder uses these
so the new fingers close on the real handle and the cuff meets the real sleeve.
"""
from pathlib import Path
import sys
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from model_polish_glb import Glb  # noqa: E402
from model_hands_pose import skin_matrices, joint_names, skin_points  # noqa: E402

LEATHER_CELL = (0.5, 0.5, 1.0, 0.75)
LEATHER_MATERIALS = ('PolishLeather', 'DarkSaddleLeather', 'WornLeather')
OAK_CELL = (0.5, 0.75, 1.0, 1.0)

# side, old hand mesh base (None: the hand is part of the body), held piece base (None: empty hand),
# grip surface selector, thumb rule, pose, armour style, host mesh base for the new hand.
HANDS = {
    'guard': [dict(side='R', old='GuardGauntlet_R', held='KingdomSteelSword', select='leather', thumb='far', pose='grip', style='plate'),
              dict(side='L', old='GuardGauntlet_L', held='KingdomSunShield', select='leather', thumb='back-to-held', pose='grip', style='plate')],
    'commander': [dict(side='R', old='CommanderClosedGrip_R', held='CommanderLongsword', select='leather', thumb='far', pose='grip', style='plate-brass'),
                  dict(side='L', old='CommanderClosedGrip_L', held='CommanderDawnShield', select='leather', thumb='back-to-held', pose='grip', style='plate-brass')],
    'knight': [dict(side='R', old='KnightCommanderHand_R', held='KnightLance', select='leather', thumb='far', pose='grip', style='plate', wrist_rule='sleeve-end'),
               dict(side='L', old='KnightCommanderHand_L', held='KnightSunShield', select='leather', thumb='back-to-held', pose='grip', style='plate')],
    'crossbow': [dict(side='R', old='ProceduralGauntlet_R', held='ProceduralCrossbow', select='any', thumb='far', pose='grip', style='leather-studded', cuff_cap=0.042),
                 dict(side='L', old='ProceduralGauntlet_L', held='ProceduralCrossbow', select='any', thumb='far', pose='grip', style='leather-studded', cuff_cap=0.042)],
    'worker': [dict(side='R', old='ProceduralGauntlet_R', held='WorkerCraftAxe', select='leather', haft=True, thumb='far', pose='grip', style='leather'),
               dict(side='L', old=None, held=None, host='ProceduralGauntlet_R', pose='relaxed', style='leather')],
    'priest': [dict(side='R', old='AssemblyHand_R', held='PriestDawnStaff', select='shaft', thumb='far', pose='grip', style='leather-fine', cuff_cap=0.034),
               dict(side='L', old=None, held=None, host='AssemblyHand_R', pose='open', style='leather-fine', skin_wrist=True)],
    'neutral-raider': [dict(side='R', old='AssemblyHand_R', held='RaiderShortAxe', select='leather', haft=True, thumb='far', pose='grip', style='leather', cuff_blend=0.2),
                       dict(side='L', old=None, held=None, host='AssemblyHand_R', pose='fist', style='leather')],
}


def node_by_base(g, base, lod):
    name = f'{base}_LOD{lod}'
    for i, n in enumerate(g.json['nodes']):
        if n.get('name') == name:
            return i, n
    raise KeyError(name)


def body_node(g, lod):
    for i, n in enumerate(g.json['nodes']):
        if 'mesh' in n and n.get('skin', 0) == 0 and ('Body' in n.get('name', '')) and n['name'].endswith(f'_LOD{lod}'):
            return i, n
    raise KeyError('body')


def prims(g, node, mats):
    out = []
    for p in g.json['meshes'][node['mesh']]['primitives']:
        a = p['attributes']
        pos = g.accessor(a['POSITION']).astype(np.float64)
        jj = g.accessor(a['JOINTS_0']).astype(np.int64); ww = g.accessor(a['WEIGHTS_0']).astype(np.float64)
        uv = g.accessor(a['TEXCOORD_0']).astype(np.float64) if 'TEXCOORD_0' in a else np.zeros((len(pos), 2))
        out.append(dict(pos=pos, joints=jj, weights=ww, uv=uv, posed=skin_points(pos, jj, ww, mats),
                        material=g.json['materials'][p['material']]['name'], prim=p))
    return out


def weight_of(pr, slot):
    return ((pr['joints'] == slot) * pr['weights']).sum(1)


def pca(points):
    c = points.mean(0); _, s, vt = np.linalg.svd(points - c, full_matrices=False)
    return c, vt, s


def in_cell(uv, cell):
    return (uv[:, 0] >= cell[0]) & (uv[:, 0] <= cell[2]) & (uv[:, 1] >= cell[1]) & (uv[:, 1] <= cell[3])


def measure_unit(unit, lod=0, path=None):
    g = Glb(path or Path(__file__).resolve().parents[3] / f'public/assets/games/rts/models/{unit}.glb')
    mats, world = skin_matrices(g, 0, 'Idle', 0.0)
    names = joint_names(g)
    _, body = body_node(g, lod); body_prims = prims(g, body, mats)
    all_body = np.vstack([p['posed'] for p in body_prims])
    torso = all_body.mean(0)
    out = []
    for cfg in HANDS[unit]:
        side = cfg['side']; hs, fs = names.index('Hand_' + side), names.index('Forearm_' + side)
        m = dict(cfg, unit=unit, hand_slot=hs, forearm_slot=fs)
        # Old hand surface (posed): the glove mesh, or the body's Hand-dominant region.
        if cfg['old']:
            _, node = node_by_base(g, cfg['old'], lod); op = prims(g, node, mats)
            pts = np.vstack([p['posed'] for p in op]); wf = np.concatenate([weight_of(p, fs) for p in op])
            hand_pts = pts[wf < 0.05]; cuff_pts = pts[wf >= 0.05]; cuff_rings = pts[wf >= 0.8]
        else:
            sel = [p['posed'][weight_of(p, hs) > 0.5] for p in body_prims]
            hand_pts = np.vstack(sel); cuff_pts = np.zeros((0, 3)); cuff_rings = cuff_pts
        fist = hand_pts.mean(0)
        # Anatomical wrist: body vertices in the Hand/Forearm blend zone near this hand.
        blend = np.vstack([p['posed'][(weight_of(p, hs) > 0.2) & (weight_of(p, hs) < 0.8)] for p in body_prims])
        blend = blend[np.linalg.norm(blend - fist, axis=1) < 0.2] if len(blend) else blend
        if len(blend) >= 6:
            wrist = blend.mean(0); wrist_src = 'body-blend-zone'
        elif len(cuff_pts) >= 6:
            wrist = cuff_pts.mean(0); wrist_src = 'old-cuff'
        else:
            far = hand_pts[np.argsort(-np.linalg.norm(hand_pts - fist, axis=1))[:40]]
            wrist = far.mean(0); wrist_src = 'old-hand-far-end'
        # Forearm direction / sleeve radius from Forearm-dominant body vertices near the wrist.
        fore_all = np.vstack([p['posed'][weight_of(p, fs) > 0.6] for p in body_prims])
        fore = fore_all[np.linalg.norm(fore_all - wrist, axis=1) < 0.16]
        wide = fore_all[np.linalg.norm(fore_all - wrist, axis=1) < 0.30]
        _, wvt, wsv = pca(wide); axis_f = wvt[0]; fdir_src = 'forearm-pca-0.30'
        ring = cuff_rings if len(cuff_rings) >= 16 else np.zeros((0, 3))
        if len(ring) and wsv[0] < 1.6 * wsv[1]:
            # Chunky armour: the forearm region is not clearly elongated; use the old cuff's proximal rings (a short
            # lathe around the forearm, whose least-spread axis is the forearm direction).
            _, cvt, _ = pca(ring); axis_f = cvt[2]; fdir_src = 'old-cuff-rings'
        fdir = axis_f * np.sign(np.dot(wide.mean(0) - wrist, axis_f) or 1.0)
        rel = fore - wrist; ax = rel @ fdir; radial = np.linalg.norm(rel - np.outer(ax, fdir), axis=1)
        near = radial[(ax > -0.01) & (ax < 0.05)]
        sleeve_r = float(np.percentile(near, 80)) if len(near) > 8 else 0.035
        if not cfg['old']:
            # Bare body hand: walk the arm chain (Hand+Forearm weighted vertices) along its own axis. The wrist is where
            # the Hand weight crosses 0.5, or (wide robe sleeves whose hand is mostly Forearm-weighted) where the sleeve
            # radius drops onto the narrower hand.
            arm = []; wh = []
            for p in body_prims:
                ws = weight_of(p, hs) + weight_of(p, fs); keep = ws > 0.3
                arm.append(p['posed'][keep]); wh.append(weight_of(p, hs)[keep])
            arm = np.vstack(arm); wh = np.concatenate(wh)
            c, vt, _ = pca(arm); ax = vt[0] * np.sign(np.dot(vt[0], fdir) or 1.0)
            t = (arm - c) @ ax; rad = np.linalg.norm((arm - c) - np.outer(t, ax), axis=1)
            bins = np.arange(t.min(), t.max(), 0.015)
            prof = [(b + 0.0075, float(np.percentile(rad[(t >= b) & (t < b + 0.015)], 85)), float(wh[(t >= b) & (t < b + 0.015)].mean()))
                    for b in bins if ((t >= b) & (t < b + 0.015)).sum() > 3]
            tw = None
            for (t0, r0, h0), (t1, r1, h1) in zip(prof, prof[1:]):
                if h0 >= 0.5 > h1:
                    tw = (t0 + t1) / 2
            if tw is None:
                # first jump (from the fingertips up) onto a sleeve wider than any hand
                tw = next((t0 + t1) / 2 for (t0, r0, _), (t1, r1, _) in zip(prof, prof[1:]) if r1 > max(0.07, 1.18 * r0))
            wrist = c + ax * tw; fdir = ax; wrist_src = 'arm-profile'
            if cfg.get('skin_wrist'):
                # Bare skin hand hanging out of a cloth sleeve (Forearm-weighted chain, no usable weight edge): the
                # wrist is where the sleeve cloth ends, the hand is the skin-coloured run past it (texture sampled at
                # vertex UVs), and the hand direction runs from that wrist to the skin fingertips.
                from PIL import Image
                sk = []
                for p in body_prims:
                    mat = g.json['materials'][p['prim']['material']]; tex = mat['pbrMetallicRoughness'].get('baseColorTexture')
                    if not tex:
                        continue
                    uri = g.json['images'][g.json['textures'][tex['index']]['source']]['uri']
                    im = np.asarray(Image.open(Path(__file__).resolve().parents[3] / 'public/assets/games/rts/models' / uri).convert('RGB')).astype(int)
                    H, W, _ = im.shape; px = im[np.clip((p['uv'][:, 1] * H).astype(int), 0, H - 1), np.clip((p['uv'][:, 0] * W).astype(int), 0, W - 1)]
                    r, gg, b_ = px[:, 0], px[:, 1], px[:, 2]
                    skin = (r > gg) & (gg > b_) & (r - b_ > 35) & (r - b_ < 140) & (r > 110)
                    chain = ((weight_of(p, hs) + weight_of(p, fs)) > 0.05) & (np.linalg.norm(p['posed'] - wrist, axis=1) < 0.25)
                    sk.append(p['posed'][skin & chain])
                sp = np.vstack(sk)
                sc, svt, _ = pca(sp); sax = svt[0] * np.sign(np.dot(svt[0], fdir) or 1.0)
                ts = (sp - sc) @ sax; edges = np.arange(ts.min(), ts.max() + 0.02, 0.02)
                t_top = edges[-1]
                for e in edges[1:]:  # walk up from the fingertips to the first near-empty band (the wrist / cuff)
                    if ((ts >= e) & (ts < e + 0.02)).sum() < 5:
                        t_top = e; break
                hand_skin = sp[ts < t_top]
                top = hand_skin[ts[ts < t_top] > t_top - 0.025]; tip = hand_skin[ts[ts < t_top] < ts.min() + 0.025]
                wrist = top.mean(0); fdir = (wrist - tip.mean(0)) / np.linalg.norm(wrist - tip.mean(0))
                fdir_src = 'skin-hand-axis'; wrist_src = 'skin-hand-top'
                m['skin_points'] = hand_skin
                rt = top - wrist; rt -= np.outer(rt @ fdir, fdir)
                m['arm_wrist_radius'] = float(np.percentile(np.linalg.norm(rt, axis=1), 85))
            else:
                near_w = [r for (tt, r, _) in prof if tw - 0.02 < tt < tw + 0.05]  # the cuff spans wrist .. +5 cm
                m['arm_wrist_radius'] = float(max(near_w)) if near_w else None
            m['arm_t_wrist'] = float(tw)
        if cfg.get('wrist_rule') == 'sleeve-end':
            # Rider couching a lance: the forearm runs along the shaft and the body's own (hidden) hand hangs below it,
            # so the wrist is the distal end of the Forearm-dominant sleeve, and the cuff points back up that sleeve.
            fa = fore_all[np.linalg.norm(fore_all - fist, axis=1) < 0.3]
            tt = (fa - fist) @ fdir
            wrist = fa[tt < np.percentile(tt, 8)].mean(0); wrist_src = 'sleeve-end'
            fdir = (fa.mean(0) - wrist) / np.linalg.norm(fa.mean(0) - wrist); fdir_src = 'sleeve-centroid'
        old_cuff_r = None
        if len(cuff_pts) >= 8:
            rc = cuff_pts - wrist; ac = rc @ fdir
            old_cuff_r = float(np.percentile(np.linalg.norm(rc - np.outer(ac, fdir), axis=1), 75))
        m.update(old_cuff_radius=old_cuff_r, hand_points=hand_pts, forearm_src=fdir_src)
        m.update(fist=fist, wrist=wrist, wrist_src=wrist_src, forearm_dir=fdir, sleeve_radius=sleeve_r, torso=torso,
                 hand_extent=float(np.percentile(np.linalg.norm(hand_pts - fist, axis=1), 90)))
        if cfg['held']:
            _, hnode = node_by_base(g, cfg['held'], lod); hp = prims(g, hnode, mats)
            allp = np.vstack([p['posed'] for p in hp])
            chosen = []
            for p in hp:
                d = np.linalg.norm(p['posed'] - fist, axis=1) < 0.11
                if cfg['select'] == 'shaft':
                    keep = np.full(len(d), p['material'] == 'PolishOak'); d = np.ones(len(d), bool)
                elif cfg['select'] == 'leather':
                    keep = (in_cell(p['uv'], LEATHER_CELL) | (in_cell(p['uv'], OAK_CELL) & cfg.get('haft', False))) if p['material'] == 'PolishEquipment' else np.full(len(d), p['material'] in LEATHER_MATERIALS or 'eather' in p['material'])
                else:
                    keep = np.ones(len(d), bool)
                chosen.append(p['posed'][d & keep])
            gp = np.vstack(chosen)
            if len(gp) < 12:  # nothing tagged as grip near the hand: the held piece's long shaft (sparse cylinder rings)
                c0, v0, _ = pca(allp); t0 = (allp - c0) @ v0[0]
                gp = allp if cfg['select'] == 'shaft' else allp[np.linalg.norm(allp - fist, axis=1) < 0.06]
            # Cylinder fit with outlier trimming: PCA axis, drop points far off the median radius, refit.
            for _ in range(4):
                c, vt, s = pca(gp)
                axis = vt[0]
                rel = gp - c; t = rel @ axis; rad = np.linalg.norm(rel - np.outer(t, axis), axis=1)
                keep = rad < max(np.median(rad) * 1.6, 0.008)
                if keep.all() or keep.sum() < 12:
                    break
                gp = gp[keep]
            center = c + axis * np.dot(fist - c, axis)
            rel = gp - center; t = rel @ axis; rad = np.linalg.norm(rel - np.outer(t, axis), axis=1)
            rr = rad[np.abs(t) < 0.035]
            m.update(grip_t_range=(float(t.min()), float(t.max())), grip_points=len(gp), grip_axis=axis, grip_center=center, grip_radius=float(np.percentile(rr if len(rr) > 6 else rad, 70)),
                     grip_spread=s.tolist(), held_centroid=allp.mean(0))
        out.append(m)
    return out, g


if __name__ == '__main__':
    np.set_printoptions(precision=3, suppress=True)
    root = Path(__file__).resolve().parents[3]
    for unit in sys.argv[1:] or HANDS:
        snap = root / f'art-factory/rts/runs/model-polish/2026-10-16-hands-v1/raw/publication-before/models/{unit}.glb'
        rows, _ = measure_unit(unit, 0, snap if snap.exists() else None)
        for m in rows:
            print(unit, m['side'], m['pose'], 'wrist', m['wrist'], m['wrist_src'], 'fdir', m['forearm_dir'], m['forearm_src'], 'oldcuff r', m['old_cuff_radius'], 'sleeve', round(m['sleeve_radius'], 4),
                  'fist', m['fist'], '|w-f|', round(float(np.linalg.norm(m['wrist'] - m['fist'])), 3))
            if 'grip_axis' in m:
                print('    grip n', m['grip_points'], 'axis', m['grip_axis'], 'centre', m['grip_center'], 'r', round(m['grip_radius'], 4),
                      'spread', np.round(m['grip_spread'], 3), 'dist fist->axis', round(float(np.linalg.norm(m['fist'] - m['grip_center'])), 3),
                      'wrist->axis', round(float(np.linalg.norm(np.cross(m['wrist'] - m['grip_center'], m['grip_axis']))), 3))
