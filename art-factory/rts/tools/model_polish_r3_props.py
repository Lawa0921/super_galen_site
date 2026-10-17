"""Model polish round 3 (2026-10-17): landmark / prop textures, gold-mine silhouette, rock shading, tree canopies.

Usage: python art-factory/rts/tools/model_polish_r3_props.py [id ...]
Reads the published GLB (snapshot in the run's raw/publication-before/ when present, so reruns are deterministic) and
writes candidate GLBs + qa/props.json under art-factory/rts/runs/model-polish/2026-10-17-v1/. Never writes public/.
- Landmarks (both LODs): the embedded 128-384 px copies of the detail-v1 maps become external shared 1024 maps
  (ashlar -> detail-v1/ashlar, cut stone -> polish-v2/weathered-limestone, oak -> polish-v2/hewn-oak, brass ->
  polish-v1/aged-brass), downloaded once for the whole map instead of once per GLB. Same UVs, materials, factors.
- Props: oak bark / end grain / gold ore -> polish-v2 1024 maps; mine rock -> detail-v1/granite (same generated
  source as the old 384 px map). Leaf / needle atlases stay embedded (one user each).
- gold-mine: one Loop subdivision of the boulders and ore (faceted 400-triangle blobs) with smooth normals.
- rock: position-welded smooth normals (no triangle change; the pass ridge instances hundreds of rocks).
- oak / pine: canopy cards enlarged about their own centre and every other card duplicated into an inner layer
  (moved toward the canopy core, turned 90 degrees) so the crown reads full at game zoom; one extra card per two.
"""
from pathlib import Path
import hashlib, json, shutil, sys
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from model_polish_glb import Glb  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
MODELS = ROOT / 'public/assets/games/rts/models'
RUN = ROOT / 'art-factory/rts/runs/model-polish/2026-10-17-v1'
CANDIDATE = RUN / 'candidate/models'
LANDMARKS = ['river-gatehouse', 'river-shrine', 'highland-watchtower', 'quarry-ruins']
D1, P1, P2 = '../materials/detail-v1/', '../materials/polish-v1/', '../materials/polish-v2/'
# embedded image name -> external uri
LANDMARK_MAPS = {
    'ashlar-color': D1 + 'ashlar-color.jpg', 'ashlar-normal': D1 + 'ashlar-normal.png', 'ashlar-mr': D1 + 'ashlar-mr.png',
    'cutstone-color': P2 + 'weathered-limestone-color.jpg', 'cutstone-normal': P2 + 'weathered-limestone-normal.jpg', 'cutstone-mr': P2 + 'weathered-limestone-mr.png',
    'oak-color': P2 + 'hewn-oak-color.jpg', 'oak-normal': P2 + 'hewn-oak-normal.jpg', 'oak-mr': P2 + 'hewn-oak-mr.png',
    'brass-color': P1 + 'aged-brass-color.jpg', 'brass-normal': P1 + 'aged-brass-normal.jpg', 'brass-mr': P1 + 'aged-brass-mr.png',
}
PROP_MAPS = {
    'oak-bark-basecolor': P2 + 'oak-bark-color.jpg', 'oak-bark-normal': P2 + 'oak-bark-normal.jpg',
    'oak-endgrain-basecolor': P2 + 'oak-endgrain-color.jpg', 'oak-endgrain-normal': P2 + 'oak-endgrain-normal.jpg',
    'gold-ore-basecolor': P2 + 'gold-ore-color.jpg', 'gold-ore-normal': P2 + 'gold-ore-normal.jpg',
    'gray-rock-basecolor': D1 + 'granite-color.jpg', 'gray-rock-normal': D1 + 'granite-normal.png',
}
PROPS = ['gold-mine', 'timber-pile', 'oak', 'pine', 'rock']
# Courtyard earth (external uri, not embedded): the 2.1 MB PNG -> the shared polish-v2 JPEG (barracks: r3_buildings).
COURTYARD = ['stable', 'workshop', 'props/rubble-a', 'props/rubble-b']


def courtyard(g):
    hits = []
    for im in g.json.get('images', []):
        uri = im.get('uri', '')
        if uri.endswith('terrain/dirt-road.png'):
            new = uri[:uri.index('terrain/')] + 'materials/polish-v2/courtyard-earth-color.jpg'
            hits.append({'from': uri, 'to': new}); im['uri'] = new; im['name'] = 'courtyard-earth-color'
    return hits
