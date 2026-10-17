"""Model polish round 3 (2026-10-17): more barracks facade relief (user: "improvement small").

Usage: python art-factory/rts/tools/model_polish_r3_buildings.py
On the published barracks (post 2026-10-16 relief; snapshot in the run's raw/publication-before/ once staged), using
the wall planes / openings found by model_polish_buildings.py:
  - timber framing on every blank outer wall: a wall plate under the eaves, posts at each bay and every wall end, and a pair of
    diagonal braces in each bay free of openings (DarkTimber, merged into the stage-3 DarkTimber primitive);
  - door frames: heavy timber jambs, a lintel beam with two knee braces and a stone threshold step;
  - window trims: a timber frame with a cross mullion and a projecting sill under every glazed opening.
Stone pieces join the stage-1 LightCutStone primitive and timber the stage-3 DarkTimber one, so materials, draw calls,
construction stages and part ids stay unchanged. Writes the candidate + qa/buildings.json only.
"""
from pathlib import Path
import hashlib, json, sys
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from model_polish_glb import Glb  # noqa: E402
from model_polish_geometry import merge, triangles, tangents  # noqa: E402
import model_polish_buildings as B  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
MODELS = ROOT / 'public/assets/games/rts/models'
RUN = ROOT / 'art-factory/rts/runs/model-polish/2026-10-17-v1'
CANDIDATE = RUN / 'candidate/models'
BEAM = 0.11  # timber section (m)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def baseline(name):
    snap = RUN / 'raw/publication-before/models' / name
    return snap if snap.exists() else MODELS / name


def brace(plane, ua, ya, ub, yb, depth, material='timber'):
    """Diagonal beam from (ua, ya) to (ub, yb) on the wall: a box rotated in the wall plane."""
    from model_polish_weapons import box
    L = float(np.hypot(ub - ua, yb - ya)); ang = np.arctan2(yb - ya, ub - ua)
    parts = box(material, (L, BEAM * 0.8, depth), (0, 0, 0))
    c, s = np.cos(ang), np.sin(ang)
    out = []
    for p in parts:
        loc = p.position.astype(np.float64); n = p.normal.astype(np.float64)
        u = loc[:, 0] * c - loc[:, 1] * s; y = loc[:, 0] * s + loc[:, 1] * c
        nu = n[:, 0] * c - n[:, 1] * s; ny = n[:, 0] * s + n[:, 1] * c
        world = np.array([B.to_world(plane, (ua + ub) / 2 + uu, (ya + yb) / 2 + yy, depth / 2 + dd) for uu, yy, dd in zip(u, y, loc[:, 2])])
        wn = np.zeros_like(n); ax = plane['axis']; wn[:, 1] = ny; wn[:, ax] = n[:, 2] * plane['sign']; wn[:, 2 - ax] = nu
        out.append(type(p)(p.material, world.astype(np.float32), wn.astype(np.float32), p.uv, p.indices))
    return out


def relief_r3(plane, rects):
    stone, timber = [], []
    u0, u1, y0, y1 = plane['umin'], plane['umax'], plane['ymin'], plane['ymax']
    blk = lambda *a, m='timber': B.block(plane, *a, material=m)
    clear = lambda ua, ub, ya, yb: all(ub < r[0] - 0.05 or ua > r[1] + 0.05 or yb < r[2] - 0.05 or ya > r[3] + 0.05 for r in rects)
    top = y1 - 0.06; band = y0 + (y1 - y0) * 0.38  # framing band: from the sill rail up to the wall plate
    # Courtyard walls with openings keep their stone surrounds and only get door / window timber; a plate across
    # them would float in front of the lower eaves. Blank outer walls get the full framing.
    framing = not rects
    # Wall plate and a sill rail where the wall is free of openings.
    if framing:
        timber += blk(u0 + 0.02, u1 - 0.02, top - BEAM, top, 0.0, 0.10)
    segs = [(u0 + 0.02, u1 - 0.02)] if framing else []
    for r in rects:
        if r[2] - 0.05 < band < r[3] + 0.05:
            segs = [q for a, b in segs for q in ((a, min(b, r[0] - 0.16)), (max(a, r[1] + 0.16), b)) if q[1] - q[0] > 0.3]
    for a, b in segs:
        timber += blk(a, b, band - BEAM / 2, band + BEAM / 2, 0.0, 0.085)
    # Posts at the wall ends and every bay; braces in clear bays.
    span = u1 - u0; bays = max(1, int(round(span / 1.25)))
    xs = [u0 + 0.30 + (span - 0.60) * i / bays for i in range(bays + 1)]
    posts = [x for x in xs if clear(x - BEAM / 2, x + BEAM / 2, band, top)] if framing else []
    for x in posts:
        timber += blk(x - BEAM / 2, x + BEAM / 2, band + BEAM / 2, top - BEAM, 0.0, 0.09)
    for a, b in zip(posts, posts[1:]):
        if b - a < 0.5 or not clear(a, b, band, top):
            continue
        m = (a + b) / 2
        timber += brace(plane, a + BEAM / 2, band + BEAM / 2, m, top - BEAM, 0.075)
        timber += brace(plane, b - BEAM / 2, band + BEAM / 2, m, top - BEAM, 0.075)
    # Openings.
    for ra, rb, ya, yb, kind in rects:
        if kind == 'DoorRecess':
            timber += blk(ra - 0.16, ra - 0.02, ya, yb + 0.02, -0.01, 0.16)
            timber += blk(rb + 0.02, rb + 0.16, ya, yb + 0.02, -0.01, 0.16)
            timber += blk(ra - 0.30, rb + 0.30, yb + 0.02, yb + 0.18, -0.01, 0.18)
            timber += brace(plane, ra - 0.02, yb - 0.30, ra + 0.22, yb + 0.03, 0.06)
            timber += brace(plane, rb + 0.02, yb - 0.30, rb - 0.22, yb + 0.03, 0.06)
            stone += blk(ra - 0.22, rb + 0.22, ya - 0.10, ya + 0.02, -0.02, 0.24, m='trim')
        else:  # GlassAmber
            w = 0.045
            timber += blk(ra - w, ra + 0.005, ya - 0.01, yb + 0.01, 0.0, 0.07)
            timber += blk(rb - 0.005, rb + w, ya - 0.01, yb + 0.01, 0.0, 0.07)
            timber += blk(ra - w, rb + w, yb - 0.005, yb + w, 0.0, 0.07)
            timber += blk(ra - w, rb + w, ya - w, ya + 0.005, 0.0, 0.07)
            mu, my = (ra + rb) / 2, (ya + yb) / 2
            timber += blk(mu - 0.018, mu + 0.018, ya, yb, 0.0, 0.05)
            timber += blk(ra, rb, my - 0.018, my + 0.018, 0.0, 0.05)
            stone += blk(ra - 0.12, rb + 0.12, ya - 0.13, ya - w, -0.01, 0.15, m='trim')
    return stone, timber


