"""Bounded original-source finger atlas experiment. No runtime publication.

The authored region is a spatial finger band, not a claimed anatomical label.
Every open quad needs oriented ray pairs, local source connectivity and measured
interior samples. Unknown, thin and split/merge boundaries remain open.
"""
import bpy,collections,hashlib,json,math,sys
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.geometry import closest_point_on_tri
from mathutils.bvhtree import BVHTree

sys.path.insert(0,str(Path(__file__).parent))
from guard_hand_surface_chart import SOURCE,EXPECTED,ROOT,RUN,ray_layers
from grip_chart_cage_math import build_chart_shell,pair_verified_hits
from original_guard_tabard_blender import strict_self

POLICY={'branch':'finger-band-02','anatomical_name_confirmed':False,
    'angle_degrees':[67.5,97.5],'axis_world_z_bounds':[.122,.165],
    'authored_patch_axis_world_z':[.130,.158],
    'refinement_levels':[0,1,2],'minimum_normal_dot':.05,
    'minimum_radial_thickness_m':.00025,'maximum_bidirectional_deviation_m':.0005,
    'source_path_margin_m':.0004,'maximum_path_faces':2048,
    'boundary_policy':'open; no tip, wrist, gap or seam closure authorized',
    'runtime_publish_allowed':False}


def source_graph(triangles):
    count=len(triangles)
    edges=np.sort(np.concatenate((triangles[:,[0,1]],triangles[:,[1,2]],triangles[:,[2,0]])),axis=1)
    face_ids=np.tile(np.arange(count),3)
    order=np.lexsort((edges[:,1],edges[:,0]));edges=edges[order];face_ids=face_ids[order]
    same=np.all(edges[1:]==edges[:-1],axis=1);first=face_ids[:-1][same];second=face_ids[1:][same]
    neighbors=[[] for _ in range(count)]
    for a,b in zip(first.tolist(),second.tolist()):neighbors[a].append(b);neighbors[b].append(a)
    components=np.full(count,-1,dtype=np.int32);component=0
    for seed in range(count):
        if components[seed]>=0:continue
        components[seed]=component;stack=[seed]
        while stack:
            for face in neighbors[stack.pop()]:
                if components[face]<0:components[face]=component;stack.append(face)
        component+=1
    return neighbors,components,component


