"""Authored low-density control patch using frozen, reviewed source ownership."""
import bpy,collections,hashlib,json,math,sys
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.geometry import closest_point_on_tri
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
from guard_hand_surface_chart import ROOT,SOURCE,EXPECTED,RUN as MEASUREMENT,ray_layers
from guard_hand_face_ownership import RUN
from guard_hand_finger_patch import source_graph
from grip_chart_cage_math import build_chart_shell,pick_owned_pair
from original_guard_tabard_blender import strict_self

SELECTION_SHA='fbe8e9fcd616f253051958378c8b0fb2053ca5c370d80ebccf46a93791b057fc'
Z=[.1315,.134,.1367,.1397,.1427,.1457,.1487,.1517,.1545,.1565]
END=[89,94,96,97,97,97,96,95,92,88.5]
U=[0,.2,.4,.6,.8,1]
POLICY={'status':'authoring_candidate_not_runtime','patch_triangle_budget':216,
    'full_hand_allocation':{'four_fingers':2600,'palm':1000,'thumb':700,'wrist':500,'junctions':200},
    'maximum_owned_source_deviation_m':.0005,'minimum_normal_dot':.05,'minimum_thickness_m':.00025,
    'named_boundaries':['angle_start','angle_end','axial_low','axial_high'],
    'z_controls_m':Z,'angular_end_controls_degrees':END,'angular_start_degrees':67.5,'u_controls':U,
    'source_selection_sha256':SELECTION_SHA,'runtime_publish_allowed':False}


