"""Hand polish pass (2026-10-16): rebuilds every humanoid hand of the published unit GLBs.

Usage: python art-factory/rts/tools/model_hands_build.py [unit ...]
Reads the published bytes (pre-stage snapshot once staged), measures each hand in the Idle t=0 pose
(model_hands_measure.py), builds an articulated original hand (model_hands_geometry.py) closed on the real handle,
and splices it into the hand / gauntlet mesh of the same name (one PolishEquipment primitive: the shared, already
published equipment atlas; no new texture). Fingers, palm and thumb are rigid on the Hand bone; the cuff blends
Hand -> Forearm along the forearm so the wrist never collapses. Skeleton, skins, inverse bind matrices and every
animation channel are carried over byte-identical (model_polish_glb.Glb only rewrites mesh primitives).
Additional, recorded edits:
  - body hand triangles (Hand-dominant) are removed where a glove now covers the hand (bare TripoSR mitten hands);
  - shields get a real handle (leather grip on two brackets) where the closed hand is, and the old strap loop the
    hand used to float beside is removed;
  - over-thick hafts are slimmed only inside the hand (smooth waist) so fingers can close.
Writes candidate GLBs + qa/<unit>-hands.json under the hands run. Never writes public/.
"""
from pathlib import Path
import hashlib, json, sys
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from model_polish_glb import Glb  # noqa: E402
from model_polish_geometry import Part, merge, tangents  # noqa: E402
from model_polish_apply import to_atlas, equipment_material, triangles_of  # noqa: E402
from model_hands_pose import skin_matrices, joint_names, unskin_points, unskin_normals  # noqa: E402
import model_hands_measure as M  # noqa: E402
from model_hands_geometry import hand_parts, cuff_parts, phalanx, lathe_tube, STYLES, _n  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
MODELS = ROOT / 'public/assets/games/rts/models'
RUN = ROOT / 'art-factory/rts/runs/model-polish/2026-10-16-hands-v1'
CANDIDATE = RUN / 'candidate/models'
GRIP_TARGET = {'worker': 0.023, 'neutral-raider': 0.025}  # hafts thicker than a closed hand
PALM = 0.085
SHIELD_GRIP_R = 0.0135
BOARD_GAP = 0.052  # grip axis to board back surface


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def baseline_path(name):
    snap = RUN / 'raw/publication-before/models' / name
    return snap if snap.exists() else MODELS / name


def smoothstep(x):
    x = np.clip(x, 0, 1); return x * x * (3 - 2 * x)


# ---------------------------------------------------------------------------------------------------------------------
# frames (posed Idle t=0 space)

def shield_grip(m, held_pts):
    """New handle for a shield hand: across the forearm direction, parallel to the board, a palm's reach ahead of the
    wrist and far enough off the board for the fingers to pass behind it."""
    w, f = m['wrist'], m['forearm_dir']
    c, vt, _ = M.pca(held_pts); nb = vt[2] * np.sign(np.dot(m['wrist'] - c, vt[2]) or 1.0)
    y0 = _n(-f - nb * np.dot(-f, nb)); a = _n(np.cross(nb, y0))
    g = w + y0 * 0.078
    rel = held_pts - g; inplane = rel - np.outer(rel @ nb, nb)
    near = held_pts[np.linalg.norm(inplane, axis=1) < 0.08]
    board = float(((near - g) @ nb).max()) if len(near) else -0.06  # back surface height relative to g (<0: behind)
    need = SHIELD_GRIP_R + 2 * 0.0089 + 0.004
    shift = 0.0
    if -board < need:
        g = g + nb * (need + board)
        board = -need
    elif -board > BOARD_GAP:
        # The board sits far behind the closed hand: bring the (rigid) shield toward the hand so the handle sits on
        # short brackets. Checked against the body in every clip by model_hands_clearance.py.
        shift = -board - BOARD_GAP; board = -BOARD_GAP
    return dict(grip_center=g, grip_axis=a, grip_radius=SHIELD_GRIP_R, board_normal=nb, board_offset=board, shield_shift=shift)