def main():
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==EXPECTED
    (RUN/'qa').mkdir(parents=True,exist_ok=True)
    (RUN/'qa/finger-patch-policy.json').write_text(json.dumps(POLICY,indent=2)+'\n',encoding='utf-8')
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    source=bpy.data.objects['OriginalGripChannelCandidate'];source.data.calc_loop_triangles()
    vertices=[source.matrix_world@v.co for v in source.data.vertices]
    triangles=np.asarray([t.vertices[:] for t in source.data.loop_triangles],dtype=np.int32)
    bvh=BVHTree.FromPolygons(vertices,triangles.tolist(),all_triangles=True)
    neighbors,components,component_count=source_graph(triangles)
    chart=json.loads((RUN/'raw/control-chart.json').read_text(encoding='utf-8'))
    origin,axis,across,around=(Vector(chart[k]) for k in ('origin','axis','across','around'))
    cache={};path_cache={}

    def trace(angle,z):
        key=(round(angle,12),round(z,12))
        if key in cache:return cache[key]
        t=(z-origin.z)/axis.z;direction=across*math.cos(angle)+around*math.sin(angle);point=origin+axis*t
        hits=ray_layers(bvh,point,direction,chart['radial_bound'])
        for hit in hits:
            hit['component']=int(components[hit['face']]);hit['position']=list(point+direction*hit['radius'])
        paired=pair_verified_hits(hits,min_normal=POLICY['minimum_normal_dot'],min_thickness=POLICY['minimum_radial_thickness_m'])
        reason=paired['reason'];selected=None
        if reason is None:
            if len(paired['pairs'])!=1:reason='missing_or_multiple_branches'
            elif not math.radians(67.5)<=angle<=math.radians(97.5):reason='outside_authored_angle_band'
            elif not .130<=z<=.158:reason='outside_authored_finger_band'
            else:
                pair=paired['pairs'][0]
                if pair['outer']['radius']>.055:reason='outside_authored_radial_band'
                else:selected={'t':t,'inner':pair['inner']['radius'],'outer':pair['outer']['radius'],
                    'branch':POLICY['branch'],'radial_intervals':1,'source_pair':pair}
        for hit in hits:hit['semantic_branch']=POLICY['branch'] if selected else None
        result={'angle':angle,'axis_world_z':z,'ray_hits':hits,'selected':selected,'reason':reason,'pair_reason':paired['reason']}
        cache[key]=result;return result

    def connected(hit_a,hit_b):
        pa,pb=Vector(hit_a['position']),Vector(hit_b['position']);mid=(pa+pb)/2
        radius=(pa-pb).length*.6+POLICY['source_path_margin_m']
        first,last=hit_a['face'],hit_b['face'];key=(first,last,tuple(round(v,7) for v in mid),round(radius,7))
        if key in path_cache:return path_cache[key]
        seen={first};stack=[first];passed=False
        while stack and len(seen)<=POLICY['maximum_path_faces']:
            face=stack.pop()
            if face==last:passed=True;break
            for neighbor in neighbors[face]:
                if neighbor in seen:continue
                seen.add(neighbor)
                p=closest_point_on_tri(mid,*(vertices[i] for i in triangles[neighbor]))
                if (p-mid).length<=radius:stack.append(neighbor)
        path_cache[key]=passed;return passed

    levels=[];final=None;final_samples=None;final_angles=None;final_z=None
    for level in POLICY['refinement_levels']:
        angle_values=np.linspace(math.radians(67.5),math.radians(97.5),4*2**level+1).tolist()
        z_values=np.linspace(.122,.165,22*2**level+1).tolist()
        samples=[[trace(a,z)['selected'] for z in z_values] for a in angle_values]
        verified_edges=[];verified_cells=[];edge_failures=collections.Counter()
        def edge(a,z,b,w):
            ends=[samples[a][z],samples[b][w]]
            if any(s is None for s in ends):return
            probes=[trace(angle_values[a]*(1-u)+angle_values[b]*u,z_values[z]*(1-u)+z_values[w]*u)['selected'] for u in (0,.25,.5,.75,1)]
            if any(s is None for s in probes):edge_failures['unresolved_midpoint']+=1;return
            for p,q in zip(probes,probes[1:]):
                for side in ('inner','outer'):
                    if not connected(p['source_pair'][side],q['source_pair'][side]):edge_failures['source_path_unproven']+=1;return
            verified_edges.append(((a,z),(b,w)))
        for a in range(len(samples)):
            for z in range(len(z_values)):
                if a+1<len(samples):edge(a,z,a+1,z)
                if z+1<len(z_values):edge(a,z,a,z+1)
        for a in range(len(samples)-1):
            for z in range(len(z_values)-1):
                corners=[samples[x][y] for x,y in ((a,z),(a+1,z),(a+1,z+1),(a,z+1))]
                if any(s is None for s in corners):continue
                if all(trace(angle_values[a]*(1-u)+angle_values[a+1]*u,z_values[z]*(1-v)+z_values[z+1]*v)['selected'] is not None
                       for u in (.25,.5,.75) for v in (.25,.5,.75)):
                    verified_cells.append((a,z))
        result=build_chart_shell(samples,verified_edges=verified_edges,verified_cells=verified_cells,angle_values=angle_values)
        levels.append({'level':level,'angles':len(angle_values),'rows':len(z_values),'selected_samples':sum(s is not None for column in samples for s in column),
            'quads':len(result['quads']),'cell_domain_components':result['cell_domain_components'],
            'mesh_components':result['mesh_components'],'boundary_loops':result['boundary_loops'],
            'unresolved_cells':len(result['unresolved_cells']),
            'edge_failures':dict(edge_failures),'negative_gap_selected_samples':sum(s is not None for column in samples for i,s in enumerate(column) if z_values[i]<.130 or z_values[i]>.158)})
        final,final_samples,final_angles,final_z=result,samples,angle_values,z_values
        print('PATCH_LEVEL',json.dumps(levels[-1]),flush=True)

    world=[origin+across*p[0]+around*p[1]+axis*p[2] for p in final['vertices']]
    mesh=bpy.data.meshes.new('Guard finger band 02 open cage');mesh.from_pydata(world,[],final['quads']);mesh.update();mesh.calc_loop_triangles()
    obj=bpy.data.objects.new('GuardFingerBand02_OpenPatch',mesh);bpy.context.collection.objects.link(obj)
    obj['runtime_publish_allowed']=False;obj['source_sha256']=EXPECTED;obj['boundary_policy']='open; incomplete authoring patch'
    faces=np.asarray([t.vertices[:] for t in mesh.loop_triangles],int);positions=np.asarray(world,float)
    crossings=strict_self(positions,faces)
    patch_to_source=[];flipped=[];degenerate=[]
    for i,face in enumerate(faces):
        points=[world[k] for k in face];normal=(points[1]-points[0]).cross(points[2]-points[0])
        center=sum(points,Vector())/3;nearest=bvh.find_nearest(center)
        if normal.length<1e-12:degenerate.append(i)
        elif normal.normalized().dot(nearest[1])<=0:flipped.append(i)
        for bary in ((1,0,0),(0,1,0),(0,0,1),(.5,.5,0),(0,.5,.5),(.5,0,.5),(1/3,1/3,1/3)):
            p=sum((point*w for point,w in zip(points,bary)),Vector());patch_to_source.append(bvh.find_nearest(p)[3])
    side_bvhs={side:BVHTree.FromPolygons(world,[quad for quad,info in zip(final['quads'],final['face_sources']) if info['surface']==side]) for side in ('inner','outer')}
    source_to_patch=[]
    for info in final['face_sources']:
        a,z,side=info['angle'],info['row'],info['surface']
        for u in (.125,.375,.625,.875):
            for v in (.125,.375,.625,.875):
                sample=trace(final_angles[a]*(1-u)+final_angles[a+1]*u,final_z[z]*(1-v)+final_z[z+1]*v)['selected']
                if sample is None:source_to_patch.append(float('inf'))
                else:source_to_patch.append(side_bvhs[side].find_nearest(Vector(sample['source_pair'][side]['position']))[3])
    incidence=collections.Counter(tuple(sorted((a,b))) for face in final['quads'] for a,b in zip(face,face[1:]+face[:1]))
    patch_bvh=BVHTree.FromPolygons(world,faces.tolist(),all_triangles=True)
    gap_rays=[]
    for target_z in (.125,.160):
        sample=min((r for r in cache.values() if abs(r['angle']-math.pi/2)<1e-7),key=lambda r:abs(r['axis_world_z']-target_z))
        t=(sample['axis_world_z']-origin.z)/axis.z
        gap_rays.append({'angle_degrees':90,'axis_world_z':sample['axis_world_z'],'source_hits':len(sample['ray_hits']),
            'patch_hit':patch_bvh.ray_cast(origin+axis*t,around,chart['radial_bound'])[0] is not None,
            'scope':'One source-empty ray through each adjacent gap; not whole-gap clearance approval'})
    reference=json.loads((RUN/'raw/surface-chart.json').read_text(encoding='utf-8'))
    thin=reference['charts'][22]['rows'][82]
    thin_trace=trace(reference['charts'][22]['angle_rad'],origin.z+thin['t']*axis.z)
    fixtures={'thin_source_ray':{'angle_index':22,'row':82,'axis_world_z':thin_trace['axis_world_z'],
        'hits':thin_trace['ray_hits'],'pair_reason':thin_trace['pair_reason'],'selected':thin_trace['selected'] is not None},
        'periodic_seam':'Topology unit fixture only; no real source seam connection authored or approved'}
    report={'status':'open_patch_experiment','runtime_publish_allowed':False,'source_sha256':EXPECTED,'policy':POLICY,
        'source_components':component_count,'levels':levels,'vertices':len(world),'quads':len(final['quads']),'triangles':len(faces),
        'boundary_edges':sum(n==1 for n in incidence.values()),'overused_edges':sum(n>2 for n in incidence.values()),
        'cell_domain_components':final['cell_domain_components'],'mesh_components':final['mesh_components'],
        'boundary_loops':final['boundary_loops'],'boundary_degree_errors':final['boundary_degree_errors'],
        'source_face_ownership_verified':False,'anatomical_branch_verified':False,'whole_hand_expansion_allowed':False,
        'strict_self_intersections':crossings,'degenerate_faces':degenerate,'flipped_faces':flipped,
        'patch_to_source_max_m':max(patch_to_source,default=float('inf')),'source_to_patch_max_m':max(source_to_patch,default=float('inf')),
        'unresolved_cells':final['unresolved_cells'],'ray_count':len(cache),'path_queries':len(path_cache),
        'measured_adjacent_gap_rays':gap_rays,'source_fixtures':fixtures,
        'limitations':['One spatial finger band only; no accepted anatomy, tip closure, wrist, UV, rig or complete hand',
            'Finite ray/face samples and local graph paths are evidence, not a proof of all unsampled source geometry',
            'Refinement counts recorded; branch-boundary convergence requires independent review',
            'Current branch is an authored spatial ROI label; source-face ownership and interior-probe branch continuity remain unverified',
            'Nearest-source measurements are global and cannot certify identity near another source surface']}
    report['local_geometry_passed']=bool(faces.size) and not crossings and not degenerate and not flipped and not report['overused_edges'] and max(report['patch_to_source_max_m'],report['source_to_patch_max_m'])<=POLICY['maximum_bidirectional_deviation_m'] and all(not g['source_hits'] and not g['patch_hit'] for g in gap_rays) and final['mesh_components']==2 and final['boundary_loops']==2 and not final['boundary_degree_errors']
    (RUN/'raw/finger-atlas.json').write_text(json.dumps({'policy':POLICY,'rays':list(cache.values()),'patch':final},indent=2)+'\n',encoding='utf-8')
    candidate=RUN/'candidate/finger-band-02-open-patch.blend'
    candidate.parent.mkdir(exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(candidate))
    report['candidate_sha256']=hashlib.sha256(candidate.read_bytes()).hexdigest()
    (RUN/'qa/finger-patch.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print('PATCH_QA',json.dumps({key:report[key] for key in ('local_geometry_passed','vertices','triangles','boundary_edges','patch_to_source_max_m','source_to_patch_max_m')}),flush=True)
    if not report['local_geometry_passed']:raise RuntimeError('Open patch failed local geometry QA; do not publish')


if __name__=='__main__':main()
