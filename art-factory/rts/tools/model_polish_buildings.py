"""Facade relief + texture upgrade for barracks and the three town hall tiers (model polish 2026-10-16).

Usage: python art-factory/rts/tools/model_polish_buildings.py [barracks townhall townhall-tier2 townhall-tier3]
For each exterior wall plane found in the published GLB (large axis-aligned IvoryLimestone faces whose normal points
away from the footprint centre) it adds dressed-stone relief built from code primitives: plinth, clasping corner
buttresses with weathering steps, intermediate buttresses where no opening sits, string courses between window rows,
a corbel table under the eaves and surrounds/sills around every glazed opening that lacks one. Relief is appended as an
extra LightCutStone primitive to the existing stage-1 structure node, so construction stages, part ids and material
count stay unchanged. Building material maps are pointed at the 1024 polish-v1 set. Writes candidates only.
"""
from pathlib import Path
import hashlib, json, sys
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from model_polish_glb import Glb  # noqa: E402
from model_polish_geometry import merge, triangles, tangents  # noqa: E402
from model_polish_weapons import box  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
MODELS = ROOT / 'public/assets/games/rts/models'
RUN = ROOT / 'art-factory/rts/runs/model-polish/2026-10-16-v1'
CANDIDATE = RUN / 'candidate/models'
TEX = '../materials/polish-v1/'
# Building material -> polish map set (colour >= 1024, normal/MR 512).
# Building material -> polish map set (colour >= 1024). IvoryLimestone already ships a 1024 ashlar and Ironwork /
# WeatheredBrass share detail-v1 maps with every other building, so they stay on detail-v1 (no duplicate download).
RETEXTURE = {'LightCutStone': 'cut-stone-face', 'NavySlate': 'navy-slate', 'SlateHighlight': 'navy-slate',
             'DarkTimber': 'shield-oak', 'TimberEdge': 'shield-oak'}


def baseline_path(name):
    """The published bytes this run started from: the pre-stage snapshot once staging has replaced public/."""
    snap = RUN / 'raw/publication-before/models' / name
    return snap if snap.exists() else MODELS / name


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def tris_of(g, node):
    out = []
    for p in g.json['meshes'][node['mesh']]['primitives']:
        P = g.accessor(p['attributes']['POSITION']).astype(np.float64); T = g.accessor(p['indices']).reshape(-1, 3)
        out.append((g.json['materials'][p['material']]['name'], P, T))
    return out


def planes(g, material='IvoryLimestone', min_area=2.0):
    """Exterior axis-aligned wall planes: (axis, sign, coord, umin, umax, ymin, ymax)."""
    faces = []; allp = []
    for n in g.json['nodes']:
        if 'mesh' not in n:
            continue
        stage = n.get('extras', {}).get('rtsConstructionStage')
        for name, P, T in tris_of(g, n):
            allp.append(P)
            if name != material or stage != 1:  # stage 1 = bearing walls; stage 2 gables are triangular
                continue
            a, b, c = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]
            cr = np.cross(b - a, c - a); ar = np.linalg.norm(cr, axis=1) / 2; nn = cr / (2 * ar[:, None] + 1e-12)
            faces.append((a, b, c, ar, nn))
    centre = np.vstack(allp).mean(0)
    found = []
    for a, b, c, ar, nn in faces:
        for ax in (0, 2):
            for s in (1, -1):
                m = (nn[:, ax] * s > 0.98) & (ar > 1e-5)
                coord = np.round(a[m, ax], 2)
                for v in np.unique(coord):
                    mm = m.copy(); mm[m] = coord == v
                    if ar[mm].sum() < min_area:
                        continue
                    pts = np.vstack([a[mm], b[mm], c[mm]]); u = 2 - ax
                    found.append(dict(axis=ax, sign=s, coord=float(v), umin=float(pts[:, u].min()), umax=float(pts[:, u].max()),
                                      ymin=float(pts[:, 1].min()), ymax=float(pts[:, 1].max()), area=float(ar[mm].sum())))
    # Keep exterior faces: rays cast outward from the face must escape the building (inner hall faces hit the
    # opposite wall), and no coplanar layer of the same wall lies further out.
    tris = np.vstack([np.stack([a, b, c], 1) for a, b, c, _, _ in faces])
    out = []
    for f in found:
        if escape_ratio(f, tris) < 0.6:
            continue
        twins = [o for o in found if o['axis'] == f['axis'] and o['sign'] == f['sign'] and o is not f and
                 min(o['umax'], f['umax']) - max(o['umin'], f['umin']) > 0.5 and (o['coord'] - f['coord']) * f['sign'] > 0 and
                 abs(o['coord'] - f['coord']) < 0.6]
        if not twins:
            out.append(f)
    return out, centre


