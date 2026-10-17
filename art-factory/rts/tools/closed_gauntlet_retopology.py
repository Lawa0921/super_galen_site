"""Whole-mesh source-guided retopology; never changes a runtime character."""
import bpy,bmesh,hashlib,json,sys,time
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(Path(__file__).parent))
from original_guard_quadri_repair_math import segment_triangle_intersection
SOURCE=ROOT/'art-factory/rts/runs/original-guard-grip-channel/2026-10-05/candidate/original-guard-grip-channel.blend'
RUN=ROOT/('art-factory/rts/runs/closed-gauntlet-retopology/2026-10-08-v2' if '--normalized' in sys.argv else 'art-factory/rts/runs/closed-gauntlet-retopology/2026-10-08-v1')
EXPECTED='314e914e04a8a6a095338afe1c6d558a7976639796ebc6c81a7dad71001f9628'

def main():
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==EXPECTED
    for d in ('raw','candidate','qa'):(RUN/d).mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    original=bpy.data.objects['OriginalGripChannelCandidate'];original.hide_set(False)
    mesh=original.data.copy();obj=bpy.data.objects.new('OriginalClosedGauntlet_Retopo',mesh);bpy.context.scene.collection.objects.link(obj)
    for ob in bpy.context.selected_objects:ob.select_set(False)
    obj.select_set(True);bpy.context.view_layer.objects.active=obj
    report={'source_sha256':EXPECTED,'source_object':original.name,'source_vertices':len(original.data.vertices),'runtime_publish_allowed':False,'status':'candidate'}
    # The old Boolean channel contains positive-area numerical slivers that
    # QuadriFlow rejects. Clean the entire copy at 0.1 micrometre tolerance;
    # the immutable source remains the projection target and evidence.
    bm=bmesh.new();bm.from_mesh(obj.data);before=(len(bm.verts),len(bm.faces))
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=1e-7)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    report['numerical_cleanup']={'tolerance_m':1e-7,'vertices_before':before[0],'faces_before':before[1],'vertices_after':len(bm.verts),'faces_after':len(bm.faces),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges)}
    bm.to_mesh(obj.data);bm.free();obj.data.update()
    if '--voxel' in sys.argv:
        # Alternate whole-volume method after two rejected direct remeshes.
        # A 1.2 mm grid is much smaller than the preserved 54.6 mm grip bore.
        voxel=obj.modifiers.new('WholeSourceVolumePrecondition','REMESH');voxel.mode='VOXEL';voxel.voxel_size=.0012;voxel.use_smooth_shade=True
        bpy.ops.object.modifier_apply(modifier=voxel.name)
        report['volume_precondition']={'voxel_m':.0012,'vertices':len(obj.data.vertices),'faces':len(obj.data.polygons)}
    working_scale=10000 if '--normalized' in sys.argv else 1
    if working_scale!=1:
        # QuadriFlow uses an absolute tolerance. Normalize only the working
        # copy, triangulate first, then clean newly exposed slivers. Restore
        # physical metres before source projection and all exported evidence.
        bm=bmesh.new();bm.from_mesh(obj.data)
        bmesh.ops.triangulate(bm,faces=list(bm.faces))
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
        bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=1e-6)
        bmesh.ops.triangulate(bm,faces=list(bm.faces))
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        preflight={'scale':working_scale,'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'zero_area_triangles':sum(f.calc_area()<=0 for f in bm.faces),'minimum_edge_m':min(e.calc_length() for e in bm.edges)}
        for vertex in bm.verts:vertex.co*=working_scale
        bm.to_mesh(obj.data);bm.free();obj.data.update()
        report['normalized_preflight']=preflight
        if preflight['nonmanifold_edges'] or preflight['zero_area_triangles']:
            report['status']='preflight_failed'
            (RUN/'qa/precondition.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
            raise RuntimeError('Retopology source fails triangle preflight')
    (RUN/'qa/precondition.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    start=time.monotonic()
    outcome=bpy.ops.object.quadriflow_remesh(use_mesh_symmetry=False,use_preserve_sharp=False,use_preserve_boundary=False,target_faces=1500,seed=9)
    if outcome!={'FINISHED'}:
        report['status']='retopology_failed';report['outcome']=sorted(outcome)
        (RUN/'qa/precondition.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
        raise RuntimeError('Whole-mesh retopology cancelled: '+str(outcome))
    for vertex in obj.data.vertices:vertex.co/=working_scale
    report['retopology_seconds']=time.monotonic()-start
    original.data.calc_loop_triangles();source_bvh=BVHTree.FromPolygons([v.co for v in original.data.vertices],[t.vertices for t in original.data.loop_triangles],all_triangles=True)
    # Project the complete cage once. This retains source sculpture instead of
    # replacing fingers with new primitive tubes.
    distances=[]
    for vertex in obj.data.vertices:
        nearest=source_bvh.find_nearest(vertex.co)
        if nearest[0] is None:raise RuntimeError('Missing source projection')
        distances.append(nearest[3]);vertex.co=nearest[0]
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
    bm=bmesh.new();bm.from_mesh(obj.data)
    report['topology']={'vertices':len(bm.verts),'triangles':len(bm.faces),'boundary_edges':sum(e.is_boundary for e in bm.edges),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'zero_area_faces':sum(f.calc_area()<1e-12 for f in bm.faces)};bm.free()
    vertices=np.asarray([v.co[:] for v in obj.data.vertices],dtype=np.float64);faces=[tuple(p.vertices) for p in obj.data.polygons]
    bvh=BVHTree.FromPolygons(vertices.tolist(),faces,all_triangles=True);crossings=[]
    for first,second in bvh.overlap(bvh):
        if first>=second or set(faces[first])&set(faces[second]):continue
        a,b=vertices[list(faces[first])],vertices[list(faces[second])]
        hits=[segment_triangle_intersection(source[i],source[(i+1)%3],target) for source,target in ((a,b),(b,a)) for i in range(3)]
        if any(hit and hit['kind']=='interior_crossing' for hit in hits):crossings.append([first,second])
    report['strict_self_intersections']=crossings
    report['source_projection_m']={'maximum_before':max(distances),'mean_before':sum(distances)/len(distances),'maximum_after':max(source_bvh.find_nearest(v.co)[3] for v in obj.data.vertices)}
    report['bounds']={'min':vertices.min(axis=0).tolist(),'max':vertices.max(axis=0).tolist()}
    topology=report['topology'];passed=not crossings and not any(topology[k] for k in ('boundary_edges','nonmanifold_edges','zero_area_faces'))
    report['status']='topology_candidate' if passed else 'qa_failed';report['pending']=['anatomy and bore silhouette','UV and material completion','wrist seam','whole-character grip and motion']
    for ob in bpy.data.objects:
        if ob!=obj:ob.hide_render=True
    obj.hide_render=False
    for polygon in obj.data.polygons:polygon.use_smooth=True
    path=RUN/'candidate/original-closed-gauntlet.blend';bpy.ops.wm.save_as_mainfile(filepath=str(path))
    report['candidate_sha256']=hashlib.sha256(path.read_bytes()).hexdigest()
    (RUN/'qa/retopology.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print('CLOSED_GAUNTLET_RETOPOLOGY',json.dumps({k:report[k] for k in ('status','topology','strict_self_intersections','source_projection_m','retopology_seconds')}))

if __name__=='__main__':main()