def hand_frame(m):
    side = m['side']; w = m['wrist']; S = np.diag([-1.0, 1, 1]) if side == 'L' else np.eye(3)
    if m['pose'] == 'grip':
        g, a = m['grip_center'], m['grip_axis']
        d = w - g; Y = -_n(d - a * np.dot(d, a))
        if 'board_normal' in m:  # back of the hand faces away from the board
            b = m['board_normal']; zc = np.cross(b, Y) if side == 'R' else -np.cross(b, Y)
            Z = a * np.sign(np.dot(a, zc))
        else:
            Z = a * np.sign(np.dot(m['held_centroid'] - g, a) or 1.0)
        X = np.cross(Y, Z)
        Mx = np.stack([X, Y, Z], 1)
        wl = S @ (Mx.T @ (w - g))
        zr = (-0.012, 0.012)
        if 'grip_t_range' in m and 'board_normal' not in m:
            sgn = np.sign(np.dot(Z, a)); t0, t1 = sorted((m['grip_t_range'][0] * sgn, m['grip_t_range'][1] * sgn))
            margin = 2 * 0.0205 + 0.008
            zr = (t0 + margin, t1 - margin)
        return dict(R=Mx, origin=g, S=S, wrist_local=wl, grip_radius=m['grip_radius'], z_range=zr)
    # Empty hand: straight wrist continuing the forearm, back of the hand facing outward (away from the torso).
    Y = -_n(m['forearm_dir'])
    lateral = w - m['torso']; lateral[1] = 0
    b = _n(lateral - Y * np.dot(lateral, Y))
    X = b if side == 'R' else -b; Z = np.cross(X, Y)
    Mx = np.stack([X, Y, Z], 1); g = w + Y * PALM
    return dict(R=Mx, origin=g, S=S, wrist_local=np.array([0.0, -PALM, 0.0]), grip_radius=0.0)


def finer(parts, k=2.0):
    """Doubles the metric UV density (finer leather grain / steel brushing at hand scale)."""
    return [Part(p.material, p.position, p.normal, (p.uv * k).astype(np.float32), p.indices) for p in parts]


def to_posed(part, fr):
    A = fr['R'] @ fr['S']
    p = part.position.astype(np.float64) @ A.T + fr['origin']
    n = _n(part.normal.astype(np.float64) @ A.T)
    idx = part.indices.reshape(-1, 3)
    if np.linalg.det(A) < 0:
        idx = idx[:, [0, 2, 1]]
    return Part(part.material, p, n, part.uv, idx.reshape(-1).astype(np.uint32))


# ---------------------------------------------------------------------------------------------------------------------
# geometry assembly

def shield_handle_parts(sg, span, detail):
    g, a, nb, r = sg['grip_center'], sg['grip_axis'], sg['board_normal'], sg['grip_radius']
    half = span + 0.016
    parts = [lathe_tube('leather', g - a * half, a, [(0, r * 0.9), (0.004, r), (2 * half - 0.004, r), (2 * half, r * 0.9)], detail, n=12 if detail else 8)]
    for sgn in (-1, 1):
        end = g + a * sgn * (half + 0.004)
        parts.append(lathe_tube('brass', end - a * 0.006, a, [(0, r * 1.05), (0.003, r * 1.22), (0.009, r * 1.22), (0.012, r * 1.05)], detail, n=10 if detail else 6))
        depth = max(0.012, -sg['board_offset'] + 0.004)
        top = end + a * sgn * 0.002
        parts.append(phalanx('darksteel', top, top - nb * depth, a, (0.007, 0.007), (0.0035, 0.0035), 0.002, 0.002, detail, p=4.0, n=8 if detail else 6,
                             rings_a=1, rings_b=1, mid=False))
    return parts


def build_hand_geometry(m, fr, posed_mats, lod, unit):
    detail = 1 if lod == 0 else 0
    spec = dict(pose=m['pose'], grip_radius=fr['grip_radius'], wrist_local=fr['wrist_local'], style=m['style'], scale=1.0)
    if 'z_range' in fr:
        spec['z_range'] = fr['z_range']
    canon, info = hand_parts(spec, detail)
    hand = [to_posed(p, fr) for p, _ in canon]
    cap = 0.044 if m['style'].startswith('plate') else 0.031
    if m.get('arm_wrist_radius'):  # bare arm cut at the wrist: the glove cuff must close over the cut rim
        cuff_r = float(np.clip(m['arm_wrist_radius'] * 1.06, 0.03, 0.062))
    elif m['style'].startswith('plate'):
        cuff_r = float(np.clip(m['old_cuff_radius'] or m['sleeve_radius'], 0.028, cap))
    else:  # glove over a cloth / bare sleeve: the cuff closes over the sleeve end (per-unit cap for robes)
        cuff_r = float(np.clip(m['sleeve_radius'], 0.03, m.get('cuff_cap', 0.06)))
    cuffs, L = cuff_parts(m['style'], m['wrist'], m['forearm_dir'], cuff_r, 1.0, detail, cover_cut=not m['style'].startswith('plate'), length=m.get('long_cuff'))
    extra = shield_handle_parts(m['shield'], info['span'], detail) if m.get('shield') else []
    return hand + extra, cuffs, L, dict(cuff_radius=cuff_r, cuff_length=L, span=info['span'],
                                        wrist_local=[round(float(x), 4) for x in fr['wrist_local']])


