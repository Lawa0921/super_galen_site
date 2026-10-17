"""Import original source-contour topology into Blender and export actual GLB."""
import bpy,bmesh,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-glove-joints/2026-10-07-v1'
raw=RUN/'raw/joint-surface.json';data=json.loads(raw.read_text());bpy.ops.wm.read_factory_settings(use_empty=True)
mesh=bpy.data.meshes.new('OriginalSourceJointSurface');mesh.from_pydata(data['vertices'],[],data['faces']);mesh.update()
obj=bpy.data.objects.new('OriginalJointGlove_L',mesh);bpy.context.scene.collection.objects.link(obj);bpy.context.view_layer.objects.active=obj;obj.select_set(True)
bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
for face in mesh.polygons:face.use_smooth=True
mat=bpy.data.materials.new('InspectionClay');mat.use_nodes=True;shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.32,.36,.38,1);shader.inputs['Roughness'].default_value=.68;mesh.materials.append(mat)
bpy.ops.wm.save_as_mainfile(filepath=str(RUN/'candidate/joint-surface.blend'))
bpy.ops.export_scene.gltf(filepath=str(RUN/'candidate/joint-surface.glb'),export_format='GLB',use_selection=True,export_animations=False,export_skins=False,export_yup=True)
report={'status':'qa_failed','raw_sha256':hashlib.sha256(raw.read_bytes()).hexdigest(),'source_sha256':data['source_sha256'],'sculpt_sha256':data['sculpt_sha256'],'vertices':len(mesh.vertices),'triangles':sum(len(p.vertices)-2 for p in mesh.polygons),'bones':0,'animations':0,'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [RUN/'candidate/joint-surface.blend',RUN/'candidate/joint-surface.glb']},'stage':data['stage'],'runtime_publish_allowed':False}
(RUN/'qa/authoring.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