CARD_GROW, INNER_PULL, INNER_EVERY = 1.22, 0.62, 2


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def baseline(name):
    snap = RUN / 'raw/publication-before/models' / name
    return snap if snap.exists() else MODELS / name


def retexture(g, mapping):
    """Embedded images named in `mapping` become external uris; identical uris share one image entry."""
    done = []
    images = g.json.get('images', [])
    for im in images:
        name = im.get('name', '')
        if 'bufferView' in im and name in mapping:
            uri = mapping[name]
            for k in ('bufferView', 'mimeType'):
                im.pop(k, None)
            im['uri'] = uri; im['name'] = Path(uri).stem
            done.append({'image': name, 'uri': uri})
    missing = [im.get('name') for im in images if 'bufferView' in im and im.get('name') not in mapping and mapping is LANDMARK_MAPS]
    assert not missing, missing
    # Share duplicates (two embedded copies of one map -> one uri).
    first = {}
    remap = {}
    for i, im in enumerate(images):
        key = im.get('uri')
        if key and key in first:
            remap[i] = first[key]
        elif key:
            first[key] = i
    for t in g.json.get('textures', []):
        t['source'] = remap.get(t['source'], t['source'])
    for t in g.json.get('samplers', []):
        t.setdefault('wrapS', 10497); t.setdefault('wrapT', 10497)
    return done


def prim_arrays(g, prim):
    a = prim['attributes']
    return (g.accessor(a['POSITION']).astype(np.float64), g.accessor(a['NORMAL']).astype(np.float64),
            g.accessor(a['TEXCOORD_0']).astype(np.float64), g.accessor(prim['indices']).reshape(-1, 3).astype(np.int64))


def set_prim(g, prim, pos, nrm, uv, tris):
    prim['attributes'] = {'POSITION': g.add_accessor(pos.astype(np.float32), 'VEC3', minmax=True),
                          'NORMAL': g.add_accessor(nrm.astype(np.float32), 'VEC3'),
                          'TEXCOORD_0': g.add_accessor(uv.astype(np.float32), 'VEC2')}
    idx = tris.reshape(-1)
    prim['indices'] = g.add_accessor(idx, 'SCALAR', component=5123 if idx.max() < 65535 else 5125, target=34963)


def weld_ids(arr, q=1e-5):
    keys = np.round(arr / q).astype(np.int64)
    _, first, inv = np.unique(keys, axis=0, return_index=True, return_inverse=True)
    return first, inv.reshape(-1)


def smooth_normals(pos, tris, pid):
    """Area-weighted vertex normals accumulated over position-welded vertices."""
    n = np.zeros((pid.max() + 1, 3))
    face = np.cross(pos[tris[:, 1]] - pos[tris[:, 0]], pos[tris[:, 2]] - pos[tris[:, 0]])
    for k in range(3):
        np.add.at(n, pid[tris[:, k]], face)
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    return n[pid]