def bind_part(part, joints_slots, weights, mats):
    jj = np.zeros((len(part.position), 4), np.int64); jj[:, :len(joints_slots)] = joints_slots
    ww = np.zeros((len(part.position), 4)); ww[:, :weights.shape[1]] = weights
    pos = unskin_points(part.position.astype(np.float64), jj, ww, mats)
    nor = unskin_normals(part.normal.astype(np.float64), jj, ww, mats)
    jj[ww <= 0] = 0  # glTF: unused influence slots carry joint 0 / weight 0
    return Part(part.material, pos.astype(np.float32), nor.astype(np.float32), part.uv, part.indices), jj.astype(np.uint16), ww.astype(np.float32)


def set_skinned_mesh(g, mesh_index, items, material):
    """items: [(Part in atlas uv, joints (n,4), weights (n,4))] -> one primitive."""
    pos = np.vstack([p.position for p, _, _ in items]); nor = np.vstack([p.normal for p, _, _ in items]); uv = np.vstack([p.uv for p, _, _ in items])
    jj = np.vstack([j for _, j, _ in items]); ww = np.vstack([w for _, _, w in items])
    idx = []; base = 0
    for p, _, _ in items:
        idx.append(p.indices.astype(np.int64) + base); base += len(p.position)
    idx = np.concatenate(idx)
    attrs = {'POSITION': g.add_accessor(pos, 'VEC3', minmax=True), 'NORMAL': g.add_accessor(nor, 'VEC3'),
             'TEXCOORD_0': g.add_accessor(uv, 'VEC2'), 'TANGENT': g.add_accessor(tangents(pos, nor, uv, idx), 'VEC4'),
             'JOINTS_0': g.add_accessor(jj, 'VEC4', component=5123), 'WEIGHTS_0': g.add_accessor(ww, 'VEC4')}
    comp = 5123 if idx.max() < 65535 else 5125
    g.json['meshes'][mesh_index]['primitives'] = [{'attributes': attrs, 'indices': g.add_accessor(idx, 'SCALAR', component=comp, target=34963),
                                                   'material': material, 'mode': 4}]
    return len(idx) // 3


def drop_triangles(g, prim, keep_mask):
    idx = g.accessor(prim['indices']).reshape(-1, 3)
    kept = idx[keep_mask]
    comp = 5123 if kept.max() < 65535 else 5125
    prim['indices'] = g.add_accessor(kept.reshape(-1).astype(np.uint32), 'SCALAR', component=comp, target=34963)
    return int((~keep_mask).sum())


def components(tris):
    """Connected components of triangles sharing vertices (union-find)."""
    parent = {}

    def find(x):
        while parent.setdefault(x, x) != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x
    for a, b, c in tris:
        ra, rb, rc = find(a), find(b), find(c); parent[rb] = ra; parent[find(rc)] = ra
    return np.array([find(t[0]) for t in tris])


# ---------------------------------------------------------------------------------------------------------------------

