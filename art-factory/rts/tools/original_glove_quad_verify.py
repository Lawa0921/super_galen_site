"""Static source fidelity and self-crossing checks for the actual remeshed GLB."""
import bpy,bmesh,hashlib,json,sys
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
from original_glove_deformation import crossings
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-glove-retopo/2026-10-07-v1'
SOURCE=ROOT/'art-factory/rts/runs/original-glove-sculpt/2026-10-06-v1/candidate/sculpt.glb'
candidate=RUN/'candidate/quad-base.glb'
def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(path))
    obj=[o for o in bpy.context.scene.objects if o.type=='MESH'][0];bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    obj.data.calc_loop_triangles();points=[v.co.copy() for v in obj.data.vertices];faces=[tuple(t.vertices) for t in obj.data.loop_triangles]
    return obj,points,faces,BVHTree.FromPolygons(points,faces,all_triangles=True)
_,original,_,source_bvh=load(SOURCE)
obj,points,faces,bvh=load(candidate)
bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table();graph={v.index:{e.other_vert(v).index for e in v.link_edges} for v in bm.verts};boundary={v.index:{e.other_vert(v).index for e in v.link_edges if e.is_boundary} for v in bm.verts if v.is_boundary}
def count(graph):
    unseen=set(graph);n=0
    while unseen:
        n+=1;stack=[next(iter(unseen))]
        while stack:
            v=stack.pop()
            if v not in unseen:continue
            unseen.remove(v);stack.extend(graph[v])
    return n
bad=[]
for a,b in bvh.overlap(bvh):
    if a>=b or len(set(faces[a])&set(faces[b]))>=2:continue
    if crossings([points[v] for v in faces[a]],[points[v] for v in faces[b]]):bad.append([a,b])
tests={'one_connected_surface':count(graph)==1,'one_wrist_cycle':count(boundary)==1 and all(len(v)==2 for v in boundary.values()),'no_other_nonmanifold_edges':all(e.is_boundary or e.is_manifold for e in bm.edges),'consistent_winding':all(e.is_boundary or e.is_contiguous for e in bm.edges),'no_near_zero_faces':all(f.calc_area()>1e-12 for f in bm.faces),'no_nonadjacent_crossings':not bad,'triangle_budget':len(faces)<=4000,'disk_topology':len(bm.verts)-len(bm.edges)+len(bm.faces)==1}
# Region labels use source landmarks only, never the rejected grid topology or
# its animation. Keep this measurement input separate from historical QA.
landmarks=RUN/'raw/source-landmarks.json'
bone_data=json.loads(landmarks.read_text());origin=np.array(bone_data['origin']);scale=bone_data['scale']
assert bone_data['source_sha256']==hashlib.sha256(SOURCE.read_bytes()).hexdigest()
segments={name:[(np.array(b['head'])/scale+origin,np.array(b['tail'])/scale+origin) for b in bone_data['bones'] if b['name'].startswith(name)] for name in ['Index','Middle','Ring','Little','Thumb']}
def region(p):
    x,y,z=p
    if z<-.50:return 'wrist'
    if x>.12 and y<.03 and -.40<z<.10:return 'CMC'
    if z>.24 or (x>.2 and y<-.12 and z>.1):
        def distance(line):
            a,b=line;d=b-a;t=np.clip(np.dot(p-a,d)/np.dot(d,d),0,1);return np.linalg.norm(p-a-d*t)
        return min(segments,key=lambda name:min(distance(line) for line in segments[name]))
    return 'palm' if y<.08 else 'dorsal'
rows=[]
for label,query,target in [('source_to_quad',original,bvh),('quad_to_source',points,source_bvh)]:
    groups={}
    for point in query:
        distance=target.find_nearest(point)[3];groups.setdefault(region(np.array(point)),[]).append(distance)
    for name,values in groups.items():
        rows.append({'direction':label,'region':name,'vertices':len(values),'mean':float(np.mean(values)),'p95':float(np.quantile(values,.95)),'max':float(max(values))})
report={'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'candidate_sha256':hashlib.sha256(candidate.read_bytes()).hexdigest(),'tests':tests,'static_geometry_pass':all(tests.values()),'vertices':len(points),'triangles':len(faces),'boundary_edges':len(boundary),'crossings':len(bad),'first_crossing_pairs':bad[:20],'surface_distances':rows,'measurement_units':'source coordinates; multiply by .105 for intended hand meters. Vertex samples in both directions, not exhaustive Hausdorff distance. Regions are documented coordinate/nearest-bone partitions, not semantic segmentation.','stage':'Static base only. Joint loops, wrist thickness, weights, motion and commercial art remain unapproved.','runtime_publish_allowed':False}
report.update(status='qa_failed',landmarks_sha256=hashlib.sha256(landmarks.read_bytes()).hexdigest())
(RUN/'qa/quad-geometry.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report));assert report['static_geometry_pass']