def loop_subdivide(pos, nrm, uv, tris):
    """One Loop subdivision. Smoothing runs on the position-welded topology; UV seams stay split."""
    vfirst, vid = weld_ids(np.c_[pos, uv * 10])          # output vertices (position + uv)
    P = pos[vfirst]; U = uv[vfirst]; T = vid[tris]
    pfirst, pid_of_v = weld_ids(P)                       # smoothing topology (position only)
    PP = P[pfirst]; PT = pid_of_v[T]
    edges = np.sort(np.concatenate([PT[:, [0, 1]], PT[:, [1, 2]], PT[:, [2, 0]]]), axis=1)
    opp = np.concatenate([PT[:, 2], PT[:, 0], PT[:, 1]])
    ue, einv, ecount = np.unique(edges, axis=0, return_inverse=True, return_counts=True)
    einv = einv.reshape(-1)
    opp_sum = np.zeros((len(ue), 3)); np.add.at(opp_sum, einv, PP[opp])
    interior = ecount == 2
    epos = np.where(interior[:, None], 3 / 8 * (PP[ue[:, 0]] + PP[ue[:, 1]]) + 1 / 8 * opp_sum, 0.5 * (PP[ue[:, 0]] + PP[ue[:, 1]]))
    # vertex rule
    nb_sum = np.zeros_like(PP); deg = np.zeros(len(PP))
    for a, b in ((0, 1), (1, 0)):
        np.add.at(nb_sum, ue[:, a], PP[ue[:, b]]); np.add.at(deg, ue[:, a], 1)
    boundary_v = np.zeros(len(PP), bool); boundary_v[ue[~interior].reshape(-1)] = True
    beta = np.where(deg > 3, 3 / (8 * np.maximum(deg, 1)), 3 / 16)
    vpos = np.where(boundary_v[:, None], PP, (1 - deg[:, None] * beta[:, None]) * PP + beta[:, None] * nb_sum)
    # output: old vertices (V-level) + one midpoint per V-level edge
    vedges = np.sort(np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]]), axis=1)
    uve, vinv = np.unique(vedges, axis=0, return_inverse=True); vinv = vinv.reshape(-1)
    # position of a V-edge midpoint = Loop edge point of the matching P-edge
    pe_of_ve = np.sort(pid_of_v[uve], axis=1)
    lookup = {tuple(e): i for i, e in enumerate(ue)}
    mid_pos = epos[[lookup[tuple(e)] for e in pe_of_ve]]
    out_pos = np.vstack([vpos[pid_of_v], mid_pos]); out_uv = np.vstack([U, 0.5 * (U[uve[:, 0]] + U[uve[:, 1]])])
    n0 = len(P); m = len(T)
    e01, e12, e20 = vinv[:m] + n0, vinv[m:2 * m] + n0, vinv[2 * m:] + n0
    a, b, c = T[:, 0], T[:, 1], T[:, 2]
    new = np.concatenate([np.c_[a, e01, e20], np.c_[e01, b, e12], np.c_[e20, e12, c], np.c_[e01, e12, e20]])
    _, pid_out = weld_ids(out_pos)
    return out_pos, smooth_normals(out_pos, new, pid_out), out_uv, new


def card_components(tris):
    """Leaf cards: connected vertex groups (each card is a small strip of triangles)."""
    parent = np.arange(tris.max() + 1)
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x
    for t in tris:
        r = [find(v) for v in t]
        for v in r[1:]:
            parent[v] = r[0]
    roots = np.array([find(v) for v in range(len(parent))])
    _, comp = np.unique(roots, return_inverse=True)
    return comp


def rot_y(v, angle, center):
    c, s = np.cos(angle), np.sin(angle)
    d = v - center
    return np.c_[center[0] + c * d[:, 0] + s * d[:, 2], v[:, 1], center[2] - s * d[:, 0] + c * d[:, 2]]


def densify_canopy(pos, nrm, uv, tris, axis_core):
    comp = card_components(tris)
    ncard = comp.max() + 1
    cen = np.zeros((ncard, 3)); np.add.at(cen, comp, pos); cen /= np.bincount(comp, minlength=ncard)[:, None]
    grown = cen[comp] + (pos - cen[comp]) * CARD_GROW
    lo, hi = pos.min(0), pos.max(0); core = (lo + hi) / 2
    add_p, add_n, add_uv, add_t = [], [], [], []
    base = len(pos)
    for k in range(0, ncard, INNER_EVERY):
        vs = np.where(comp == k)[0]
        target = core.copy()
        if axis_core:  # pine: pull toward the trunk axis at the card's own height
            target[1] = cen[k, 1]
        new_c = target + (cen[k] - target) * INNER_PULL
        p = grown[vs] - cen[k] + new_c
        p = rot_y(p, np.pi / 2, new_c)
        nn = rot_y(nrm[vs], np.pi / 2, np.zeros(3))
        remap = {v: base + i for i, v in enumerate(vs)}
        sel = np.isin(tris, vs).all(1)
        add_t.append(np.vectorize(remap.get)(tris[sel]))
        add_p.append(p); add_n.append(nn); add_uv.append(uv[vs]); base += len(vs)
    return (np.vstack([grown] + add_p), np.vstack([nrm] + add_n), np.vstack([uv] + add_uv), np.vstack([tris] + add_t), int(ncard), len(add_p))


def mesh_prims(g, mesh_name):
    return g.json['meshes'][g.mesh_index(mesh_name)]['primitives']