def build_unit(unit):
    rows0, _ = M.measure_unit(unit, 0, baseline_path(f'{unit}.glb'))
    g0 = Glb(baseline_path(f'{unit}.glb')); mats0, _ = skin_matrices(g0, 0, 'Idle', 0.0)
    record = {'unit': unit, 'pose': 'Idle t=0', 'hands': [], 'files': []}
    for m in rows0:
        if m['held']:
            _, hnode = M.node_by_base(g0, m['held'], 0); hp = M.prims(g0, hnode, mats0)
            held_pts = np.vstack([p['posed'] for p in hp])
            if 'Shield' in m['held']:
                m['shield'] = shield_grip(m, held_pts); m.update({k: v for k, v in m['shield'].items() if k != 'board_offset'})
            elif unit in GRIP_TARGET and m['grip_radius'] > GRIP_TARGET[unit] * 1.05:
                m['squeeze'] = dict(center=m['grip_center'], axis=m['grip_axis'], r_now=m['grip_radius'], r_target=GRIP_TARGET[unit])
                m['grip_radius'] = GRIP_TARGET[unit]
        m['frame'] = hand_frame(m)
    for lod, suffix in ((0, ''), (1, '-lod1')):
        src = baseline_path(f'{unit}{suffix}.glb')
        g = Glb(src); mats, _ = skin_matrices(g, 0, 'Idle', 0.0); names = joint_names(g)
        eq = equipment_material(g)
        _, body = M.body_node(g, lod)
        hosts = {}
        file_rows = {'file': f'{unit}{suffix}.glb', 'baseline': str(src.relative_to(ROOT)).replace('\\', '/'), 'baseline_sha256': sha(src), 'edits': []}
        for m in rows0:
            hs, fs = names.index('Hand_' + m['side']), names.index('Forearm_' + m['side'])
            hand, cuffs, L, info = build_hand_geometry(m, m['frame'], mats, lod, unit)
            items = []
            for p in to_atlas(finer(hand)):
                items.append(bind_part(p, [hs], np.ones((len(p.position), 1)), mats))
            for p in to_atlas(finer(cuffs)):
                s_ax = (p.position.astype(np.float64) - m['wrist']) @ m['forearm_dir']
                # Steel cuffs are rigid bells on the hand (like real gauntlet cuffs); leather cuffs blend half-way to the
                # forearm along their length so a bending wrist stretches leather instead of opening a gap.
                wf = (0.0 if m['style'].startswith('plate') else m.get('cuff_blend', 0.35)) * smoothstep(s_ax / L)
                items.append(bind_part(p, [hs, fs], np.stack([1 - wf, wf], 1), mats))
            host = m.get('host') or m['old']
            hosts.setdefault(host, []).extend(items)
            if lod == 0:
                record['hands'].append({'side': m['side'], 'pose': m['pose'], 'style': m['style'], 'host': host, 'held': m['held'],
                                        'wrist_source': m['wrist_src'], 'grip_radius_m': round(float(m['frame']['grip_radius']), 4),
                                        'grip_center_posed': [round(float(x), 4) for x in m['frame']['origin']],
                                        'thumb_axis_posed': [round(float(x), 4) for x in m['frame']['R'][:, 2]],
                                        'shield_handle': bool(m.get('shield')), 'haft_squeeze': ({k: (round(float(v), 4) if np.isscalar(v) else None) for k, v in m['squeeze'].items() if k in ('r_now', 'r_target')} if m.get('squeeze') else None),
                                        **info})
            # Slim an over-thick haft inside the hand (held piece is rigid on the same hand bone).
            if m.get('squeeze'):
                q = m['squeeze']; _, hnode = M.node_by_base(g, m['held'], lod)
                inv = np.linalg.inv(mats[hs])
                for pr in M.prims(g, hnode, mats):
                    P = pr['posed']; rel = P - q['center']; t = rel @ q['axis']; radial = rel - np.outer(t, q['axis'])
                    rl = np.linalg.norm(radial, axis=1)
                    k0 = q['r_target'] / q['r_now']
                    k = 1 - (1 - k0) * (1 - smoothstep((np.abs(t) - 0.06) / 0.06))
                    grip_cells = (M.in_cell(pr['uv'], M.LEATHER_CELL) | M.in_cell(pr['uv'], M.OAK_CELL)) if pr['material'] == 'PolishEquipment' else np.ones(len(P), bool)
                    k = np.where((rl < q['r_now'] * 1.7) & grip_cells, k, 1.0)
                    newp = q['center'] + np.outer(t, q['axis']) + radial * k[:, None]
                    bind = (np.c_[newp, np.ones(len(newp))] @ inv.T)[:, :3]
                    prim = pr['prim']; prim['attributes']['POSITION'] = g.add_accessor(bind.astype(np.float32), 'VEC3', minmax=True)
                    file_rows['edits'].append({'edit': 'haft-waist', 'node': f"{m['held']}_LOD{lod}", 'vertices_moved': int((k < 0.999).sum())})
            # Shield: move it onto the new handle's short brackets, and remove the old strap loops the hand floated
            # beside (they never met the hand; the new handle replaces them).
            if m.get('shield'):
                _, hnode = M.node_by_base(g, m['held'], lod)
                sh = m['shield']['shield_shift']
                if sh > 0:
                    inv = np.linalg.inv(mats[hs])
                    for pr in M.prims(g, hnode, mats):
                        newp = pr['posed'] - m['shield']['board_normal'] * sh
                        bind = (np.c_[newp, np.ones(len(newp))] @ inv.T)[:, :3]
                        pr['prim']['attributes']['POSITION'] = g.add_accessor(bind.astype(np.float32), 'VEC3', minmax=True)
                    b = hnode.get('extras', {}).get('rtsConservativeBounds')
                    if b:
                        b['sphere_radius_m'] = float(b['sphere_radius_m'] + sh)
                    file_rows['edits'].append({'edit': 'shield-onto-handle', 'node': f"{m['held']}_LOD{lod}", 'shift_m': round(float(sh), 4)})
                for pr in M.prims(g, hnode, mats):
                    if pr['material'] != 'PolishEquipment':
                        continue
                    tris = g.accessor(pr['prim']['indices']).reshape(-1, 3).astype(np.int64)
                    leather = M.in_cell(pr['uv'], M.LEATHER_CELL)
                    lt = leather[tris].all(1)
                    keep = np.ones(len(tris), bool)
                    if lt.any():
                        comp = components(tris[lt]); idxs = np.where(lt)[0]
                        for cid in np.unique(comp):
                            sel = idxs[comp == cid]
                            cen = pr['posed'][tris[sel].reshape(-1)].mean(0)
                            if np.linalg.norm(cen - m['shield']['grip_center']) < 0.25:
                                keep[sel] = False
                    if (~keep).any():
                        file_rows['edits'].append({'edit': 'shield-strap-removed', 'node': f"{m['held']}_LOD{lod}", 'triangles': drop_triangles(g, pr['prim'], keep)})
        for host, items in hosts.items():
            idx, node = M.node_by_base(g, host, lod)
            tri = set_skinned_mesh(g, node['mesh'], items, eq)
            sides = {m['side'] for m in rows0 if (m.get('host') or m['old']) == host}
            if len(sides) > 1 and 'rtsConservativeBounds' in body.get('extras', {}):
                node.setdefault('extras', {})['rtsConservativeBounds'] = json.loads(json.dumps(body['extras']['rtsConservativeBounds']))
            node.setdefault('extras', {})['rtsHandPolish'] = 'model_hands_build.py articulated original hand(s); code primitives + shared equipment atlas'
            file_rows['edits'].append({'edit': 'hand-mesh', 'node': f'{host}_LOD{lod}', 'sides': sorted(sides), 'triangles': tri})
        # Body hand triangles that a glove now covers.
        slots = [names.index('Hand_' + m['side']) for m in rows0]
        for pr in M.prims(g, body, mats):
            tris = g.accessor(pr['prim']['indices']).reshape(-1, 3)
            hw = np.zeros(len(pr['pos']))
            for sl in slots:
                hw = np.maximum(hw, M.weight_of(pr, sl))
            keep = ~(hw[tris] >= 0.5).all(1)
            # Bare body hands (TripoSR mittens, often Forearm-weighted): cut everything past the wrist inside the glove.
            for m in rows0:  # every new glove: the body's arm chain past the wrist is inside it (or a stale stump)
                rel = pr['posed'] - m['wrist']; sa = rel @ m['forearm_dir']
                rad = np.linalg.norm(rel - np.outer(sa, m['forearm_dir']), axis=1)
                hsl, fsl = names.index('Hand_' + m['side']), names.index('Forearm_' + m['side'])
                chain = (M.weight_of(pr, hsl) + M.weight_of(pr, fsl)) > 0.1
                inside = (sa < 0.006) & (sa > -0.24) & (rad < 0.085) & chain
                if 'skin_points' in m:  # the measured bare-skin hand past the sleeve goes entirely
                    key = {tuple(np.round(q, 5)) for q in m['skin_points']}
                    inside |= np.array([tuple(np.round(q, 5)) in key for q in pr['posed']])
                keep &= ~inside[tris].all(1)
            if (~keep).any():
                file_rows['edits'].append({'edit': 'body-hand-trim', 'node': body['name'], 'material': pr['material'], 'triangles': drop_triangles(g, pr['prim'], keep)})
        g.prune_materials()
        CANDIDATE.mkdir(parents=True, exist_ok=True)
        out = CANDIDATE / f'{unit}{suffix}.glb'; g.save(out)
        g2 = Glb(out)
        file_rows.update(candidate_sha256=sha(out), bytes=out.stat().st_size, triangles=sum(triangles_of(g2, mm['name']) for mm in g2.json['meshes']),
                         materials=len(g2.json.get('materials', [])), primitives=sum(len(g2.json['meshes'][n['mesh']]['primitives']) for n in g2.json['nodes'] if 'mesh' in n))
        record['files'].append(file_rows)
    return record


if __name__ == '__main__':
    units = sys.argv[1:] or list(M.HANDS)
    (RUN / 'qa').mkdir(parents=True, exist_ok=True)
    for unit in units:
        rec = build_unit(unit)
        (RUN / 'qa' / f'{unit}-hands.json').write_text(json.dumps(rec, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        for f in rec['files']:
            print(f['file'], 'tris', f['triangles'], 'prims', f['primitives'], 'mats', f['materials'], [(e['edit'], e.get('triangles', e.get('vertices_moved'))) for e in f['edits']])
