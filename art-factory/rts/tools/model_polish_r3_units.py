"""Model polish round 3 (2026-10-17) unit edits on the published (post-hands) GLBs.

Usage: python art-factory/rts/tools/model_polish_r3_units.py [unit ...]
Reads the published bytes (snapshot in the run's raw/publication-before/ once staged) and writes candidate GLBs +
qa/<unit>-r3.json under art-factory/rts/runs/model-polish/2026-10-17-v1/. Never writes public/.
Edits (each recorded):
  - equipment atlas colour -> polish-v2/equipment-atlas-color.jpg (walnut oak cell; normal / metal-roughness atlases
    unchanged), every unit and LOD;
  - crossbow stock / priest staff PolishOak: walnut baseColorFactor instead of the orange-yellow one;
  - guard / knight / commander shields rebuilt with model_polish_weapons.shield(r3=True): the outline no longer spikes
    at the two top corners (the fold / crease) and the rivets are proud brass domes on the painted field (they were
    dark steel on the dark steel rim). Built in the exact frame the 2026-10-16 pass measured (re-measured from that
    pass's baseline snapshot and checked against the published face to < 0.1 mm), shifted by the same bind-space
    offset the hands pass applied, without the strap loops the hands pass removed;
  - worker: body skin triangles under the right glove's cuff are removed: those that poke through it in any sampled
    frame of Idle / Walk / Attack / Chop / Mine / Build, and those wholly inside it (>= 5 cm in from the forearm
    opening, Idle t=0), which showed as bright slivers through the gaps of the wrapped band.
Skeleton, skins, inverse bind matrices and animation channels are carried over byte-identical (Glb rewrites only
mesh primitives / materials / images).
"""
from pathlib import Path
import hashlib, json, sys
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from model_polish_glb import Glb  # noqa: E402
from model_polish_geometry import merge, triangles  # noqa: E402
import model_polish_apply as A  # noqa: E402
import model_polish_weapons as W  # noqa: E402
import model_hands_measure as M  # noqa: E402
from model_hands_pose import skin_matrices, joint_names  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
MODELS = ROOT / 'public/assets/games/rts/models'
RUN = ROOT / 'art-factory/rts/runs/model-polish/2026-10-17-v1'
CANDIDATE = RUN / 'candidate/models'
V1 = ROOT / 'art-factory/rts/runs/model-polish/2026-10-16-v1'
UNITS = ['worker', 'guard', 'crossbow', 'knight', 'priest', 'neutral-raider', 'commander']
OLD_ATLAS, NEW_ATLAS = '../materials/polish-v1/equipment-atlas-color.jpg', '../materials/polish-v2/equipment-atlas-color.jpg'
WALNUT_FACTOR = [0.212, 0.257, 0.39, 1]  # linear multiply: shield-oak mean sRGB (156,111,66) -> (75,57,40)
SHIELDS = {'guard': 'KingdomSunShield', 'knight': 'KnightSunShield', 'commander': 'CommanderDawnShield'}
WORKER_CLIPS = ('Idle', 'Walk', 'Attack', 'Chop', 'Mine', 'Build')
COVER_MARGIN = 0.05  # m in from the cuff opening; less shows the cut forearm through the flared opening


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def baseline(name):
    snap = RUN / 'raw/publication-before/models' / name
    return snap if snap.exists() else MODELS / name