def tri_count(g):
    return sum(g.json['accessors'][p['indices']]['count'] // 3 for m in g.json['meshes'] for p in m['primitives'])


def build(ids):
    CANDIDATE.mkdir(parents=True, exist_ok=True); (RUN / 'qa').mkdir(parents=True, exist_ok=True)
    rows = []
    jobs = [(f'{i}{s}.glb', 'landmark') for i in LANDMARKS for s in ('', '-lod1')] + [(f'{i}.glb', i) for i in PROPS] + [(f'{i}.glb', 'courtyard') for i in COURTYARD]
    for name, kind in jobs:
        if ids and name[:-4] not in ids and name[:-4].removesuffix('-lod1') not in ids:
            continue
        src = baseline(name); g = Glb(src); before = tri_count(g); edits = []
        mats = [m['name'] for m in g.json['materials']]
        if kind == 'courtyard':
            edits.append({'edit': 'courtyard-earth-jpeg', 'images': courtyard(g)})
        else:
            edits.append({'edit': 'external-shared-maps', 'images': retexture(g, LANDMARK_MAPS if kind == 'landmark' else PROP_MAPS)})
        if kind == 'gold-mine':
            for mesh in ('MineRock export mesh', 'GoldOre export mesh'):
                for prim in mesh_prims(g, mesh):
                    pos, nrm, uv, tris = prim_arrays(g, prim)
                    p2, n2, u2, t2 = loop_subdivide(pos, nrm, uv, tris); set_prim(g, prim, p2, n2, u2, t2)
                    edits.append({'edit': 'loop-subdivide', 'mesh': mesh, 'triangles': [len(tris), len(t2)],
                                  'bbox_before': [pos.min(0).round(3).tolist(), pos.max(0).round(3).tolist()],
                                  'bbox_after': [p2.min(0).round(3).tolist(), p2.max(0).round(3).tolist()]})
        if kind == 'rock':
            for prim in mesh_prims(g, 'GrayRock export mesh'):
                pos, nrm, uv, tris = prim_arrays(g, prim)
                _, pid = weld_ids(pos); n2 = smooth_normals(pos, tris, pid)
                set_prim(g, prim, pos, n2, uv, tris)
                edits.append({'edit': 'smooth-normals', 'mesh': 'GrayRock export mesh', 'mean_normal_change_deg': round(float(np.degrees(np.arccos(np.clip((n2 * nrm).sum(1), -1, 1))).mean()), 1)})
        if kind in ('oak', 'pine'):
            mesh = 'LeafCutout export mesh' if kind == 'oak' else 'PineNeedles export mesh'
            for prim in mesh_prims(g, mesh):
                pos, nrm, uv, tris = prim_arrays(g, prim)
                p2, n2, u2, t2, cards, inner = densify_canopy(pos, nrm, uv, tris, axis_core=kind == 'pine')
                set_prim(g, prim, p2, n2, u2, t2)
                edits.append({'edit': 'canopy-densify', 'mesh': mesh, 'cards': cards, 'inner_cards_added': inner, 'card_grow': CARD_GROW,
                              'inner_pull': INNER_PULL, 'triangles': [len(tris), len(t2)],
                              'bbox_before': [pos.min(0).round(3).tolist(), pos.max(0).round(3).tolist()],
                              'bbox_after': [p2.min(0).round(3).tolist(), p2.max(0).round(3).tolist()]})
        g.prune_materials()
        out = CANDIDATE / name; out.parent.mkdir(parents=True, exist_ok=True); g.save(out)
        rows.append({'file': name, 'baseline': str(src.relative_to(ROOT)).replace('\\', '/'), 'baseline_sha256': sha(src),
                     'baseline_bytes': src.stat().st_size, 'candidate_sha256': sha(out), 'bytes': out.stat().st_size,
                     'triangles_before': before, 'triangles': tri_count(g), 'materials': [m['name'] for m in g.json['materials']],
                     'materials_unchanged': mats == [m['name'] for m in g.json['materials']],
                     'embedded_images_left': [im.get('name') for im in g.json.get('images', []) if 'bufferView' in im], 'edits': edits})
        print(name, before, '->', rows[-1]['triangles'], src.stat().st_size, '->', out.stat().st_size, rows[-1]['embedded_images_left'])
    path = RUN / 'qa/props.json'
    old = {r['file']: r for r in json.loads(path.read_text(encoding='utf-8'))} if path.exists() else {}
    old.update({r['file']: r for r in rows})
    path.write_text(json.dumps(list(old.values()), indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    build(sys.argv[1:])