def escape_ratio(f, tris, reach=4.0):
    """Fraction of 15 outward rays from the face that hit no wall triangle within `reach` metres."""
    ax, u = f['axis'], 2 - f['axis']; d = np.zeros(3); d[ax] = f['sign']
    v0, e1, e2 = tris[:, 0], tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0]
    pvec = np.cross(d, e2); det = np.einsum('ij,ij->i', e1, pvec); ok = np.abs(det) > 1e-9
    v0, e1, e2, pvec, det = v0[ok], e1[ok], e2[ok], pvec[ok], det[ok]
    free = 0; total = 0
    for uu in np.linspace(f['umin'], f['umax'], 7)[1:-1]:
        for yy in np.linspace(f['ymin'], f['ymax'], 5)[1:-1]:
            o = np.zeros(3); o[ax] = f['coord'] + f['sign'] * 0.02; o[u] = uu; o[1] = yy
            tvec = o - v0; uq = np.einsum('ij,ij->i', tvec, pvec) / det
            q = np.cross(tvec, e1); vq = (q @ d) / det; t = np.einsum('ij,ij->i', e2, q) / det
            hit = (uq >= 0) & (vq >= 0) & (uq + vq <= 1) & (t > 0.03) & (t < reach)
            free += not hit.any(); total += 1
    return free / total


def merge_rects(rects, gap=0.12):
    rects = [list(r) for r in rects]; changed = True
    while changed:
        changed = False
        for i in range(len(rects)):
            for j in range(i + 1, len(rects)):
                a, b = rects[i], rects[j]
                if a[4] == b[4] and a[0] - gap <= b[1] and b[0] - gap <= a[1] and a[2] - gap <= b[3] and b[2] - gap <= a[3]:
                    rects[i] = [min(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), max(a[3], b[3]), a[4]]; del rects[j]; changed = True; break
            if changed:
                break
    return [tuple(r) for r in rects]


def openings(g, plane, materials=('GlassAmber', 'DoorRecess')):
    """Rectangles (umin, umax, ymin, ymax) of glazing/door recesses within 0.45 m behind or in front of the plane."""
    ax, u = plane['axis'], 2 - plane['axis']; rects = []
    for n in g.json['nodes']:
        if 'mesh' not in n:
            continue
        for name, P, T in tris_of(g, n):
            if name not in materials:
                continue
            near = np.abs(P[:, ax] - plane['coord']) < 0.45
            if not near.any():
                continue
            # connected components by triangles touching each other (shared vertices)
            tri = T[np.all(near[T], axis=1)]
            if not len(tri):
                continue
            parent = list(range(len(P)))
            def find(i):
                while parent[i] != i:
                    parent[i] = parent[parent[i]]; i = parent[i]
                return i
            for t in tri:
                for k in (1, 2):
                    ra, rb = find(t[0]), find(t[k])
                    if ra != rb:
                        parent[ra] = rb
            groups = {}
            for v in np.unique(tri):
                groups.setdefault(find(v), []).append(v)
            for vs in groups.values():
                q = P[vs]
                if plane['umin'] - 0.1 <= q[:, u].mean() <= plane['umax'] + 0.1 and plane['ymin'] - 0.2 <= q[:, 1].mean() <= plane['ymax']:
                    rects.append((float(q[:, u].min()), float(q[:, u].max()), float(q[:, 1].min()), float(q[:, 1].max()), name))
    return merge_rects(rects)


def framed(g, plane, rect, materials=('LightCutStone', 'DarkTimber', 'Ironwork', 'WeatheredBrass')):
    """True when the published model already has a surround in front of this opening (do not double it)."""
    ax, u = plane['axis'], 2 - plane['axis']
    for n in g.json['nodes']:
        if 'mesh' not in n or n.get('extras', {}).get('rtsConstructionStage') not in (1, 3):
            continue
        for name, P, T in tris_of(g, n):
            if name not in materials:
                continue
            d = (P[:, ax] - plane['coord']) * plane['sign']
            m = (d > 0.01) & (d < 0.3) & (P[:, u] > rect[0] - 0.2) & (P[:, u] < rect[1] + 0.2) & (P[:, 1] > rect[2] - 0.2) & (P[:, 1] < rect[3] + 0.2)
            if m.sum() >= 8:
                return True
    return False


def to_world(plane, u, y, d):
    """Plane-local (u along wall, y up, d outward) -> world."""
    p = np.zeros(3); ax = plane['axis']; p[1] = y
    p[ax] = plane['coord'] + plane['sign'] * d; p[2 - ax] = u
    return p


