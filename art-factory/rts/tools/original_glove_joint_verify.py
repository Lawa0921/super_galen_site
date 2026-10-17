"""Static source fidelity and self-crossing checks for the actual remeshed GLB."""
import bpy,bmesh,hashlib,json,sys
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
from original_glove_deformation import crossings
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-glove-joints/2026-10-07-v1'
SOURCE=ROOT/'art-factory/rts/runs/original-glove-sculpt/2026-10-06-v1/candidate/sculpt.glb'
candidate=RUN/'candidate/joint-surface.glb'
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
landmarks=ROOT/'art-factory/rts/runs/original-glove-retopo/2026-10-07-v1/raw/source-landmarks.json'
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
raw=json.loads((RUN/'raw/joint-surface.json').read_text())
protected=[Vector(raw['vertices'][p['candidate_vertex']]) for p in raw['preserved_vertices']]
max_preservation=max(bvh.find_nearest(p)[3] for p in protected)
joints=sum(sum(r['is_joint'] for r in d['rings']) for d in raw['digits'].values())
tree=KDTree(len(points))
for i,p in enumerate(points):tree.insert(p,i)
tree.balance();mapping=[tree.find(Vector(p)) for p in raw['vertices']]
mapped=[row[1] for row in mapping];assert max(row[2] for row in mapping)<1e-6 and len(set(mapped))==len(mapped)==len(points)
face_set={tuple(sorted(face)) for face in faces};verified_bands=0
for digit in raw['digits'].values():
    rings=digit['rings']
    for index,ring in enumerate(rings):
        if not ring['is_joint']:continue
        assert 0<index<len(rings)-1
        for lower,upper in [(rings[index-1],ring),(ring,rings[index+1])]:
            a=[mapped[i] for i in lower['indices']];b=[mapped[i] for i in upper['indices']]
            assert len(a)==len(b)==12
            for j in range(12):
                quad=[a[j],a[(j+1)%12],b[(j+1)%12],b[j]]
                triangles=[tuple(sorted(quad[:k]+quad[k+1:])) for k in range(4)]
                actual=[triangle for triangle in triangles if triangle in face_set]
                assert len(actual)==2 and set().union(*map(set,actual))==set(quad),'Actual GLB is missing a joint strip quad'
        verified_bands+=1
report['tests'].update(protected_surface_preserved=max_preservation<1e-6,eight_three_ring_joint_bands=verified_bands==joints==8)
report.update(status='qa_failed',landmarks_sha256=hashlib.sha256(landmarks.read_bytes()).hexdigest(),protected_vertices=len(protected),protected_surface_max_distance=max_preservation,joint_rings=joints,static_geometry_pass=all(report['tests'].values()))
report['joint_band_validation']='Actual GLB has a bijective positional mapping and two triangles for every quad between each central joint ring and both 12-vertex support rings.'
(RUN/'qa/geometry.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report));assert report['static_geometry_pass']