def tri_count(g):
    return sum(g.json['accessors'][p['indices']]['count'] // 3 for m in g.json['meshes'] for p in m['primitives'])


def swap_atlas(g):
    """Point every image at the walnut atlas, then merge images / textures that became identical."""
    j = g.json; hits = 0
    for im in j.get('images', []):
        if im.get('uri') == OLD_ATLAS:
            im['uri'] = NEW_ATLAS; im['name'] = Path(NEW_ATLAS).name; hits += 1
    first = {}; imap = {}
    for i, im in enumerate(j.get('images', [])):
        key = im.get('uri') or ('#', i)
        imap[i] = first.setdefault(key, i)
    for t in j.get('textures', []):
        t['source'] = imap[t['source']]
    tfirst = {}; tmap = {}
    for i, t in enumerate(j.get('textures', [])):
        tmap[i] = tfirst.setdefault(json.dumps(t, sort_keys=True), i)
    def fix(node):
        if isinstance(node, dict):
            if 'index' in node and isinstance(node['index'], int) and set(node) <= {'index', 'texCoord', 'scale', 'strength', 'extensions', 'extras'}:
                node['index'] = tmap[node['index']]
            for v in node.values():
                fix(v)
        elif isinstance(node, list):
            for v in node:
                fix(v)
    fix(j.get('materials', []))
    return hits


def walnut(g):
    out = []
    for m in g.json['materials']:
        if m['name'] == 'PolishOak':
            out.append({'material': m['name'], 'before': m['pbrMetallicRoughness']['baseColorFactor'], 'after': WALNUT_FACTOR})
            m['pbrMetallicRoughness']['baseColorFactor'] = list(WALNUT_FACTOR)
    return out


def shield_spec(unit):
    base, kind, kw, style = next(u for u in A.UNITS[unit] if u[1] == 'shield')
    args = dict(A.DEFAULT_KW.get(kind, {})); args.update(kw)
    return base, args, style


def v1_frame(unit):
    """Re-measure the 2026-10-16 shield frame from that pass's baseline snapshot (identical code path)."""
    base, args, style = shield_spec(unit)
    src = V1 / 'raw/publication-before/models' / f'{unit}.glb'
    g = Glb(src); mesh = A.mesh_name_of(g, f'{base}_LOD0')
    frame, params = A.measure_shield(A.points_by_material(g, mesh), style=style, **args)
    recorded = next(p['params'] for f in json.loads((V1 / f'qa/{unit}-apply.json').read_text(encoding='utf-8'))['files']
                    for p in f['pieces'] if p['node'] == f'{base}_LOD0')
    for k, v in recorded.items():
        got = params[k]
        assert (abs(got - v) < 1e-3) if isinstance(v, float) else (json.loads(json.dumps(got)) == v or k == 'strap_offsets'), (unit, k, got, v)
    return frame, params, src


def built_prims(g, frame, params, detail):
    parts = [p.transformed(frame.matrix()) for p in A.to_atlas(W.shield(params, detail))]
    return merge(parts)


def rebuild_shield(g, unit, lod, frame, params):
    base = SHIELDS[unit]; node = A.node_named(g, f'{base}_LOD{lod}'); mesh = A.mesh_name_of(g, f'{base}_LOD{lod}')
    prims = g.json['meshes'][g.mesh_index(mesh)]['primitives']
    team_name = next(g.json['materials'][p['material']]['name'] for p in prims if 'TeamCloth' in g.json['materials'][p['material']]['name'])
    team_now = next(g.accessor(p['attributes']['POSITION']) for p in prims if g.json['materials'][p['material']]['name'] == team_name).astype(np.float64)
    # Reproduce the 2026-10-16 face to recover the hands pass's bind-space shift (and prove the frame matches).
    old = built_prims(g, frame, params, 1 if lod == 0 else 0)
    old_team = old['team'].position.astype(np.float64)
    assert old_team.shape == team_now.shape, (unit, lod, old_team.shape, team_now.shape)
    shift = (team_now - old_team).mean(0)
    residual = float(np.abs(team_now - old_team - shift).max())
    assert residual < 1e-4, (unit, lod, residual)
    joint = g.rigid_joint(mesh)
    new_params = dict(params, r3=True, strap_offsets=())
    new = built_prims(g, frame, new_params, 1 if lod == 0 else 0)
    team = next(n for n in A.points_by_material(g, mesh) if 'TeamCloth' in n)
    out = [dict(material=A.equipment_material(g) if key == 'equip' else A.material_index(g, key, team),
                position=p.position.astype(np.float64) + shift, normal=p.normal, uv=p.uv, indices=p.indices) for key, p in new.items()]
    before = sum(g.json['accessors'][p['indices']]['count'] // 3 for p in prims)
    g.replace_mesh(mesh, out, joint=joint)
    return {'edit': 'shield-r3', 'node': f'{base}_LOD{lod}', 'triangles': [before, triangles(new)], 'hands_shift_bind_m': [round(float(v), 5) for v in shift],
            'frame_residual_m': residual, 'rivets': 0 if lod else params.get('rivets', 10), 'rivet_material': 'brass', 'corner_fix': True}


def cuff_pokes(g, lod):
    """Body triangles of the worker that pierce the right glove cuff in any sampled frame."""
    names = joint_names(g); hs, fs = names.index('Hand_R'), names.index('Forearm_R')
    _, body = M.body_node(g, lod); _, glove = M.node_by_base(g, 'ProceduralGauntlet_R', lod)
    flagged = {}
    for clip in WORKER_CLIPS:
        anim = next((a for a in g.json['animations'] if a['name'] == clip), None)
        if anim is None:
            continue
        times = np.concatenate([g.accessor(s['input']).reshape(-1) for s in anim['samplers']])
        for t in np.linspace(times.min(), times.max(), 10):
            mats, world = skin_matrices(g, 0, clip, t); J = g.json['skins'][0]['joints']
            wrist = world[J[hs]][:3, 3]; f = wrist - world[J[fs]][:3, 3]; f /= np.linalg.norm(f)
            ref = np.cross(f, [0, 1, 0]); ref /= np.linalg.norm(ref); ref2 = np.cross(f, ref)
            def cyl(P):
                rel = P - wrist; sa = rel @ f; perp = rel - np.outer(sa, f)
                return sa, np.linalg.norm(perp, axis=1), np.arctan2(perp @ ref2, perp @ ref)
            gp = [pr for pr in M.prims(g, glove, mats)]
            G = np.vstack([pr['posed'] for pr in gp])
            gs, gr, ga = cyl(G)
            cuff = (gs < 0.004) & (gs > -0.13) & (gr < 0.13)  # right-glove vertices behind the wrist = the cuff tube
            if cuff.sum() < 20:
                continue
            cs, cr, ca = gs[cuff], gr[cuff], ga[cuff]
            s0, s1 = cs.min(), cs.max()
            for pr in M.prims(g, body, mats):
                bs, br, ba = cyl(pr['posed'])
                chain = M.weight_of(pr, hs) + M.weight_of(pr, fs)
                within = (bs > s0 + 0.004) & (bs < s1 - 0.002) & (br < 0.12) & (chain > 0.05)
                # Skin wholly inside the cuff (at least COVER_MARGIN in from its flared forearm opening) is never meant to be seen;
                # through the gaps of the wrapped band it showed as bright slivers. Classified in the Idle t=0 pose.
                covered = (bs > s0 + COVER_MARGIN) & (bs < s1 - 0.002) & (br < 0.12) & (chain > 0.05)
                lim = np.zeros(len(bs))
                for i in np.where(within)[0]:  # outer cuff radius near this vertex (+-1 cm along, +-20 degrees around)
                    da = np.abs((ca - ba[i] + np.pi) % (2 * np.pi) - np.pi)
                    near = (np.abs(cs - bs[i]) < 0.01) & (da < np.radians(20))
                    if near.any():
                        lim[i] = cr[near].max()
                poke = within & (lim > 0) & (br > lim - 0.0005)
                tris = g.accessor(pr['prim']['indices']).reshape(-1, 3)
                hit = poke[tris].any(1) & within[tris].all(1)
                if clip == 'Idle' and t == times.min():
                    hit |= covered[tris].all(1)
                key = id(pr['prim'])
                flagged.setdefault(key, (pr['prim'], pr['material'], np.zeros(len(tris), bool)))[2][:] |= hit
    return flagged


def trim_worker(g, lod):
    edits = []
    for prim, material, hit in cuff_pokes(g, lod).values():
        if not hit.any():
            continue
        tris = g.accessor(prim['indices']).reshape(-1, 3)
        keep = tris[~hit].reshape(-1)
        prim['indices'] = g.add_accessor(keep.astype(np.uint32 if keep.max() >= 65535 else np.uint16), 'SCALAR',
                                         component=5125 if keep.max() >= 65535 else 5123, target=34963)
        edits.append({'edit': 'worker-cuff-poke-trim', 'material': material, 'triangles_removed': int(hit.sum())})
    return edits


def build(units):
    CANDIDATE.mkdir(parents=True, exist_ok=True); (RUN / 'qa').mkdir(parents=True, exist_ok=True)
    for unit in units:
        record = {'unit': unit, 'run': 'art-factory/rts/runs/model-polish/2026-10-17-v1', 'files': []}
        frame = params = None
        if unit in SHIELDS:
            frame, params, v1src = v1_frame(unit)
            record['shield_frame_source'] = {'path': str(v1src.relative_to(ROOT)).replace('\\', '/'), 'sha256': sha(v1src)}
        for lod, suffix in ((0, ''), (1, '-lod1')):
            name = f'{unit}{suffix}.glb'; src = baseline(name); g = Glb(src); before = tri_count(g)
            edits = []
            wal = walnut(g)
            if wal:
                edits.append({'edit': 'walnut-factor', 'materials': wal})
            if unit in SHIELDS:
                edits.append(rebuild_shield(g, unit, lod, frame, params))
            if unit == 'worker':
                edits += trim_worker(g, lod)
            edits.insert(0, {'edit': 'atlas-walnut', 'images': swap_atlas(g)})
            g.prune_materials()
            out = CANDIDATE / name; g.save(out)
            g2 = Glb(out)
            record['files'].append({'file': name, 'baseline': str(src.relative_to(ROOT)).replace('\\', '/'), 'baseline_sha256': sha(src),
                                    'candidate_sha256': sha(out), 'bytes': out.stat().st_size, 'triangles_before': before, 'triangles': tri_count(g2),
                                    'materials': len(g2.json.get('materials', [])),
                                    'primitives': sum(len(g2.json['meshes'][n['mesh']]['primitives']) for n in g2.json['nodes'] if 'mesh' in n),
                                    'edits': edits})
            print(name, before, '->', tri_count(g2), [(e['edit'], e.get('triangles', e.get('triangles_removed', e.get('images')))) for e in edits])
        (RUN / 'qa' / f'{unit}-r3.json').write_text(json.dumps(record, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


if __name__ == '__main__':
    build(sys.argv[1:] or UNITS)