def block(plane, u0, u1, y0, y1, d0, d1, material='trim'):
    """Axis-aligned relief block on the wall in plane coordinates."""
    c = to_world(plane, (u0 + u1) / 2, (y0 + y1) / 2, (d0 + d1) / 2)
    size = np.zeros(3); ax = plane['axis']; size[1] = y1 - y0; size[ax] = abs(d1 - d0); size[2 - ax] = u1 - u0
    return box(material, size, c)


def wedge(plane, u0, u1, y0, y1, d_low, d_high_bottom, material='trim'):
    """Sloped weathering: a ramp from depth d_high_bottom at y0 back to d_low at y1, with closed trapezoid ends."""
    from model_polish_geometry import grid
    from model_polish_weapons import face_toward
    pts = lambda u, y, d: to_world(plane, u, y, d)
    outward = np.zeros(3); outward[plane['axis']] = plane['sign']; outward[1] = 1.0
    q = np.array([[pts(u0, y0, d_high_bottom), pts(u1, y0, d_high_bottom)], [pts(u0, y1, d_low), pts(u1, y1, d_low)]])
    parts = face_toward([grid(material, q)], outward)
    side = np.zeros(3)
    for u, sgn in ((u0, -1), (u1, 1)):
        side[:] = 0; side[2 - plane['axis']] = sgn
        e = np.array([[pts(u, y0, 0.0), pts(u, y0, d_high_bottom)], [pts(u, y1, 0.0), pts(u, y1, d_low)]])
        parts += face_toward([grid(material, e)], side.copy())
    return parts


