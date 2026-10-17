"""Original procedural building-rubble props for the generic RTS collapse.

Two seeded variants of a stone + timber + roof-slate debris pile on a packed
earth mound. No AI or third-party geometry: every piece is generated here.
Surfaces reuse the published shared building textures (detail-v1 + courtyard
earth); the GLB references them by relative URI so the runtime ModelLibrary
deduplicates the downloads with the building assets.

Authored footprint 4 m x 4 m (RUBBLE_AUTHORED_FOOTPRINT in building-collapse.ts),
origin at the footprint centre on the ground, about 1.3 m high.

Usage (Blender 5.2):
  blender --background --factory-startup --python-exit-code 1 --python building_rubble_build.py -- [--publish]
"""
import bpy
import bmesh
import hashlib
import json
import math
import random
import shutil
import struct
import sys
from pathlib import Path
from mathutils import Vector, Matrix, Euler

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / 'art-factory/rts/runs/building-rubble/2026-10-09-v1'
PUBLIC = ROOT / 'public/assets/games/rts'
PUBLISH_DIR = PUBLIC / 'models/props'
DETAIL = PUBLIC / 'materials/detail-v1'
EARTH = PUBLIC / 'terrain/dirt-road.png'
# URIs relative to public/assets/games/rts/models/props/<id>.glb
URI_DETAIL = '../../materials/detail-v1/'
URI_EARTH = '../../terrain/dirt-road.png'
TRI_BUDGET = 2500
FOOTPRINT = 4.0
VARIANTS = {
    # Stone-heavy collapse (keeps, towers, halls).
    'rubble-a': {'seed': 9031, 'blocks': 22, 'beams': 4, 'shards': 18, 'plates': 2, 'walls': 2, 'peak': 1.15},
    # Timber/roof-heavy collapse (houses, mills, stables).
    'rubble-b': {'seed': 4417, 'blocks': 14, 'beams': 7, 'shards': 24, 'plates': 3, 'walls': 1, 'peak': 1.0},
}
# Same material names as the building kit so the palette matches exactly.
SURFACES = {
    'IvoryLimestone': ('ashlar', .45, 1.1),
    'LightCutStone': ('cutstone', .45, .6),
    'DarkTimber': ('oak', .45, .9),
    'NavySlate': ('slate', .45, .7),
}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def image(path, non_color=False):
    img = bpy.data.images.load(str(path), check_existing=True)
    if non_color:
        img.colorspace_settings.name = 'Non-Color'
    return img


