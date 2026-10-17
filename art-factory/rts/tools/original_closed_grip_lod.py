"""Reduce the original closed sculpture directly; no remesh/projection repair loop."""
import bpy,bmesh,hashlib,json,sys
import numpy as np
from pathlib import Path
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(Path(__file__).parent))
from original_guard_quadri_repair_math import segment_triangle_intersection

SOURCE=ROOT/'art-factory/rts/runs/original-guard-grip-channel/2026-10-05/candidate/original-guard-grip-channel.blend'
EXPECTED='314e914e04a8a6a095338afe1c6d558a7976639796ebc6c81a7dad71001f9628'
PROTECTED='--protect-crossings' in sys.argv
RUN=ROOT/('art-factory/rts/runs/original-closed-grip-lod/2026-10-08-v2' if PROTECTED else 'art-factory/rts/runs/original-closed-grip-lod/2026-10-08-v1')


def protection_points():
    """Use rejected geometry only to locate failures; never reuse its surface."""
    prior=ROOT/'art-factory/rts/runs/original-closed-grip-lod/2026-10-08-v1'
    candidate=prior/'candidate/original-closed-grip-lods.blend'
    assert hashlib.sha256(candidate.read_bytes()).hexdigest()=='f585c015dedebd2f97b8b6ffc5c6613fa01a70703d536926c71a292c29311c6e'
    qa=json.loads((prior/'qa/reduction.json').read_text(encoding='utf-8'))
    with bpy.data.libraries.load(str(candidate),link=False) as (_,loaded):
        loaded.objects=['OriginalClosedGrip_LOD0','OriginalClosedGrip_LOD1']
    points=[]
    for lod,obj in enumerate(loaded.objects):
        vertices=np.asarray([v.co[:] for v in obj.data.vertices],dtype=np.float64)
        for first,second in qa['lods'][str(lod)]['strict_self_intersections']:
            a,b=(vertices[list(obj.data.polygons[i].vertices)] for i in (first,second))
            hits=[hit['point'] for p,q in ((a,b),(b,a)) for i in range(3)
                  for hit in [segment_triangle_intersection(p[i],p[(i+1)%3],q)]
                  if hit and hit['kind']=='interior_crossing']
            points.extend(hits)
            if len(hits)>1:
                start,end=np.asarray(hits[0]),np.asarray(hits[-1])
                count=max(2,int(np.linalg.norm(end-start)/.0005)+1)
                points.extend(np.linspace(start,end,count).tolist())
        bpy.data.objects.remove(obj,do_unlink=True)
    return np.asarray(points,dtype=np.float64)


def topology(obj,source_bvh):
    bm=bmesh.new();bm.from_mesh(obj.data)
    report={'vertices':len(bm.verts),'triangles':len(bm.faces),
        'boundary_edges':sum(e.is_boundary for e in bm.edges),
        'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),
        'zero_area_faces':sum(f.calc_area()<1e-12 for f in bm.faces)}
    bm.free()
    vertices=np.asarray([v.co[:] for v in obj.data.vertices],dtype=np.float64)
    faces=[tuple(p.vertices) for p in obj.data.polygons]
    assert all(len(face)==3 for face in faces)
    bvh=BVHTree.FromPolygons(vertices.tolist(),faces,all_triangles=True)
    crossings=[]
    for first,second in bvh.overlap(bvh):
        if first>=second or set(faces[first])&set(faces[second]):continue
        a,b=vertices[list(faces[first])],vertices[list(faces[second])]
        if any(hit and hit['kind']=='interior_crossing' for p,q in ((a,b),(b,a))
               for i in range(3) for hit in [segment_triangle_intersection(p[i],p[(i+1)%3],q)]):
            crossings.append([first,second])
    report['strict_self_intersections']=crossings
    distances=[source_bvh.find_nearest(vertex.co)[3] for vertex in obj.data.vertices]
    distances.extend(source_bvh.find_nearest(poly.center)[3] for poly in obj.data.polygons)
    report['source_deviation_m']={'max':max(distances),'mean':sum(distances)/len(distances),'samples':len(distances)}
    report['bounds']={'min':vertices.min(axis=0).tolist(),'max':vertices.max(axis=0).tolist()}
    report['passed']=not crossings and not any(report[k] for k in ('boundary_edges','nonmanifold_edges','zero_area_faces'))
    return report


