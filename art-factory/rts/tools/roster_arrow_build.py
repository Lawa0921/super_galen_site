"""Original ranger arrow projectile (static, glTF tip toward -Z like bolt.glb), RTS-readable scale.

Blender: blender --background --factory-startup --python-exit-code 1 --python roster_arrow_build.py -- --run <run>
Then: python roster_arrow_build.py --pack --run <run>   (plain Python: detail-v1 packing)
"""
import json
import math
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
LENGTH, RADIUS = .80, .0115   # exaggerated like the published bolt so it reads in flight


def blender_main(run):
    import bpy
    from mathutils import Vector
    import procedural_gauntlet_build as g
    from commander_assembly_build import surface
    from human_units_build import material
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = {}
    for kind in ('oak', 'steel', 'brass'):
        m = surface(kind)
        m.name = 'AssemblyDetail_' + kind
        mats[m.name] = m
    mats['NeutralLinenFletching'] = material('NeutralLinenFletching', (.86, .82, .72), 0, .85)
    parts = []

    def along(name, mat, profile, seg=10):
        part = g.Part(name, mat)
        rings, centers = [], []
        for y, r in profile:
            c = Vector((0, y, 0))
            centers.append(c)
            rings.append(part.ring(c, Vector((1, 0, 0)), Vector((0, 0, 1)), r, r, seg))
        part.loft(rings, centers, repeat=.12)
        parts.append(part)
    half = LENGTH / 2
    along('arrow_shaft', 'AssemblyDetail_oak', [(-half + .01, RADIUS * .9), (0, RADIUS), (half - .10, RADIUS * .92)])
    along('arrow_nock', 'AssemblyDetail_brass', [(-half - .004, RADIUS * .55), (-half + .006, RADIUS * 1.05), (-half + .02, RADIUS)])
    head = g.Part('arrow_head', 'AssemblyDetail_steel')
    rings, centers = [], []
    for y, w, t in ((half - .11, RADIUS * 1.05, RADIUS * 1.05), (half - .075, RADIUS * 2.9, RADIUS * .7), (half - .03, RADIUS * 2.2, RADIUS * .5), (half, .0015, .0015)):
        c = Vector((0, y, 0))
        centers.append(c)
        rings.append(head.ring(c, Vector((1, 0, 0)), Vector((0, 0, 1)), w, t, 8, p=1.6))
    head.loft(rings, centers, repeat=.10)
    parts.append(head)
    for k in range(3):
        ang = math.radians(90 + 120 * k)
        radial = Vector((math.cos(ang), 0, math.sin(ang)))
        side = Vector((0, 1, 0)).cross(radial)
        vane = g.Part('fletch', 'NeutralLinenFletching')
        rings, centers = [], []
        for y, height in ((-half + .03, .004), (-half + .06, .030), (-half + .15, .026), (-half + .19, .004)):
            c = Vector((0, y, 0)) + radial * (RADIUS + height / 2)
            centers.append(c)
            rings.append(vane.ring(c, radial, side, height / 2, .0016, 6, p=4))
        vane.loft(rings, centers, repeat=.08)
        parts.append(vane)
    verts, faces, uvs, slot, names = [], [], [], [], []
    for p in parts:
        if p.material not in names:
            names.append(p.material)
        base = len(verts)
        verts += [tuple(v) for v in p.verts]
        for f, uv in zip(p.faces, p.uvs):
            faces.append(tuple(base + i for i in f))
            uvs.append(uv)
            slot.append(names.index(p.material))
    mesh = bpy.data.meshes.new('RangerArrowProjectileMesh')
    mesh.from_pydata(verts, [], faces)
    layer = mesh.uv_layers.new(name='UVMap')
    for poly, uv, mi in zip(mesh.polygons, uvs, slot):
        poly.material_index = mi
        poly.use_smooth = True
        for li, co in zip(poly.loop_indices, uv):
            layer.data[li].uv = co
    for n in names:
        mesh.materials.append(mats[n])
    obj = bpy.data.objects.new('RangerArrowProjectile', mesh)
    bpy.context.scene.collection.objects.link(obj)
    mesh.set_sharp_from_angle(angle=math.radians(55))
    # Blender +Y (tip) exports as glTF -Z, the published projectile forward axis.
    raw = run / 'raw'
    raw.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(raw / 'arrow.blend'))
    bpy.ops.export_scene.gltf(filepath=str(raw / 'arrow-edited.glb'), export_format='GLB', export_yup=True, export_tangents=True,
                              export_image_format='JPEG', export_jpeg_quality=90)
    print(json.dumps({'triangles': sum(len(p.vertices) - 2 for p in mesh.polygons)}))


def pack_main(run):
    import hashlib
    from roster_pack import package
    out = run / 'candidate/arrow.glb'
    out.parent.mkdir(parents=True, exist_ok=True)
    row = package(run / 'raw/arrow-edited.glb', out, None, None)
    (run / 'qa').mkdir(exist_ok=True)
    (run / 'qa/arrow-pack.json').write_text(json.dumps(row, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps({k: row[k] for k in ('bytes', 'triangles', 'sha256')}))


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    run = Path(argv[argv.index('--run') + 1]).resolve()
    (pack_main if '--pack' in argv else blender_main)(run)
