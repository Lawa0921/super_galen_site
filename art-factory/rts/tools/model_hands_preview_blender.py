"""Blender render of the canonical hand preview OBJ (see model_hands_preview.py). Eevee, 3 views, 640 px."""
import bpy, sys, math
from pathlib import Path
from mathutils import Vector
out = Path(sys.argv[sys.argv.index('--') + 1])
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
sc.render.resolution_x = sc.render.resolution_y = 640
world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.23, 0.25, 0.27, 1); world.node_tree.nodes['Background'].inputs[1].default_value = 0.8
for lod in (0, 1):
    for o in list(bpy.data.objects): bpy.data.objects.remove(o)
    bpy.ops.wm.obj_import(filepath=str(out / f'hand-lod{lod}.obj'), forward_axis='Y', up_axis='Z')
    colours = {'leather': (0.30, 0.17, 0.09), 'blade': (0.75, 0.77, 0.8), 'darksteel': (0.2, 0.21, 0.23), 'brass': (0.7, 0.5, 0.2), 'handle': (0.35, 0.25, 0.15)}
    for o in bpy.context.scene.objects:
        if o.type != 'MESH': continue
        key = next((k for k in colours if o.name.startswith(k)), 'handle')
        m = bpy.data.materials.new(key); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*colours[key], 1); b.inputs['Metallic'].default_value = 1.0 if key in ('blade', 'darksteel', 'brass') else 0
        b.inputs['Roughness'].default_value = 0.35 if key in ('blade', 'brass') else 0.7
        o.data.materials.clear(); o.data.materials.append(m)
        for poly in o.data.polygons: poly.use_smooth = True
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.5; sun.rotation_euler = (0.7, 0.2, 0.6); sc.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam; cam.data.lens = 85
    for name, d in (('back', (1, 0.15, 0.35)), ('thumb', (0.15, -0.35, 1)), ('palm', (-1, -0.4, 0.3)), ('front', (0.25, 1, 0.3))):
        v = Vector(d).normalized(); cam.location = v * 0.55
        cam.rotation_euler = (-v).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = str(out / f'lod{lod}-{name}.png'); bpy.ops.render.render(write_still=True)