def main():
    global RUN,SELECTION_SHA,Z,END,POLICY
    adjacent='--adjacent' in sys.argv
    branch='finger-band-03' if adjacent else 'finger-band-02'
    if adjacent:
        RUN=ROOT/'art-factory/rts/runs/guard-right-hand-cage/2026-10-08-v3-adjacent'
        SELECTION_SHA='b1b1dff2616dd9ee0ae993d10eec55794e5c6f34ecb2824e02f08146d0ab64b3'
        Z=[.1675,.170,.1727,.1757,.1787,.1817,.1847,.1877,.190,.1915]
        POLICY={**POLICY,'z_controls_m':Z,'source_selection_sha256':SELECTION_SHA,'branch':branch}
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==EXPECTED
    selection_path=RUN/'raw/source-face-ownership.json'
    assert hashlib.sha256(selection_path.read_bytes()).hexdigest()==SELECTION_SHA
    review=json.loads((RUN/'qa/root-source-ownership-review.json').read_text(encoding='utf-8'))
    assert review['selection_sha256']==SELECTION_SHA and review['status']=='accepted_as_local_source_selection_only'
    selection=json.loads(selection_path.read_text(encoding='utf-8'));owners={side:set(ids) for side,ids in selection['faces'].items()}
    (RUN/'qa/control-cage-policy.json').write_text(json.dumps(POLICY,indent=2)+'\n',encoding='utf-8')
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));source=bpy.data.objects['OriginalGripChannelCandidate'];source.data.calc_loop_triangles()
    vertices=[source.matrix_world@v.co for v in source.data.vertices];triangles=np.asarray([t.vertices[:] for t in source.data.loop_triangles],dtype=np.int32)
    adjacency,components,_=source_graph(triangles)
    bvh=BVHTree.FromPolygons(vertices,triangles.tolist(),all_triangles=True)
    owned_bvhs={side:BVHTree.FromPolygons(vertices,[triangles[i].tolist() for i in sorted(ids)],all_triangles=True) for side,ids in owners.items()}
    frame=json.loads((MEASUREMENT/'raw/control-chart.json').read_text(encoding='utf-8'))
    origin,axis,across,around=(Vector(frame[k]) for k in ('origin','axis','across','around'))
    cache={};path_proofs=[]
    def trace(u,z):
        key=(round(u,12),round(z,12))
        if key in cache:return cache[key]
        end=float(np.interp(z,Z,END));theta=math.radians(67.5+(end-67.5)*u)
        t=(z-origin.z)/axis.z;direction=across*math.cos(theta)+around*math.sin(theta);point=origin+axis*t
        hits=ray_layers(bvh,point,direction,frame['radial_bound'])
        for hit in hits:
            hit['component']=int(components[hit['face']]);hit['position']=list(point+direction*hit['radius'])
        result=pick_owned_pair(hits,owners,min_normal=POLICY['minimum_normal_dot'],min_thickness=POLICY['minimum_thickness_m'])
        if result['pair'] is None:raise ValueError(f'Unowned authored control/probe u={u:.6f} z={z:.8f}: {result["reason"]}')
        pair=result['pair'];sample={'t':t,'theta':theta,'inner':pair['inner']['radius'],'outer':pair['outer']['radius'],
            'branch':branch,'radial_intervals':1,'source_pair':pair,'ray_hits':hits,'u':u,'axis_world_z':z}
        cache[key]=sample;return sample
    def path_owned(first,second,side):
        pa,pb=Vector(first['position']),Vector(second['position']);mid=(pa+pb)/2;radius=(pa-pb).length*.6+.0004
        start,goal=first['face'],second['face'];parent={start:None};stack=[start]
        while stack and len(parent)<=2048:
            face=stack.pop()
            if face==goal:
                path=[]
                while face is not None:path.append(face);face=parent[face]
                path_proofs.append({'side':side,'faces':path,'sphere_center':list(mid),'sphere_radius':radius});return True
            for neighbor in adjacency[face]:
                if neighbor in parent or neighbor not in owners[side]:continue
                p=closest_point_on_tri(mid,*(vertices[i] for i in triangles[neighbor]))
                if (p-mid).length<=radius:parent[neighbor]=face;stack.append(neighbor)
        return False
    def continuity(a,b):
        for side in ('inner','outer'):
            if not path_owned(a['source_pair'][side],b['source_pair'][side],side):raise ValueError('Authored patch leaves local source-face ownership')
    samples=[[trace(u,z) for z in Z] for u in U];edges=[];cells=[]
    for a,u in enumerate(U):
        for z,height in enumerate(Z):
            for b,w in ((a+1,z),(a,z+1)):
                if b>=len(U) or w>=len(Z):continue
                probes=[trace(u*(1-f)+U[b]*f,height*(1-f)+Z[w]*f) for f in (0,.25,.5,.75,1)]
                for p,q in zip(probes,probes[1:]):continuity(p,q)
                edges.append(((a,z),(b,w)))
    for a in range(len(U)-1):
        for z in range(len(Z)-1):
            for u in (.25,.5,.75):
                for v in (.25,.5,.75):
                    probe=trace(U[a]*(1-u)+U[a+1]*u,Z[z]*(1-v)+Z[z+1]*v)
                    corner=samples[a+int(u>=.5)][z+int(v>=.5)];continuity(corner,probe)
            cells.append((a,z))
    cage=build_chart_shell(samples,verified_edges=edges,verified_cells=cells,angle_values=[math.radians(67.5+22*u) for u in U])
    world=[origin+across*p[0]+around*p[1]+axis*p[2] for p in cage['vertices']]
    mesh=bpy.data.meshes.new('Owned original finger control cage');mesh.from_pydata(world,[],cage['quads']);mesh.update();mesh.calc_loop_triangles()
    obj=bpy.data.objects.new('GuardFingerBand03_OpenPatch' if adjacent else 'GuardFingerBand02_OpenPatch',mesh);bpy.context.collection.objects.link(obj)
    obj['source_sha256']=EXPECTED;obj['source_selection_sha256']=SELECTION_SHA;obj['runtime_publish_allowed']=False;obj['branch']=branch
    for side in (0,1):
        for name,indices in {'angle_start':[i for i,(a,z,s) in enumerate(cage['grid_keys']) if s==side and a==0],
            'angle_end':[i for i,(a,z,s) in enumerate(cage['grid_keys']) if s==side and a==len(U)-1],
            'axial_low':[i for i,(a,z,s) in enumerate(cage['grid_keys']) if s==side and z==0],
            'axial_high':[i for i,(a,z,s) in enumerate(cage['grid_keys']) if s==side and z==len(Z)-1]}.items():
            obj.vertex_groups.new(name=('outer_' if side else 'inner_')+name).add(indices,1,'REPLACE')
    faces=np.asarray([t.vertices[:] for t in mesh.loop_triangles],int);crossings=strict_self(np.asarray(world,float),faces)
    deviation=[];flipped=[];degenerate=[]
    for i,tri in enumerate(mesh.loop_triangles):
        side=cage['face_sources'][tri.polygon_index]['surface'];points=[world[k] for k in tri.vertices]
        normal=(points[1]-points[0]).cross(points[2]-points[0]);center=sum(points,Vector())/3
        nearest=owned_bvhs[side].find_nearest(center)
        if normal.length<1e-12:degenerate.append(i)
        elif normal.normalized().dot(nearest[1])<=0:flipped.append(i)
        for bary in ((1,0,0),(0,1,0),(0,0,1),(.5,.5,0),(0,.5,.5),(.5,0,.5),(1/3,1/3,1/3)):
            p=sum((point*w for point,w in zip(points,bary)),Vector());deviation.append(owned_bvhs[side].find_nearest(p)[3])
    patch_bvhs={side:BVHTree.FromPolygons(world,[quad for quad,info in zip(cage['quads'],cage['face_sources']) if info['surface']==side]) for side in ('inner','outer')}
    reverse=[]
    for info in cage['face_sources']:
        a,z,side=info['angle'],info['row'],info['surface']
        for u in (.125,.375,.625,.875):
            for v in (.125,.375,.625,.875):
                source_point=trace(U[a]*(1-u)+U[a+1]*u,Z[z]*(1-v)+Z[z+1]*v)['source_pair'][side]['position']
                reverse.append(patch_bvhs[side].find_nearest(Vector(source_point))[3])
    named_edges=[];unclassified=[]
    incidence=collections.Counter(tuple(sorted((a,b))) for quad in cage['quads'] for a,b in zip(quad,quad[1:]+quad[:1]))
    for (i,j),count in incidence.items():
        if count!=1:continue
        a,z,side=cage['grid_keys'][i];b,w,_=cage['grid_keys'][j]
        name='angle_start' if a==b==0 else 'angle_end' if a==b==len(U)-1 else 'axial_low' if z==w==0 else 'axial_high' if z==w==len(Z)-1 else None
        if name:named_edges.append({'vertices':[i,j],'boundary':('outer_' if side else 'inner_')+name})
        else:unclassified.append([i,j])
    all_patch_bvh=BVHTree.FromPolygons(world,faces.tolist(),all_triangles=True)
    gap_rays=[]
    for z in ((.16011363636363637,.196946) if adjacent else (.12493181818181819,.16011363636363637)):
        point=origin+axis*((z-origin.z)/axis.z)
        gap_rays.append({'angle_degrees':90,'axis_world_z':z,
            'source_hit':bvh.ray_cast(point,around,frame['radial_bound'])[0] is not None,
            'cage_hit':all_patch_bvh.ray_cast(point,around,frame['radial_bound'])[0] is not None,
            'scope':'Two pointwise source-air probes only; not full neighboring-finger clearance'})
    report={'status':'candidate_control_patch','branch':branch,'runtime_publish_allowed':False,'whole_hand_expansion_allowed':False,
        'source_sha256':EXPECTED,'selection_sha256':SELECTION_SHA,'policy':POLICY,
        'vertices':len(world),'quads':len(cage['quads']),'triangles':len(faces),
        'mesh_components':cage['mesh_components'],'boundary_loops':cage['boundary_loops'],'boundary_degree_errors':cage['boundary_degree_errors'],
        'named_boundary_edges':named_edges,'unclassified_boundary_edges':unclassified,'owned_path_proofs':len(path_proofs),'owned_ray_samples':len(cache),
        'measured_adjacent_gap_rays':gap_rays,
        'strict_crossings':crossings,'flipped_faces':flipped,'degenerate_faces':degenerate,
        'cage_to_owned_source_max_m':max(deviation),'owned_source_to_cage_max_m':max(reverse),
        'source_face_ownership_verified':True,'interior_probes_owned_and_connected':True,
        'pending':['Silhouette and named boundary review','Adjacent finger/negative-space experiment','Corrected whole-hand anatomy','UV/material/rig/full actions']}
    report['geometry_passed']=not crossings and not flipped and not degenerate and not unclassified and cage['mesh_components']==2 and cage['boundary_loops']==2 and not cage['boundary_degree_errors'] and len(faces)<=POLICY['patch_triangle_budget'] and max(max(deviation),max(reverse))<=POLICY['maximum_owned_source_deviation_m'] and all(not g['source_hit'] and not g['cage_hit'] for g in gap_rays)
    report['status']='candidate_geometry_passed' if report['geometry_passed'] else 'qa_failed'
    (RUN/'raw/owned-cage-provenance.json').write_text(json.dumps({'selection_sha256':SELECTION_SHA,'rays':list(cache.values()),'paths':path_proofs,'cage':cage},indent=2)+'\n',encoding='utf-8')
    (RUN/'candidate').mkdir(exist_ok=True);candidate=RUN/'candidate'/f'{branch}-control-cage.blend';bpy.ops.wm.save_as_mainfile(filepath=str(candidate))
    report['candidate_sha256']=hashlib.sha256(candidate.read_bytes()).hexdigest()
    (RUN/'qa/owned-control-cage.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print('OWNED_CONTROL_CAGE',json.dumps({k:report[k] for k in ('status','triangles','cage_to_owned_source_max_m','owned_source_to_cage_max_m','owned_path_proofs','owned_ray_samples')}),flush=True)
    if not report['geometry_passed']:raise RuntimeError('Authored control cage failed geometry QA; no publication')


if __name__=='__main__':main()
