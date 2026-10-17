"""Inspect the exported sculpt from seven views using immutable source framing."""
import bpy,bmesh,hashlib,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-glove-sculpt/2026-10-06-v1'
source=RUN/'candidate/sculpt.glb';qa=RUN/'qa';qa.mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];assert meshes
rows=[]
mat=bpy.data.materials.new('InspectionClay');mat.use_nodes=True
bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(.32,.36,.38,1);bsdf.inputs['Roughness'].default_value=.65
corners=[]
for obj in meshes:
    bm=bmesh.new();bm.from_mesh(obj.data)
    rows.append({'name':obj.name,'vertices':len(bm.verts),'triangles':sum(len(f.verts)-2 for f in bm.faces),'boundary_edges':sum(e.is_boundary for e in bm.edges),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'zero_area_faces':sum(f.calc_area()<1e-12 for f in bm.faces)})
    bm.free();obj.data.materials.clear();obj.data.materials.append(mat)
    for p in obj.data.polygons:p.use_smooth=True
    corners.extend(obj.matrix_world@Vector(p) for p in obj.bound_box)
minimum=Vector([min(p[i] for p in corners) for i in range(3)]);maximum=Vector([max(p[i] for p in corners) for i in range(3)])
baseline=json.loads((ROOT/'art-factory/rts/runs/original-glove-shape/2026-10-06-v1/qa/blender-inspection.json').read_text(encoding='utf-8'))
framing_min,framing_max=[Vector(p) for p in baseline['blender_bounds']]
center=(framing_min+framing_max)/2;span=max(framing_max-framing_min)
# Sculpt source was already saved by the builder; this tool writes QA only.
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.eevee.taa_render_samples=48
scene.render.resolution_x=900;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
world=bpy.data.worlds.new('ShapeReview');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.09,.13,.11,1);world.node_tree.nodes['Background'].inputs[1].default_value=.5;scene.world=world
for label,delta,power in [('Key',(-1,-1.4,1.6),350),('Fill',(1.5,.7,.8),200),('Rim',(-1,1.6,1.4),250)]:
    lamp=bpy.data.lights.new(label,'AREA');lamp.energy=power*span*span;lamp.shape='DISK';lamp.size=span*2
    obj=bpy.data.objects.new(label,lamp);scene.collection.objects.link(obj);obj.location=center+Vector(delta)*span;obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler()
camera=bpy.data.objects.new('ShapeReviewCamera',bpy.data.cameras.new('ShapeReviewCamera'));scene.collection.objects.link(camera);scene.camera=camera;camera.data.type='ORTHO';camera.data.ortho_scale=span*1.15
views={'negative-y':(0,-3,0),'positive-y':(0,3,0),'negative-x':(-3,0,0),'positive-x':(3,0,0),'negative-z':(0,0,-3),'positive-z':(0,0,3),'threequarter':(2,-3,1.4)}
for label,delta in views.items():
    camera.location=center+Vector(delta)*span;camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(qa/(label+'.png'));bpy.ops.render.render(write_still=True)
report={'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'meshes':rows,'blender_bounds':[list(minimum),list(maximum)],'framing_bounds':baseline['blender_bounds'],'views':list(views),'rendered_source_geometry_unchanged':True,'material':'QA clay only; no generated texture','rigged':False,'runtime_publish_allowed':False}
(qa/'blender-inspection.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