def make_material(name, surface, normal_strength):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    color = nt.nodes.new('ShaderNodeTexImage'); color.image = image(DETAIL / f'{surface}-color.jpg')
    mr = nt.nodes.new('ShaderNodeTexImage'); mr.image = image(DETAIL / f'{surface}-mr.png', True)
    nrm = nt.nodes.new('ShaderNodeTexImage'); nrm.image = image(DETAIL / f'{surface}-normal.png', True)
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nmap = nt.nodes.new('ShaderNodeNormalMap'); nmap.inputs['Strength'].default_value = normal_strength
    nt.links.new(color.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(mr.outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    nt.links.new(nrm.outputs['Color'], nmap.inputs['Color'])
    nt.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def earth_material():
    mat = bpy.data.materials.new('CourtyardCompactedEarth')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = image(EARTH)
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = .95
    bsdf.inputs['Metallic'].default_value = 0
    return mat


def box_uv(bm, uv_layer, tile, offset):
    """Per-face box projection in object space; `tile` metres per texture repeat."""
    for face in bm.faces:
        n = face.normal
        ax = max(range(3), key=lambda k: abs(n[k]))
        u_axis, v_axis = [(1, 2), (0, 2), (0, 1)][ax]
        for loop in face.loops:
            co = loop.vert.co
            loop[uv_layer].uv = (co[u_axis] / tile + offset[0], co[v_axis] / tile + offset[1])


def new_object(name, bm, material, tile, rng, location=(0, 0, 0), rotation=(0, 0, 0)):
    uv = bm.loops.layers.uv.verify()
    box_uv(bm, uv, tile, (rng.random(), rng.random()))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh); bm.free()
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    obj.rotation_euler = rotation
    bpy.context.scene.collection.objects.link(obj)
    return obj


def chunk(size, rng, jitter=.18, bevel=.035):
    """A chamfered, irregular block: 26 faces / 44 triangles."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        v.co += Vector((rng.uniform(-1, 1) * size[0], rng.uniform(-1, 1) * size[1], rng.uniform(-1, 1) * size[2])) * jitter * .5
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=1, affect='EDGES', profile=.5)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    return bm


def beam(length, width, rng):
    """Squared timber, one splintered end (extra cut ring with jagged tips)."""
    bm = bmesh.new()
    h = width / 2
    rings = []
    for x, jag in ((-length / 2, 0), (length / 2 - .18, 0), (length / 2, 1)):
        ring = []
        for (y, z) in ((-h, -h), (h, -h), (h, h), (-h, h)):
            dx = rng.uniform(-.16, .08) if jag else 0
            ring.append(bm.verts.new((x + dx, y * (1 - .25 * jag * rng.random()), z * (1 - .25 * jag * rng.random()))))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(4):
            bm.faces.new((a[i], a[(i + 1) % 4], b[(i + 1) % 4], b[i]))
    bm.faces.new(list(reversed(rings[0])))
    tip = bm.verts.new((length / 2 + rng.uniform(.04, .14), 0, 0))
    for i in range(4):
        bm.faces.new((rings[-1][i], rings[-1][(i + 1) % 4], tip))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return bm


def plate(sx, sy, thickness, rng, jag=.2, seg=3):
    """A broken flat fragment (roof sheet or slate): rectangular with one or two
    snapped, jagged edges, so it reads as roofing rather than a disc."""
    bm = bmesh.new()
    corners = [(-sx / 2, -sy / 2), (sx / 2, -sy / 2), (sx / 2, sy / 2), (-sx / 2, sy / 2)]
    broken = set(rng.sample(range(4), 2 if seg > 1 else 1))
    pts = []
    for e in range(4):
        (x0, y0), (x1, y1) = corners[e], corners[(e + 1) % 4]
        steps = seg if e in broken else 1
        for k in range(steps):
            t = k / steps
            x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            if e in broken and k:
                depth = rng.uniform(.15, 1) * jag
                x -= x * depth; y -= y * depth
            pts.append((x, y))
    top = [bm.verts.new((x, y, thickness / 2)) for x, y in pts]
    bot = [bm.verts.new((x, y, -thickness / 2)) for x, y in pts]
    bm.faces.new(top); bm.faces.new(list(reversed(bot)))
    n = len(pts)
    for i in range(n):
        bm.faces.new((bot[i], bot[(i + 1) % n], top[(i + 1) % n], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    return bm


def wall_stub(length, height, depth, rng):
    """A standing broken wall corner: stacked course with a jagged top line."""
    bm = bmesh.new()
    cols = 5
    xs = [-length / 2 + length * i / cols for i in range(cols + 1)]
    tops = [height * (.45 + .55 * rng.random()) for _ in xs]
    tops[0] = height * rng.uniform(.75, 1); tops[-1] = height * rng.uniform(.2, .5)
    front = [(bm.verts.new((x, -depth / 2, 0)), bm.verts.new((x, -depth / 2, t))) for x, t in zip(xs, tops)]
    back = [(bm.verts.new((x, depth / 2, 0)), bm.verts.new((x, depth / 2, t))) for x, t in zip(xs, tops)]
    for i in range(cols):
        (f0b, f0t), (f1b, f1t) = front[i], front[i + 1]
        (b0b, b0t), (b1b, b1t) = back[i], back[i + 1]
        bm.faces.new((f0b, f1b, f1t, f0t))
        bm.faces.new((b1b, b0b, b0t, b1t))
        bm.faces.new((f0t, f1t, b1t, b0t))
    bm.faces.new((front[0][0], front[0][1], back[0][1], back[0][0]))
    bm.faces.new((front[-1][1], front[-1][0], back[-1][0], back[-1][1]))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return bm


def mound(rng, peak):
    """Low packed-earth heap, slightly below grade at its rim to hide the seam."""
    bm = bmesh.new()
    rings, segs = 4, 16
    center = bm.verts.new((0, 0, peak * .32))
    prev = None
    first = []
    for r in range(1, rings + 1):
        t = r / rings
        ring = []
        for s in range(segs):
            a = s / segs * math.tau + rng.uniform(-.08, .08)
            rad = FOOTPRINT / 2 * 1.02 * t * (1 + rng.uniform(-.06, .05))
            z = peak * .32 * (1 - t * t) - .04 * t * t + rng.uniform(-.03, .03) * (1 - t)
            ring.append(bm.verts.new((math.cos(a) * rad, math.sin(a) * rad * .98, z)))
        if prev is None:
            for s in range(segs):
                bm.faces.new((center, ring[s], ring[(s + 1) % segs]))
        else:
            for s in range(segs):
                bm.faces.new((prev[s], ring[s], ring[(s + 1) % segs], prev[(s + 1) % segs]))
        prev = ring
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    return bm


def heap_height(x, y, peak):
    d = math.hypot(x / (FOOTPRINT / 2), y / (FOOTPRINT / 2))
    return max(0., peak * (1 - d * d) * .85)


def build_variant(name, spec, materials):
    rng = random.Random(spec['seed'])
    objects = [new_object(name + '-mound', mound(rng, spec['peak']), materials['CourtyardCompactedEarth'], 2.2, rng)]
    half = FOOTPRINT / 2 * .82
    # Standing broken wall corners along the footprint edge.
    for i in range(spec['walls']):
        side = rng.choice([-1, 1]); along = rng.uniform(-.6, .6)
        horizontal = i % 2 == 0
        loc = (along, side * half * .92, 0) if horizontal else (side * half * .92, along, 0)
        rot = (0, 0, 0 if horizontal else math.pi / 2)
        objects.append(new_object(f'{name}-wall{i}', wall_stub(rng.uniform(1.4, 2.1), rng.uniform(.9, 1.35), .32, rng), materials['LightCutStone'], .8, rng, loc, rot))
    # Ashlar blocks heaped toward the centre.
    for i in range(spec['blocks']):
        r = (rng.random() ** .7) * half; a = rng.uniform(0, math.tau)
        x, y = math.cos(a) * r, math.sin(a) * r
        size = (rng.uniform(.38, .62), rng.uniform(.26, .36), rng.uniform(.22, .3))
        z = heap_height(x, y, spec['peak']) * rng.uniform(.55, .95) + size[2] * .35
        rot = (rng.uniform(-.5, .5), rng.uniform(-.5, .5), rng.uniform(0, math.tau))
        mat = materials['IvoryLimestone'] if i % 3 else materials['LightCutStone']
        objects.append(new_object(f'{name}-block{i}', chunk(size, rng), mat, 1.1, rng, (x, y, z), rot))
    # Fallen and leaning roof timbers.
    for i in range(spec['beams']):
        length = rng.uniform(1.3, 2.5); a = rng.uniform(0, math.tau); r = rng.uniform(0, half * .55)
        x, y = math.cos(a) * r, math.sin(a) * r
        pitch = rng.uniform(.15, .55) * rng.choice([-1, 1])
        z = heap_height(x, y, spec['peak']) * .75 + .1
        objects.append(new_object(f'{name}-beam{i}', beam(length, rng.uniform(.13, .19), rng), materials['DarkTimber'], .9, rng, (x, y, z), (rng.uniform(-.2, .2), pitch, rng.uniform(0, math.tau))))
    # Collapsed roof sheets and scattered slates.
    for i in range(spec['plates']):
        a = rng.uniform(0, math.tau); r = rng.uniform(.2, half * .6)
        x, y = math.cos(a) * r, math.sin(a) * r
        z = heap_height(x, y, spec['peak']) * .8 + .05
        objects.append(new_object(f'{name}-roof{i}', plate(rng.uniform(.9, 1.4), rng.uniform(.7, 1.1), .06, rng, .25, 3), materials['NavySlate'], .7, rng, (x, y, z), (rng.uniform(-.45, .45), rng.uniform(-.45, .45), rng.uniform(0, math.tau))))
    for i in range(spec['shards']):
        r = rng.uniform(.3, 1.0) * FOOTPRINT / 2 * 1.02; a = rng.uniform(0, math.tau)
        x, y = math.cos(a) * r, math.sin(a) * r
        z = heap_height(x, y, spec['peak']) * .9 + .02
        objects.append(new_object(f'{name}-slate{i}', plate(rng.uniform(.22, .36), rng.uniform(.16, .26), .03, rng, .3, 1), materials['NavySlate'], .7, rng, (x, y, z), (rng.uniform(-.6, .6), rng.uniform(-.6, .6), rng.uniform(0, math.tau))))
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def tri_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def read_glb(path):
    b = Path(path).read_bytes(); size = struct.unpack_from('<I', b, 12)[0]
    return json.loads(b[20:20 + size]), b[28 + size:]


def write_glb(path, doc, binary):
    doc['buffers'] = [{'byteLength': len(binary)}]
    j = json.dumps(doc, separators=(',', ':'), ensure_ascii=True).encode(); j += b' ' * ((-len(j)) % 4)
    binary += b'\0' * ((-len(binary)) % 4)
    Path(path).write_bytes(struct.pack('<4sII', b'glTF', 2, 28 + len(j) + len(binary)) + struct.pack('<I4s', len(j), b'JSON') + j + struct.pack('<I4s', len(binary), b'BIN\0') + binary)


def relink_images(path):
    """Replace embedded copies with the published shared surfaces' runtime-relative URIs."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from detail_materials import repack_external_images
    doc, binary = read_glb(path)
    uris, matched = {}, {}
    for i, img in enumerate(doc.get('images', [])):
        ext = {'image/jpeg': '.jpg', 'image/png': '.png'}.get(img.get('mimeType'), '')
        name = Path(img.get('uri', img.get('name', ''))).stem.replace('%20', ' ')
        base = name + ext if not name.endswith(ext) else name
        source = EARTH if base == EARTH.name else DETAIL / base
        if not source.exists():
            raise ValueError('Unregistered image ' + json.dumps(img))
        if 'bufferView' in img:
            v = doc['bufferViews'][img['bufferView']]
            raw = binary[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
            matched[base] = raw == source.read_bytes()
        uris[i] = URI_EARTH if source == EARTH else URI_DETAIL + base
    doc, binary = repack_external_images(doc, binary, uris)
    doc.setdefault('asset', {})['extras'] = {'rtsProvenance': 'original procedural rubble, art-factory/rts/tools/building_rubble_build.py'}
    write_glb(path, doc, binary)
    return doc, matched


def render_preview(obj, path):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'; scene.cycles.samples = 24; scene.cycles.device = 'CPU'
    scene.render.resolution_x, scene.render.resolution_y = 720, 480
    world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.18, .2, .2, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.5
    sun.rotation_euler = Euler((math.radians(50), math.radians(10), math.radians(35))); scene.collection.objects.link(sun)
    ground_mesh = bpy.data.meshes.new('ground'); bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=6); bm.to_mesh(ground_mesh); bm.free()
    ground = bpy.data.objects.new('ground', ground_mesh); ground.location.z = -.01; scene.collection.objects.link(ground)
    gm = bpy.data.materials.new('g'); gm.use_nodes = True; gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.24, .3, .16, 1); ground_mesh.materials.append(gm)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam); scene.camera = cam
    # Same pitch family as the game camera (offset 24, 52, 35).
    direction = Vector((24, -35, 52)).normalized()
    cam.location = direction * 9.5; cam.data.type = 'ORTHO'; cam.data.ortho_scale = 6.4
    cam.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    for o in (sun, ground, cam):
        bpy.data.objects.remove(o)


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    publish = '--publish' in args
    for d in ('raw', 'candidate', 'qa'):
        (RUN / d).mkdir(parents=True, exist_ok=True)
    report = {'tool': 'art-factory/rts/tools/building_rubble_build.py', 'blender': bpy.app.version_string, 'footprint_m': FOOTPRINT,
              'tri_budget': TRI_BUDGET, 'textures': {}, 'variants': {}}
    for p in sorted(DETAIL.glob('*')) + [EARTH]:
        report['textures'][p.name] = sha(p)
    for name, spec in VARIANTS.items():
        reset()
        materials = {n: make_material(n, s, k) for n, (s, k, _) in SURFACES.items()}
        materials['CourtyardCompactedEarth'] = earth_material()
        obj = build_variant(name, spec, materials)
        tris = tri_count(obj)
        dims = [round(v, 3) for v in obj.dimensions]
        bpy.ops.wm.save_as_mainfile(filepath=str(RUN / 'raw' / f'{name}.blend'))
        out = RUN / 'candidate' / f'{name}.glb'
        bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                                  export_texcoords=True, export_normals=True, export_materials='EXPORT')
        doc, matched = relink_images(out)
        render_preview(obj, RUN / 'qa' / f'{name}-preview.png')
        mats = sorted(m['name'] for m in doc['materials'])
        uris = sorted(i['uri'] for i in doc['images'])
        has_uv = all('TEXCOORD_0' in p['attributes'] for m in doc['meshes'] for p in m['primitives'])
        ok = tris <= TRI_BUDGET and has_uv and dims[0] <= FOOTPRINT * 1.06 and dims[1] <= FOOTPRINT * 1.06 and 0.8 <= dims[2] <= 1.6
        report['variants'][name] = {'seed': spec['seed'], 'triangles': tris, 'dimensions_m_xyz_blender': dims, 'materials': mats,
                                    'image_uris': uris, 'embedded_bytes_identical_to_published': matched, 'uv': has_uv, 'bytes': out.stat().st_size, 'sha256': sha(out), 'pass': ok}
        print(name, json.dumps(report['variants'][name]))
        if not ok:
            raise SystemExit(f'QA failed for {name}')
        if publish:
            PUBLISH_DIR.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(out, PUBLISH_DIR / f'{name}.glb')
            report['variants'][name]['published'] = f'public/assets/games/rts/models/props/{name}.glb'
    (RUN / 'qa' / 'report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print('QA report', RUN / 'qa' / 'report.json')


if __name__ == '__main__':
    main()