def relief(plane, rects, style, bare=None):
    """Bold, sparse dressed-stone relief; tall walls (>= 3.5 m) get the full keep treatment."""
    parts = []
    u0, u1, y0, y1 = plane['umin'], plane['umax'], plane['ymin'], plane['ymax']
    span = u1 - u0; height = y1 - y0; tall = height >= 3.5

    def clear(ua, ub, ya, yb):
        return all(ub < r[0] - 0.06 or ua > r[1] + 0.06 or yb < r[2] - 0.06 or ya > r[3] + 0.06 for r in rects)
    # Plinth with chamfered weathering.
    ph = style.get('plinth', 0.30)
    parts += block(plane, u0 - 0.06, u1 + 0.06, y0 - 0.02, y0 + ph, -0.02, 0.11)
    parts += wedge(plane, u0 - 0.06, u1 + 0.06, y0 + ph, y0 + ph + 0.09, 0.0, 0.11)
    # Clasping corner buttresses (narrowed when a window surround sits near the corner) and buttresses / pilaster
    # strips on long walls; a column blocked low down by a door or window starts above it instead.
    bw = 0.46 if tall else 0.36; bd = 0.26 if tall else 0.18
    top = y1 - (0.62 if tall else 0.10)
    def column_start(ua, ub):
        over = [r[3] for r in rects if not (ub < r[0] - 0.06 or ua > r[1] + 0.06)]
        return y0 + ph + 0.09 if not over else max(over) + 0.30
    columns = []
    for side in (0, 1):
        for w in (bw, bw * 0.7, bw * 0.5):
            ua, ub = (u0 - 0.03, u0 - 0.03 + w) if side == 0 else (u1 + 0.03 - w, u1 + 0.03)
            if clear(ua, ub, y0 + ph, top):
                columns.append((ua, ub, y0 + ph + 0.09, bd)); break
    bay = style.get('bay', 2.4)
    n_mid = max(1, int(round(span / bay)) - 1) if span > 3.0 else 0
    for i in range(1, n_mid + 1):
        uc = u0 + span * i / (n_mid + 1); ua, ub = uc - bw * 0.36, uc + bw * 0.36
        start = column_start(ua, ub)
        if top - start >= 1.4 and clear(ua, ub, start, top):
            columns.append((ua, ub, start, bd if start <= y0 + ph + 0.1 else bd * 0.45))
    for ua, ub, start, depth in columns:
        span_y = top - start
        steps = [start, start + span_y * 0.45, start + span_y * 0.78, top] if tall and depth == bd else [start, start + span_y * 0.6, top]
        for k in range(len(steps) - 1):
            d = depth * (1 - 0.38 * k); inset = 0.035 * k
            parts += block(plane, ua + inset, ub - inset, steps[k], steps[k + 1] - 0.13, 0.0, d)
            nxt = depth * (1 - 0.38 * (k + 1)) if k + 1 < len(steps) - 1 else 0.0
            parts += wedge(plane, ua + inset, ub - inset, steps[k + 1] - 0.13, steps[k + 1], nxt, d)
    # String courses: one in every horizontal band free of openings (floor lines between window rows),
    # else one broken course at the first-floor line.
    levels = []
    if height >= 2.4:
        edges = sorted([(r[2] - 0.16, r[3] + 0.18) for r in rects])
        cursor = y0 + ph + 0.5
        for a, b in edges + [(top - 0.2, top)]:
            if a - cursor >= 0.22 and cursor > y0 + 0.9:
                levels.append((cursor + a) / 2)
            cursor = max(cursor, b)
        levels = [y for y in levels if y < top - 0.3][:3] or [y0 + height * style.get('course', 0.40)]
    for yc in levels:
        segs = [(u0, u1)]
        for r in rects:
            if r[2] - 0.1 < yc < r[3] + 0.1:
                segs = [q for a, b in segs for q in ((a, min(b, r[0] - 0.14)), (max(a, r[1] + 0.14), b)) if q[1] - q[0] > 0.2]
        for a, b in segs:
            parts += block(plane, a, b, yc - 0.07, yc + 0.05, 0.0, 0.08)
            parts += wedge(plane, a, b, yc + 0.05, yc + 0.11, 0.0, 0.08)
    # Corbel table under the eaves of tall walls: deep band on stepped corbels.
    if tall:
        ct = y1 - 0.02
        parts += block(plane, u0, u1, ct - 0.20, ct, 0.0, 0.15)
        k = max(3, int(span / 0.52))
        for i in range(k):
            uc = u0 + (i + 0.5) * span / k
            parts += block(plane, uc - 0.075, uc + 0.075, ct - 0.36, ct - 0.20, 0.0, 0.12)
            parts += block(plane, uc - 0.06, uc + 0.06, ct - 0.50, ct - 0.36, 0.0, 0.07)
            parts += wedge(plane, uc - 0.06, uc + 0.06, ct - 0.60, ct - 0.50, 0.0, 0.07)
    # Surrounds, sills and hood moulds for glazed openings that have none; portal for bare doors.
    for ra, rb, ya, yb, kind in (rects if bare is None else bare):
        if kind == 'GlassAmber':
            parts += block(plane, ra - 0.10, rb + 0.10, ya - 0.12, ya - 0.02, -0.01, 0.10)
            parts += block(plane, ra - 0.09, ra, ya - 0.02, yb, -0.01, 0.06)
            parts += block(plane, rb, rb + 0.09, ya - 0.02, yb, -0.01, 0.06)
            parts += block(plane, ra - 0.13, rb + 0.13, yb, yb + 0.10, -0.01, 0.08)
            parts += wedge(plane, ra - 0.13, rb + 0.13, yb + 0.10, yb + 0.15, 0.0, 0.08)
        else:
            parts += block(plane, ra - 0.18, ra, ya, yb + 0.05, -0.01, 0.12)
            parts += block(plane, rb, rb + 0.18, ya, yb + 0.05, -0.01, 0.12)
            parts += block(plane, ra - 0.22, rb + 0.22, yb + 0.05, yb + 0.24, -0.01, 0.13)
            mid = (ra + rb) / 2
            parts += block(plane, mid - 0.10, mid + 0.10, yb + 0.02, yb + 0.32, 0.0, 0.17)
    return parts


STYLES = {
    'barracks': {'plinth': 0.22, 'bay': 2.4, 'course': 0.42},
    'townhall': {'plinth': 0.26, 'bay': 2.4, 'course': 0.42},
    'townhall-tier2': {'plinth': 0.28, 'bay': 2.4, 'course': 0.40},
    'townhall-tier3': {'plinth': 0.30, 'bay': 2.4, 'course': 0.38},
}
# Albedo multipliers so the brighter full-resolution sources keep each building material's established value.
FACTORS = {'DarkTimber': [0.50, 0.46, 0.43, 1], 'TimberEdge': [0.56, 0.52, 0.48, 1], 'LightCutStone': [0.96, 0.94, 0.90, 1],
           'Ironwork': [0.62, 0.62, 0.64, 1], 'WeatheredBrass': [0.74, 0.68, 0.58, 1]}


def structure_node(g):
    for n in g.json['nodes']:
        e = n.get('extras', {})
        if 'mesh' in n and e.get('rtsConstructionStage') == 1 and 'LightCutStone' in n.get('name', ''):
            return n
    raise KeyError('stage-1 LightCutStone node')