def append(g, node, parts, uv_scale):
    if not parts:
        return 0
    merged = next(iter(merge(parts).values()))
    prim = g.json['meshes'][node['mesh']]['primitives'][0]; at = prim['attributes']
    old = {k: g.accessor(v) for k, v in at.items()}; oidx = g.accessor(prim['indices']).reshape(-1).astype(np.uint32)
    uvs = merged.uv * uv_scale
    new = {'POSITION': merged.position, 'NORMAL': merged.normal, 'TEXCOORD_0': uvs, 'TANGENT': tangents(merged.position, merged.normal, uvs, merged.indices)}
    kinds = {'POSITION': 'VEC3', 'NORMAL': 'VEC3', 'TEXCOORD_0': 'VEC2', 'TANGENT': 'VEC4'}
    assert set(at) <= set(new), sorted(set(at) - set(new))
    prim['attributes'] = {k: g.add_accessor(np.vstack([old[k].astype(np.float32), new[k].astype(np.float32)]), kinds[k], minmax=(k == 'POSITION')) for k in at}
    idx = np.concatenate([oidx, merged.indices + len(old['POSITION'])])
    prim['indices'] = g.add_accessor(idx, 'SCALAR', component=5125 if idx.max() >= 65535 else 5123, target=34963)
    return triangles([merged])


def stage_node(g, material, stage):
    return next(n for n in g.json['nodes'] if 'mesh' in n and n.get('extras', {}).get('rtsConstructionStage') == stage and n.get('name', '').endswith(material))


def build(name='barracks'):
    src = baseline(f'{name}.glb'); g = Glb(src)
    tri = lambda: sum(g.json['accessors'][p['indices']]['count'] // 3 for m in g.json['meshes'] for p in m['primitives'])
    before = tri(); prims_before = sum(len(m['primitives']) for m in g.json['meshes'])
    found, _ = B.planes(g)
    stone, timber, faces = [], [], []
    for plane in found:
        rects = B.openings(g, plane)
        s, t = relief_r3(plane, rects); stone += s; timber += t
        faces.append({'axis': plane['axis'], 'sign': plane['sign'], 'coord': round(plane['coord'], 3), 'openings': [r[4] for r in rects],
                      'stone_triangles': triangles(s), 'timber_triangles': triangles(t)})
    import model_polish_r3_props as R
    court = R.courtyard(g)
    st = append(g, stage_node(g, 'LightCutStone', 1), stone, 0.25)
    tt = append(g, stage_node(g, 'DarkTimber', 3), timber, 0.5)
    CANDIDATE.mkdir(parents=True, exist_ok=True); out = CANDIDATE / f'{name}.glb'; g.save(out)
    rec = {'file': f'{name}.glb', 'baseline': str(src.relative_to(ROOT)).replace('\\', '/'), 'baseline_sha256': sha(src), 'candidate_sha256': sha(out),
           'bytes': out.stat().st_size, 'triangles_before': before, 'triangles': tri(), 'primitives_before': prims_before,
           'primitives': sum(len(m['primitives']) for m in g.json['meshes']), 'stone_triangles_added': st, 'timber_triangles_added': tt, 'courtyard_earth': court, 'faces': faces}
    (RUN / 'qa').mkdir(parents=True, exist_ok=True)
    (RUN / 'qa/buildings.json').write_text(json.dumps([rec], indent=2) + '\n', encoding='utf-8')
    print(name, before, '->', rec['triangles'], 'prims', prims_before, rec['primitives'], [(f['axis'], f['sign'], f['openings']) for f in faces])


if __name__ == '__main__':
    build()
