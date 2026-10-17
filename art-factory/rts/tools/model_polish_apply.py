"""Builds the polished weapon/shield candidates by splicing parametric originals into the published unit GLBs.

Usage: python art-factory/rts/tools/model_polish_apply.py [unit ...]
Reads public/assets/games/rts/models/<unit>(.glb|-lod1.glb) (the published baseline, hashes recorded), measures each old
rigid weapon (axis, grip centre, per-material spans), builds the new piece in that frame, binds it rigidly to the same
hand joint and writes candidate GLBs + qa/<unit>-apply.json under the model-polish run. Never writes public/.
"""
from pathlib import Path
import hashlib, json, sys
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from model_polish_glb import Glb  # noqa: E402
from model_polish_geometry import Frame, merge, triangles  # noqa: E402
import model_polish_weapons as W  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
MODELS = ROOT / 'public/assets/games/rts/models'
RUN = ROOT / 'art-factory/rts/runs/model-polish/2026-10-16-v1'
CANDIDATE = RUN / 'candidate/models'
TEX = '../materials/polish-v1/'

# Logical material -> glTF PBR material. Factors tune the generated albedo for both lighting setups (game sun +
# hemisphere without environment map; viewer studio with RoomEnvironment) so blades read as steel, not white.
MATERIALS = {
    'blade': ('PolishBladeSteel', 'blade-steel', [0.80, 0.82, 0.86, 1], 1.0, 1.0, 0.55),
    'darksteel': ('PolishDarkSteel', 'dark-steel', [1, 1, 1, 1], 1.0, 1.0, 0.7),
    'brass': ('PolishBrass', 'aged-brass', [0.74, 0.68, 0.58, 1], 1.0, 1.0, 0.6),
    'leather': ('PolishLeather', 'grip-leather', [1, 1, 1, 1], 0.0, 1.0, 0.8),
    'oak': ('PolishOak', 'shield-oak', [0.48, 0.42, 0.38, 1], 0.0, 1.0, 0.8),
}


def baseline_path(name):
    """The published bytes this run started from: the pre-stage snapshot once staging has replaced public/."""
    snap = RUN / 'raw/publication-before/models' / name
    return snap if snap.exists() else MODELS / name


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


from model_polish_textures import ATLAS_CELLS, ATLAS_PAD  # noqa: E402
from model_polish_geometry import Part  # noqa: E402