def retexture(g, record):
    for m in g.json.get('materials', []):
        kind = RETEXTURE.get(m['name'])
        if not kind:
            continue
        pbr = m.setdefault('pbrMetallicRoughness', {})
        before = {k: g.json['images'][g.json['textures'][v['index']]['source']].get('uri') for k, v in (('base', pbr.get('baseColorTexture')), ('mr', pbr.get('metallicRoughnessTexture')), ('normal', m.get('normalTexture'))) if v}
        pbr['baseColorTexture'] = {**pbr.get('baseColorTexture', {}), 'index': g.ensure_texture(TEX + kind + '-color.jpg')}
        pbr['metallicRoughnessTexture'] = {**pbr.get('metallicRoughnessTexture', {}), 'index': g.ensure_texture(TEX + kind + '-mr.png')}
        m['normalTexture'] = {**m.get('normalTexture', {'scale': 0.6}), 'index': g.ensure_texture(TEX + kind + '-normal.jpg')}
        if m['name'] in FACTORS:
            base = pbr.get('baseColorFactor', [1, 1, 1, 1])
            pbr['baseColorFactor'] = [round(x * y, 4) for x, y in zip(base, FACTORS[m['name']])]
        record.append({'material': m['name'], 'before': before, 'after': kind})


def apply(name):
    src = baseline_path(f'{name}.glb'); g = Glb(src)
    found, centre = planes(g)
    node = structure_node(g)
    trim_mat = g.json['meshes'][node['mesh']]['primitives'][0]['material']
    style = STYLES[name]; parts = []; faces = []
    for plane in found:
        rects = openings(g, plane)
        bare = [r for r in rects if not framed(g, plane, r)]
        ps = relief(plane, rects, style, bare)
        parts += ps
        faces.append({**{k: (round(v, 3) if isinstance(v, float) else v) for k, v in plane.items()}, 'openings': len(rects), 'new_surrounds': len(bare), 'relief_triangles': triangles(ps)})
    merged = merge(parts)['trim']
    mesh = g.json['meshes'][node['mesh']]
    before = sum(g.json['accessors'][p['indices']]['count'] // 3 for m in g.json['meshes'] for p in m['primitives'])
    # Merge the relief into the existing stage-1 LightCutStone primitive (same material, no extra draw call).
    prim = mesh['primitives'][0]; at = prim['attributes']
    old = {k: g.accessor(v) for k, v in at.items()}; oidx = g.accessor(prim['indices']).reshape(-1).astype(np.uint32)
    uvs = merged.uv * 0.25  # 1 texture tile per metre on dressed trim
    new = {'POSITION': merged.position, 'NORMAL': merged.normal, 'TEXCOORD_0': uvs}
    if 'TANGENT' in at:
        new['TANGENT'] = tangents(merged.position, merged.normal, uvs, merged.indices)
    extra = set(at) - set(new)
    if extra:
        raise ValueError(f'{name}: structure primitive needs {sorted(extra)}')
    kinds = {'POSITION': 'VEC3', 'NORMAL': 'VEC3', 'TEXCOORD_0': 'VEC2', 'TANGENT': 'VEC4'}
    prim['attributes'] = {k: g.add_accessor(np.vstack([old[k].astype(np.float32), new[k]]), kinds[k], minmax=(k == 'POSITION')) for k in at}
    idx = np.concatenate([oidx, merged.indices + len(old['POSITION'])])
    prim['indices'] = g.add_accessor(idx, 'SCALAR', component=5125 if idx.max() >= 65535 else 5123, target=34963)
    retex = []; retexture(g, retex)
    g.prune_materials()
    CANDIDATE.mkdir(parents=True, exist_ok=True); out = CANDIDATE / f'{name}.glb'; g.save(out)
    after = sum(g.json['accessors'][p['indices']]['count'] // 3 for m in g.json['meshes'] for p in m['primitives'])
    rec = {'model': name, 'baseline': str(src.relative_to(ROOT)).replace('\\', '/'), 'baseline_sha256': sha(src), 'candidate_sha256': sha(out),
           'bytes': out.stat().st_size, 'triangles_before': before, 'triangles_after': after, 'relief_node': node['name'],
           'materials': len(g.json['materials']), 'faces': faces, 'retextured': retex}
    (RUN / 'qa').mkdir(parents=True, exist_ok=True)
    (RUN / 'qa' / f'{name}-facade.json').write_text(json.dumps(rec, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(name, before, '->', after, 'faces', len(faces), [(f['axis'], f['sign'], f['coord'], f['openings']) for f in faces])
    return rec


if __name__ == '__main__':
    for n in sys.argv[1:] or list(STYLES):
        apply(n)