def main():
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==EXPECTED
    for folder in ('raw','candidate','qa'):(RUN/folder).mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    original=bpy.data.objects['OriginalGripChannelCandidate']
    protected_points=protection_points() if PROTECTED else None
    original.data.calc_loop_triangles()
    source_bvh=BVHTree.FromPolygons([v.co for v in original.data.vertices],
        [t.vertices for t in original.data.loop_triangles],all_triangles=True)
    report={'source_sha256':EXPECTED,'method':'Direct source edge collapse without surface projection',
        'runtime_publish_allowed':False,'status':'candidate','lods':{},'files':{}}
    if PROTECTED:report['protection']={'method':'Lock original source vertices within 1.5 mm of measured rejected-LOD intersection segments','radius_m':.0015,'points':protected_points.tolist(),'source_mesh_reused':False}
    for lod,budget in ((0,5000),(1,2200)):
        obj=bpy.data.objects.new(f'OriginalClosedGrip_LOD{lod}',original.data.copy())
        bpy.context.scene.collection.objects.link(obj)
        for ob in bpy.context.selected_objects:ob.select_set(False)
        obj.select_set(True);bpy.context.view_layer.objects.active=obj
        # The Boolean bore contains micron-sized slivers. This removes only
        # numerical debris from the working copy; the original remains intact.
        bm=bmesh.new();bm.from_mesh(obj.data)
        bmesh.ops.triangulate(bm,faces=list(bm.faces))
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=2e-6)
        bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=2e-6)
        bmesh.ops.triangulate(bm,faces=list(bm.faces))
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(obj.data);bm.free();obj.data.update()
        modifier=obj.modifiers.new('SourcePreservingReduction','DECIMATE')
        modifier.decimate_type='COLLAPSE';modifier.ratio=budget/len(obj.data.polygons)
        modifier.use_collapse_triangulate=True
        protected_count=0
        if PROTECTED:
            positions=np.asarray([v.co[:] for v in obj.data.vertices],dtype=np.float64)
            locked=np.zeros(len(positions),dtype=bool)
            for point in protected_points:locked|=np.sum((positions-point)**2,axis=1)<=.0015**2
            protected_count=int(locked.sum())
            group=obj.vertex_groups.new(name='SourceContactProtection')
            group.add(np.flatnonzero(~locked).tolist(),1.0,'REPLACE')
            modifier.vertex_group=group.name;modifier.vertex_group_factor=1.0
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        bm=bmesh.new();bm.from_mesh(obj.data)
        bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(obj.data);bm.free();obj.data.update()
        for poly in obj.data.polygons:poly.use_smooth=True
        report['lods'][str(lod)]=topology(obj,source_bvh)
        report['lods'][str(lod)]['protected_source_vertices']=protected_count
        report['lods'][str(lod)]['triangle_budget']=budget
        report['lods'][str(lod)]['passed']&=len(obj.data.polygons)<=budget
        obj['source_sha256']=EXPECTED;obj['runtime_publish_allowed']=False
        obj['purpose']='Original equipped closed grip; rigid hand-bone module, not articulated fingers'
        for ob in bpy.data.objects:ob.hide_render=ob!=obj
        obj.hide_set(False);obj.hide_render=False
    report['status']='geometry_candidate' if all(lod['passed'] for lod in report['lods'].values()) else 'qa_failed'
    path=RUN/'candidate/original-closed-grip-lods.blend';bpy.ops.wm.save_as_mainfile(filepath=str(path))
    report['files'][str(path.relative_to(ROOT))]=hashlib.sha256(path.read_bytes()).hexdigest()
    report['pending']=['silhouette and bore review','UV and material','full-character equipment and wrist fit','complete action cycles']
    (RUN/'qa/reduction.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print('CLOSED_GRIP_REDUCTION',json.dumps({key:report[key] for key in ('status','lods','files','pending')}))
    if report['status']=='qa_failed':raise RuntimeError('Reduced source fails geometry QA; no runtime publication')


if __name__=='__main__':main()