def equipment_material(g):
    clamp = {'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}
    m = {'name': 'PolishEquipment', 'pbrMetallicRoughness': {
        'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 1.0, 'roughnessFactor': 1.0,
        'baseColorTexture': {'index': g.ensure_texture(TEX + 'equipment-atlas-color.jpg', clamp)},
        'metallicRoughnessTexture': {'index': g.ensure_texture(TEX + 'equipment-atlas-mr.png', clamp)}},
        'normalTexture': {'index': g.ensure_texture(TEX + 'equipment-atlas-normal.jpg', clamp), 'scale': 0.6}}
    return g.ensure_material(m)


# Per-cell albedo tint baked as COLOR_0 would add an attribute; instead the atlas cells already carry final albedo,
# except steel/brass value tuning which is applied by scaling vertex-free: blade cell keeps its generated grey.
def to_atlas(parts):
    """Map each part's metric UVs into its material's atlas cell (uniform scale, padded) -> one merged 'equip' Part list."""
    out = []
    for p in parts:
        if p.material == 'team':
            out.append(p); continue
        _, (x0, y0, x1, y1) = ATLAS_CELLS[p.material]
        cw, ch = (x1 - x0) - 2 * ATLAS_PAD, (y1 - y0) - 2 * ATLAS_PAD
        uv = p.uv.astype(np.float64); lo = uv.min(0); rng = np.maximum(uv.max(0) - lo, 1e-6)
        # Keep the metric scale when it fits (no stretching); shrink uniformly when the surface is larger.
        density = min(1.0 / 4.0, cw / rng[0], ch / rng[1])  # <= one 0.25 m tile per quarter-cell
        mapped = (uv - lo) * density + [x0 + ATLAS_PAD, y0 + ATLAS_PAD]
        out.append(Part('equip', p.position, p.normal, mapped.astype(np.float32), p.indices))
    return out


def material_index(g, key, team_material=None):
    if key == 'team':
        names = [m['name'] for m in g.json['materials']]
        for want in (team_material, 'TeamCloth_Shield'):
            hits = [i for i, n in enumerate(names) if n == want or n.startswith(want + '.')]
            if hits:
                return hits[0]
        return next(i for i, n in enumerate(names) if 'TeamCloth' in n and 'Tabard' not in n and 'Masked' not in n)
    name, tex, factor, metal, rough, nscale = MATERIALS[key]
    m = {'name': name, 'pbrMetallicRoughness': {
        'baseColorFactor': factor, 'metallicFactor': metal, 'roughnessFactor': rough,
        'baseColorTexture': {'index': g.ensure_texture(TEX + tex + '-color.jpg')},
        'metallicRoughnessTexture': {'index': g.ensure_texture(TEX + tex + '-mr.png')}},
        'normalTexture': {'index': g.ensure_texture(TEX + tex + '-normal.jpg'), 'scale': nscale}}
    return g.ensure_material(m)


def node_named(g, name):
    return next(n for n in g.json['nodes'] if n.get('name') == name)


def mesh_name_of(g, node_name):
    return g.json['meshes'][node_named(g, node_name)['mesh']]['name']


def points_by_material(g, mesh):
    out = {}
    for p in g.json['meshes'][g.mesh_index(mesh)]['primitives']:
        name = g.json['materials'][p['material']]['name']
        idx = np.unique(g.accessor(p['indices']).reshape(-1))
        out.setdefault(name, []).append(g.accessor(p['attributes']['POSITION'])[idx].astype(np.float64))
    return {k: np.vstack(v) for k, v in out.items()}


def pick(pts, *names):
    found = [pts[n] for n in pts if any(n.startswith(x) or n == x for x in names)]
    assert found, (names, list(pts))
    return np.vstack(found)


def pca(points):
    c = points.mean(0); _, _, vt = np.linalg.svd(points - c, full_matrices=False)
    return c, vt


def local(points, frame):
    m = frame.matrix(); return (points - m[:3, 3]) @ m[:3, :3]


# ---------------------------------------------------------------------------------------------------------------------
# per weapon measurement -> (frame, params)


def measure_sword(pts, steel='steel', hilt='brass', grip='leather', style=None):
    allp = np.vstack(list(pts.values())); c, vt = pca(allp)
    blade_p, grip_p = pick(pts, *steel), pick(pts, *grip)
    axis = vt[0] * np.sign(np.dot(blade_p.mean(0) - grip_p.mean(0), vt[0]))
    _, bvt = pca(blade_p)
    xw = bvt[1] - axis * np.dot(bvt[1], axis)
    t = lambda p: (p - c) @ axis
    lmin, lmax = t(grip_p).min(), t(grip_p).max()
    origin = c + axis * (lmin + lmax) / 2
    origin = origin + (grip_p.mean(0) - origin) - axis * np.dot(grip_p.mean(0) - origin, axis)  # onto grip axis
    f = Frame(origin, xw, axis)
    L = {k: local(v, f) for k, v in pts.items()}
    bl, gl, hl = local(blade_p, f), local(grip_p, f), local(pick(pts, *hilt), f)
    p = dict(grip_length=float(gl[:, 1].max() - gl[:, 1].min()), grip_radius=float(np.abs(gl[:, [0, 2]]).max()) * 0.92,
             guard_y=float(gl[:, 1].max()) - 0.004, blade_start=float(bl[:, 1].min()), blade_length=float(bl[:, 1].max() - bl[:, 1].min()),
             half_width=float(np.abs(bl[:, 0]).max()) * 0.9, half_thickness=min(0.012, float(np.abs(bl[:, 2]).max()) * 0.75),
             guard_half_width=float(np.abs(hl[:, 0]).max()) * 0.9, pommel_length=float(gl[:, 1].min() - hl[:, 1].min()) * 0.95)
    p['pommel_radius'] = min(0.034, max(0.022, p['grip_radius'] * 1.7))
    p['guard_height'] = 0.026; p['guard_depth'] = 0.032; p['fuller_depth'] = p['half_thickness'] * 0.45
    p.update(style or {})
    return f, p


def measure_shield(pts, team='TeamCloth_Shield', grip='leather', style=None):
    allp = np.vstack(list(pts.values())); c, vt = pca(allp)
    team_p, grip_p = pick(pts, team), pick(pts, *grip)
    up, xw, n = vt[0], vt[1], vt[2]
    n = n * np.sign(np.dot(team_p.mean(0) - grip_p.mean(0), n))
    # Heater point = the narrower end of the long axis.
    tt = (allp - c) @ up; ww = np.abs((allp - c) @ xw)
    hi = ww[tt > np.percentile(tt, 80)].max(); lo = ww[tt < np.percentile(tt, 20)].max()
    if hi < lo:
        up = -up
    f0 = Frame(c, xw, up, n)
    L = local(allp, f0)
    mid = (L.min(0) + L.max(0)) / 2
    origin = c + f0.matrix()[:3, :3] @ np.array([mid[0], mid[1], local(team_p, f0)[:, 2].max()])
    f = Frame(origin, xw, up, n)
    L = local(allp, f); G = local(grip_p, f)
    p = dict(width=float(L[:, 0].max() - L[:, 0].min()) * 0.98, height=float(L[:, 1].max() - L[:, 1].min()) * 0.98,
             curvature=0.032, thickness=0.016, hand_center=(float(G[:, 0].mean()), float(G[:, 1].mean())),
             strap_half=float(max(0.05, (G[:, 0].max() - G[:, 0].min()) / 2 + 0.02)))
    p['strap_offsets'] = (float(G[:, 1].min() - p['hand_center'][1] + 0.02), float(G[:, 1].max() - p['hand_center'][1] - 0.02))
    p.update(style or {})
    return f, p


def measure_axe(pts, head='steel', haft='oak', grip='leather', toward='brass', style=None):
    allp = np.vstack(list(pts.values())); c, vt = pca(allp)
    grip_p = pick(pts, *grip)
    tgt = pick(pts, *toward) if toward else pick(pts, *head)
    axis = vt[0] * np.sign(np.dot(tgt.mean(0) - grip_p.mean(0), vt[0]))
    t = lambda q: (q - c) @ axis
    steel_p = pick(pts, *head)
    head_p = steel_p[t(steel_p) > np.percentile(t(allp), 55)]
    off = head_p.mean(0) - c; off -= axis * np.dot(off, axis)
    xw = off / np.linalg.norm(off)
    hp = pick(pts, *haft)
    origin = c + axis * (t(grip_p).min() + t(grip_p).max()) / 2
    f = Frame(origin, xw, axis)
    H, Gl, A, S = local(head_p, f), local(grip_p, f), local(hp, f), local(steel_p, f)
    shaft_r = float(np.percentile(np.hypot(A[:, 0], A[:, 2]), 90))
    head_mid, head_h = float((H[:, 1].min() + H[:, 1].max()) / 2), float(H[:, 1].max() - H[:, 1].min()) * 0.9
    p = dict(haft_start=float(min(A[:, 1].min(), S[:, 1].min())), haft_end=head_mid + head_h * 0.21,  # flush with the collar top
             haft_r0=shaft_r * 0.78, haft_r1=shaft_r * 0.86, head_y=float((H[:, 1].min() + H[:, 1].max()) / 2),
             bit_length=float(H[:, 0].max()) * 0.85, bit_height=float(H[:, 1].max() - H[:, 1].min()) * 0.9,
             eye_radius=shaft_r * 1.05, cheek=float(np.abs(H[:, 2]).max()) * 0.75, wrap=(float(Gl[:, 1].min()), float(Gl[:, 1].max())))
    p.update(style or {})
    return f, p


def measure_lance(pts, shaft='AshLanceShaft', head='ForgedLanceSteel', grip='DarkSaddleLeather', style=None):
    allp = np.vstack(list(pts.values())); c, vt = pca(allp)
    grip_p, head_p, shaft_p = pick(pts, grip), pick(pts, head), pick(pts, shaft)
    axis = vt[0] * np.sign(np.dot(head_p.mean(0) - grip_p.mean(0), vt[0]))
    x0 = vt[1] - axis * np.dot(vt[1], axis)
    t = lambda q: (q - c) @ axis
    origin = c + axis * (t(grip_p).min() + t(grip_p).max()) / 2
    origin = origin + (grip_p.mean(0) - origin) - axis * np.dot(grip_p.mean(0) - origin, axis)
    f = Frame(origin, x0, axis)
    S, Hd = local(shaft_p, f), local(head_p, f)
    r = np.hypot(S[:, 0], S[:, 2])
    p = dict(butt=float(S[:, 1].min()), head_base=float(Hd[:, 1].min()), r_butt=float(np.percentile(r, 95)) * 0.9,
             r_grip=float(np.percentile(r, 95)) * 0.78, r_tip=float(np.percentile(r, 95)) * 0.55, vamplate_y=0.11,
             vamplate_r=0.085, head_length=float(Hd[:, 1].max() - Hd[:, 1].min()) * 1.05,
             head_width=float(np.abs(Hd[:, 0]).max()) * 0.85, pennon=True)
    p.update(style or {})
    return f, p


BUILDERS = {'sword': (measure_sword, W.sword), 'shield': (measure_shield, W.shield), 'axe': (measure_axe, W.axe),
            'lance': (measure_lance, W.lance)}

UNITS = {
    'guard': [('KingdomSteelSword', 'sword', {}, {}), ('KingdomSunShield', 'shield', {}, {})],
    'commander': [('CommanderLongsword', 'sword', {'steel': ('CommanderDetail_steel',), 'hilt': ('CommanderDetail_brass',), 'grip': ('CommanderDetail_leather',)},
                   {'guard_material': 'brass', 'pommel_material': 'brass', 'ridges': 9}),
                  ('CommanderDawnShield', 'shield', {'grip': ('CommanderDetail_leather',)}, {'rays': 12, 'rivets': 12})],
    'knight': [('KnightLance', 'lance', {}, {}),
               ('KnightSunShield', 'shield', {'grip': ('WornLeather',)}, {})],
    'worker': [('WorkerCraftAxe', 'axe', {'head': ('AssemblyDetail_steel',), 'haft': ('AssemblyDetail_oak',), 'grip': ('AssemblyDetail_leather',), 'toward': ('AssemblyDetail_brass',)}, {})],
    'neutral-raider': [('RaiderShortAxe', 'axe', {'head': ('AssemblyDetail_steel',), 'haft': ('AssemblyDetail_oak',), 'grip': ('AssemblyDetail_leather',), 'toward': ('AssemblyDetail_steel',)}, {'dark_head': True})],
}
DEFAULT_KW = {'sword': {'steel': ('AssemblyDetail_steel',), 'hilt': ('AssemblyDetail_brass',), 'grip': ('AssemblyDetail_leather',)},
              'shield': {'grip': ('AssemblyDetail_leather',)}}
# Remap-only pieces: same geometry, materials moved onto the 1024 polish maps.
REMAP = {'crossbow': ['ProceduralCrossbow'], 'priest': ['PriestDawnStaff']}
REMAP_KEYS = {'AssemblyDetail_steel': 'blade', 'AssemblyDetail_brass': 'brass', 'AssemblyDetail_oak': 'oak',
              'AssemblyDetail_leather': 'leather'}


def hand_distance(g, node, positions):
    skin = g.json['skins'][node['skin']]; joint = g.rigid_joint(g.json['meshes'][node['mesh']]['name'])
    ibm = g.accessor(skin['inverseBindMatrices'])[joint].reshape(4, 4).T
    pivot = np.linalg.inv(ibm)[:3, 3]
    return float(np.linalg.norm(positions - pivot, axis=1).max()), joint


def apply_unit(unit, record):
    for lod, suffix in ((0, ''), (1, '-lod1')):
        src = baseline_path(f'{unit}{suffix}.glb')
        if not src.exists():
            continue
        g = Glb(src); rows = []
        frames = record.setdefault('frames', {})
        for base, kind, kw, style in UNITS.get(unit, []):
            node_name = f'{base}_LOD{lod}'
            node = node_named(g, node_name); mesh = mesh_name_of(g, node_name)
            pts = points_by_material(g, mesh)
            before = triangles_of(g, mesh)
            measure, build = BUILDERS[kind]
            args = dict(DEFAULT_KW.get(kind, {})); args.update(kw)
            if lod == 0 or base not in frames:
                frame, params = measure(pts, style=style, **args)
                frames[base] = (frame, params)
            frame, params = frames[base]  # LOD1 reuses the LOD0 frame so both LODs grip identically
            parts = [p.transformed(frame.matrix()) for p in to_atlas(build(params, 1 if lod == 0 else 0))]
            merged = merge(parts)
            old_reach, joint = hand_distance(g, node, np.vstack(list(pts.values())))
            new_pos = np.vstack([p.position for p in merged.values()])
            team = next((n for n in pts if 'TeamCloth' in n), 'TeamCloth_Shield')
            prims = [dict(material=equipment_material(g) if key == 'equip' else material_index(g, key, team), position=p.position, normal=p.normal, uv=p.uv, indices=p.indices)
                     for key, p in merged.items()]
            g.replace_mesh(mesh, prims, joint=joint)
            new_reach = float(np.linalg.norm(new_pos - (new_pos.mean(0) * 0 + np.linalg.inv(g.accessor(g.json['skins'][node['skin']]['inverseBindMatrices'])[joint].reshape(4, 4).T)[:3, 3]), axis=1).max())
            bounds = node.get('extras', {}).get('rtsConservativeBounds')
            if bounds and new_reach > old_reach:
                bounds['sphere_radius_m'] = float(bounds['sphere_radius_m'] + (new_reach - old_reach))
            rows.append({'node': node_name, 'mesh': mesh, 'kind': kind, 'joint_slot': joint, 'triangles_before': before,
                         'triangles_after': triangles(merged), 'materials_after': ['PolishEquipment' if k == 'equip' else team for k in merged],
                         'hand_reach_before_m': round(old_reach, 4), 'hand_reach_after_m': round(new_reach, 4),
                         'params': {k: (round(v, 4) if isinstance(v, float) else v) for k, v in params.items()}})
        for base in REMAP.get(unit, []):
            node_name = f'{base}_LOD{lod}'; mesh = mesh_name_of(g, node_name)
            for prim in g.json['meshes'][g.mesh_index(mesh)]['primitives']:
                old = g.json['materials'][prim['material']]['name']
                if old in REMAP_KEYS:
                    prim['material'] = material_index(g, REMAP_KEYS[old])
                    prim['attributes'].pop('TANGENT', None) if False else None
            rows.append({'node': node_name, 'mesh': mesh, 'kind': 'material-remap', 'triangles_before': triangles_of(g, mesh), 'triangles_after': triangles_of(g, mesh)})
        g.prune_materials()
        CANDIDATE.mkdir(parents=True, exist_ok=True)
        out = CANDIDATE / f'{unit}{suffix}.glb'; g.save(out)
        total = sum(triangles_of(g, m['name']) for m in g.json['meshes'])
        record.setdefault('files', []).append({'file': out.name, 'baseline': str(src.relative_to(ROOT)).replace('\\', '/'), 'baseline_sha256': sha(src),
                                               'candidate_sha256': sha(out), 'bytes': out.stat().st_size, 'triangles': total,
                                               'materials': len(g.json.get('materials', [])), 'pieces': rows})
    record.pop('frames', None)
    return record


def triangles_of(g, mesh):
    return sum(g.json['accessors'][p['indices']]['count'] // 3 for p in g.json['meshes'][g.mesh_index(mesh)]['primitives'])


if __name__ == '__main__':
    units = sys.argv[1:] or [*UNITS, *REMAP]
    (RUN / 'qa').mkdir(parents=True, exist_ok=True)
    for unit in units:
        rec = apply_unit(unit, {'unit': unit})
        (RUN / 'qa' / f'{unit}-apply.json').write_text(json.dumps(rec, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        for f in rec['files']:
            print(f['file'], f['triangles'], 'mats', f['materials'], [(p['node'], p['triangles_before'], p['triangles_after']) for p in f['pieces']])
