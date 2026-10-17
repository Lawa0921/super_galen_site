"""Source-driven original quad base; not yet a deformable production hand."""
import bpy,bmesh,hashlib,json,time
from pathlib import Path
from mathutils.bvhtree import BVHTree
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-glove-retopo/2026-10-07-v1'
SOURCE=ROOT/'art-factory/rts/runs/original-glove-sculpt/2026-10-06-v1/candidate/sculpt.glb'
EXPECTED='1c6e1129c1fa00c9839ace8fd3ef1fea233740b77814a22c9b4c266744ea60b0'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==EXPECTED
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(SOURCE))
objects=[o for o in bpy.context.scene.objects if o.type=='MESH'];assert len(objects)==1
obj=objects[0];bpy.context.view_layer.objects.active=obj;obj.select_set(True)
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table()
source_vertices=[v.co.copy() for v in bm.verts]
source_faces=[[v.index for v in f.verts] for f in bm.faces]
source_bvh=BVHTree.FromPolygons(source_vertices,source_faces)
source_edges=[(e.verts[0].co.copy(),e.verts[1].co.copy()) for e in bm.edges if e.is_boundary]
# Quadriflow accepts boundaries but rejects axis deltas below an absolute 1e-4.
# Normalize its working coordinates so valid tiny source edges survive that
# scale-dependent preflight; restore source units before any QA/export.
for vertex in bm.verts:vertex.co*=100
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
started=time.perf_counter()
result=bpy.ops.object.quadriflow_remesh(use_mesh_symmetry=False,use_preserve_sharp=False,use_preserve_boundary=True,preserve_attributes=False,smooth_normals=True,mode='FACES',target_faces=1500,seed=20261007)
assert 'FINISHED' in result
obj.name='OriginalSourceQuadBase_L';bm=bmesh.new();bm.from_mesh(obj.data)
for vertex in bm.verts:vertex.co/=100
def closest_wrist(point):
    options=[]
    for a,b in source_edges:
        delta=b-a;t=max(0.,min(1.,(point-a).dot(delta)/delta.length_squared));nearest=a+delta*t
        options.append(((nearest-point).length_squared,nearest))
    return min(options,key=lambda p:p[0])
unseen={v for v in bm.verts if v.is_boundary};boundary_records=[];wrist_count=0
while unseen:
    component=[];stack=[next(iter(unseen))]
    while stack:
        vertex=stack.pop()
        if vertex not in unseen:continue
        unseen.remove(vertex);component.append(vertex)
        stack.extend(e.other_vert(vertex) for e in vertex.link_edges if e.is_boundary)
    distance=max(closest_wrist(vertex.co)[0]**.5 for vertex in component)
    boundary_records.append({'vertices':len(component),'max_distance_to_original_wrist':distance,'center':list(sum((v.co for v in component),Vector())/len(component))})
    if distance<.05:
        wrist_count+=1
        for vertex in component:vertex.co=closest_wrist(vertex.co)[1]
    else:
        # Quadriflow may leave a small unrequested patch. Keep it at its source
        # region and close using a center projected onto the original surface.
        assert len(component)<=16,'large remesh hole requires explicit local retopology'
        center=sum((v.co for v in component),Vector())/len(component)
        hit=source_bvh.find_nearest(center);assert hit[3]<.08
        new=bm.verts.new(hit[0]);edges={e for v in component for e in v.link_edges if e.is_boundary}
        assert len(edges)==len(component)
        for edge in edges:bm.faces.new((edge.verts[0],edge.verts[1],new))
assert wrist_count==1
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data)
boundary=[e for e in bm.edges if e.is_boundary]
stats={'vertices':len(bm.verts),'faces':len(bm.faces),'triangles':sum(len(f.verts)-2 for f in bm.faces),'quads':sum(len(f.verts)==4 for f in bm.faces),'boundary_edges':len(boundary),'other_nonmanifold_edges':sum(not e.is_manifold and not e.is_boundary for e in bm.edges),'near_zero_faces':sum(f.calc_area()<1e-12 for f in bm.faces)};bm.free()
for face in obj.data.polygons:face.use_smooth=True
bpy.ops.wm.save_as_mainfile(filepath=str(RUN/'candidate/quad-base.blend'))
bpy.ops.export_scene.gltf(filepath=str(RUN/'candidate/quad-base.glb'),export_format='GLB',use_selection=True,export_animations=False,export_skins=False,export_materials='EXPORT',export_yup=True)
report={'source_sha256':EXPECTED,'method':'Blender Quadriflow on original source with preserved open wrist, working-coordinate normalization 100x then inverse. Classify boundary cycles by original wrist polyline distance; project wrist only, repair small unrequested patch against source.','boundary_cycles_before_repair':boundary_records,'working_scale':100,'requested_faces':1500,'seed':20261007,'seconds':time.perf_counter()-started,'stats':stats,'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [RUN/'candidate/quad-base.blend',RUN/'candidate/quad-base.glb']},'stage':'Static quad base only; local joint rings, wrist thickness and skinning still required.','runtime_publish_allowed':False}
(RUN/'qa/quad-base.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
