"""Level the eight original paving slabs; retain source geometry, UVs and materials."""
import bpy, hashlib, json, sys
from pathlib import Path
from mathutils import Vector
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).parent))
import buildings_v2_generate as architecture

ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/riverbank/2026-10-07-v1'
SOURCE=ROOT/'art-factory/rts/runs/kingdom-buildings/2026-10-04-v2/raw/stone-bridge.blend'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
def content(o):
    return {'vertices':[list(v.co) for v in o.data.vertices], 'faces':[list(p.vertices) for p in o.data.polygons],
            'uv':[[list(v.uv) for v in layer.data] for layer in o.data.uv_layers], 'materials':[m.name for m in o.data.materials]}
before={o.name:content(o) for o in objects}
paving=[o for o in objects if o.name.startswith('Cambered dressed road paving')]
assert len(paving)==8, f'Expected eight original paving objects, got {len(paving)}'
changes=[]
for o in paving:
    top=max((o.matrix_world@Vector(p)).z for p in o.bound_box)
    delta=2.715-top;o.location.z+=delta;changes.append({'object':o.name,'old_top':top,'new_top':2.715,'translation_z':delta})
# The source's Z-up vertical origin becomes the gameplay walk plane after export.
for o in objects:
    o.location.y*=1.4;o.scale.y*=1.4;o.location.z-=2.690
bpy.context.view_layer.update()
assert all(content(o)==before[o.name] for o in objects), 'Source vertices, faces, UVs or materials changed'
for o in paving:assert abs(max((o.matrix_world@Vector(p)).z for p in o.bound_box)-.025)<1e-5
rails=[o for o in objects if o.name.startswith(('Individual parapet limestone block','Continuous parapet coping'))]
inner_clearance=min(abs((o.matrix_world@Vector(p)).y) for o in rails for p in o.bound_box)
assert inner_clearance>=3, f'Parapets enter six-metre navigation corridor: half width {inner_clearance}'
for image in bpy.data.images:
    if image.has_data and image.source=='FILE':image.pack()
source_out=RUN/'raw/stone-bridge-level.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(source_out))
architecture.g.M={m.name:m for m in bpy.data.materials}
joined=architecture.join_by_material(objects)
for o in joined:
    bpy.context.view_layer.objects.active=o
    modifier=o.modifiers.new('Export-only tangent triangulation','TRIANGULATE')
    bpy.ops.object.modifier_apply(modifier=modifier.name)
bpy.ops.object.select_all(action='DESELECT')
for o in joined:o.select_set(True)
bpy.context.view_layer.objects.active=joined[0]
out=RUN/'candidate/stone-bridge-level.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_normals=True,export_tangents=True,export_texcoords=True,export_materials='EXPORT')
report={'source':str(SOURCE.relative_to(ROOT)),'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'source_objects':len(objects),'original_vertices_faces_uv_materials_preserved':True,'paving_changes':changes,
        'axis_conversion':'Blender Y width scaled 1.4; all Blender Z locations minus 2.690m; ground is gameplay walk plane',
        'paving_top_runtime_y':.025,'bedding_top_runtime_y':.005,'parapet_inner_clearance_m':inner_clearance*2,'materials':len(joined),
        'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in joined),
        'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'bytes':out.stat().st_size,'runtime_publish_allowed':False}
(RUN/'qa/bridge-authoring.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps(report))
