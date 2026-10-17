"""Refit only the original textured distal sleeves to a verified glove cross-section.

No mesh replacement, primitive cover, new bind bone or external motion input.
The existing source topology, UVs, textures and weights are retained.
"""
import bpy,heapq,json,math,sys
from pathlib import Path
from mathutils import Matrix,Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_interface_probe import ready,evaluated,winding,SOURCE,RUN

def smooth(x):
    x=max(0,min(1,x));return x*x*(3-2*x)

def geodesic(mesh,points,seeds,limit):
    neighbors=[[] for _ in points]
    for edge in mesh.edges:
        i,j=edge.vertices;distance=(points[i]-points[j]).length
        neighbors[i].append((j,distance));neighbors[j].append((i,distance))
    result={i:0. for i in seeds};queue=[(0.,i) for i in seeds];heapq.heapify(queue)
    while queue:
        d,i=heapq.heappop(queue)
        if d>result[i]:continue
        for j,length in neighbors[i]:
            candidate=d+length
            if candidate<limit and candidate<result.get(j,float('inf')):
                result[j]=candidate;heapq.heappush(queue,(candidate,j))
    return result

def skin_matrix(obj,rig,vertex):
    m=Matrix(((0.,)*4,)*4)
    for group in vertex.groups:
        name=obj.vertex_groups[group.group].name
        if name not in rig.pose.bones:continue
        skin=rig.pose.bones[name].matrix@rig.data.bones[name].matrix_local.inverted()
        for i in range(4):
            for j in range(4):m[i][j]+=skin[i][j]*group.weight
    return m

def main():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['crossbowRig20'];_,reference=ready(rig)
    records={}
    for side in ('R','L'):
        hp,ht,_=evaluated(bpy.data.objects['OriginalCrossbowClosedGrip_'+side])
        glove=BVHTree.FromPolygons(hp,ht,all_triangles=True)
        hand=rig.pose.bones['Hand_'+side];fore=rig.pose.bones['Forearm_'+side]
        axis=(fore.head-fore.tail).normalized();u=axis.cross(Vector((0,0,1))).normalized();v=axis.cross(u).normalized()
        center=hand.head+axis*.003
        assert abs(winding(center,hp,ht))>.9,'Wrist origin must be inside the actual glove'
        for _ in range(2):
            for direction in (u,v):
                a=glove.ray_cast(center,direction,.1)[3];b=glove.ray_cast(center,-direction,.1)[3]
                if a is None or b is None:raise AssertionError('Open glove section')
                center+=direction*(a-b)*.5
        radius=min(glove.ray_cast(center,u*math.cos(i*math.tau/64)+v*math.sin(i*math.tau/64),.1)[3] for i in range(64))*.72
        assert radius>.006 and abs(winding(center,hp,ht))>.9,(side,radius)
        records[side]={'center_world':list(center),'cap_radius_m':radius,'bodies':{}}
        for lod in (0,1):
            body=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];points,_,_=evaluated(body)
            assert len(points)==len(body.data.vertices)
            tree=KDTree(len(body.data.vertices))
            for vertex in body.data.vertices:tree.insert(vertex.co,vertex.index)
            tree.balance()
            seeds=set()
            for point in reference['wrist_reference_alignment'][side]['terminal_rest_points'][body.name]:
                _,index,d=tree.find(Vector(point));assert d<.000001;seeds.add(index)
            distances=geodesic(body.data,points,seeds,.125)
            changes=[]
            for index,d in distances.items():
                vertex=body.data.vertices[index];p=points[index];relative=p-center
                radial=relative-axis*relative.dot(axis)
                if radial.length<1e-7:continue
                direction=radial.normalized()
                target_radius=min(radial.length,radius+.024*smooth(d/.080))
                target=center+axis*(d*.88)+direction*target_radius
                blend=1-smooth(d/.125)
                final=p.lerp(target,blend)
                old=vertex.co.copy();vertex.co=skin_matrix(body,rig,vertex).inverted()@final
                changes.append({'index':index,'distance_from_rim_m':d,'rest_delta_m':(vertex.co-old).length})
            body.data.update()
            records[side]['bodies'][body.name]={'changed_vertices':len(changes),'changes':changes,'terminal_indices':sorted(seeds)}
    rig.animation_data_create();rig.animation_data.action=bpy.data.actions['Idle'];rig.animation_data.action_slot=bpy.data.actions['Idle'].slots[0]
    bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
    out=RUN/'candidate';out.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'original-crossbow-grip.blend'))
    (out/'cuff-rebuild-report.json').write_text(json.dumps({'source':str(SOURCE),'method':'Original textured sleeve surface mapped to a contained wrist cross-section with geodesic falloff; topology, UVs and weights unchanged','records':records,'runtime_publish_allowed':False},indent=2)+'\n')
    print('CUFF_REBUILD',json.dumps({s:{'radius_m':r['cap_radius_m'],'vertices':{n:b['changed_vertices'] for n,b in r['bodies'].items()}} for s,r in records.items()}))
if __name__=='__main__':main()
