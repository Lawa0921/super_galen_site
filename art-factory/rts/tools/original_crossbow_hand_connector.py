"""Rebuild only the original distal cuff strip between two real source contours."""
import bpy,bmesh,json,sys,hashlib,math
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_attack_probe import activate
from original_glove_deformation import evaluated
from original_crossbow_hand_cuff import hand_section
from original_crossbow_wrist_cut_probe import prepare_cut
from original_crossbow_wrist_topology_build import ordered_ring,skin_matrix

ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-crossbow-articulated-hand/2026-10-07-v1'
SOURCE=RUN/'candidate/articulated-crossbow.blend'

def sample_ring(ring,t):
    lengths=[(a-b).length for a,b in zip(ring,ring[1:]+ring[:1])];distance=(t%1)*sum(lengths)
    for a,b,length in zip(ring,ring[1:]+ring[:1],lengths):
        if distance<=length:return a.lerp(b,distance/length)
        distance-=length
    return ring[0].copy()

def main():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['crossbowRig20'];activate(rig,'Idle',0)
    meta=json.loads((RUN/'qa/attachment-preflight.json').read_text());anchor=Matrix(meta['source_bones']['Hand_L']['matrix']);rest_map=Matrix(meta['rest_map'])
    hand=bpy.data.objects['OriginalCrossbowArticulatedHand_L'];shape=hand_section(hand,rest_map)
    pose_map=rig.pose.bones['HandPalm_L'].matrix@anchor.inverted();local_inverse=pose_map.inverted()
    hp,hf=evaluated(hand);hand_surface=BVHTree.FromPolygons([local_inverse@p for p in hp],hf,all_triangles=True)
    def contained(point):
        p=local_inverse@point
        if p.z<.003:return point
        direction=Vector((p.x,p.y,0))
        if direction.length<1e-8:return point
        hit=hand_surface.ray_cast(Vector((0,0,p.z)),direction.normalized(),.12)[3]
        assert hit is not None,('No original glove section',list(p))
        if direction.length>hit*.78:
            direction.normalize();p.x=direction.x*hit*.78;p.y=direction.y*hit*.78
        return pose_map@p
    rows=[]
    for lod in (0,1):
        body=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];mesh=body.data;rest=[v.co.copy() for v in mesh.vertices]
        attr=mesh.attributes.new('ArticulatedSourceVertex','INT','POINT')
        for i,v in enumerate(attr.data):v.value=i+1
        mesh.attributes.new('ArticulatedCuff','INT','POINT');mesh.attributes.new('ArticulatedCuffFace','INT','FACE')
        points,triangles=evaluated(body);mesh.calc_loop_triangles();tri_uv=[[mesh.uv_layers.active.data[i].uv.copy() for i in t.loops] for t in mesh.loop_triangles]
        surface=BVHTree.FromPolygons(points,triangles,all_triangles=True)
        def sample_uv(point):
            p,_,i,_=surface.find_nearest(point)
            return barycentric_transform(p,*[points[k] for k in triangles[i]],*[Vector((*uv,0)) for uv in tri_uv[i]]).xy
        bm,source,deform,_,_,graph,cut,axis=prepare_cut(body,rig,'L',.045)
        original_id=bm.verts.layers.int['ArticulatedSourceVertex'];ring=ordered_ring(graph)
        edge=next(e for e in ring[0].link_edges if ring[1] in e.verts);face=edge.link_faces[0]
        if any(l.vert==ring[0] and l.link_loop_next.vert==ring[1] for l in face.loops):ring.reverse()
        for vertex in ring:vertex[original_id]=0
        start=[v.co.copy() for v in ring];N=len(ring);center=sum(start,Vector())/N
        # Preserve cyclic arc length. Search phase/direction, never match a
        # body vertex to its nearest hand vertex independently.
        choices=[]
        for direction in (1,-1):
            for phase in range(128):
                local=[sample_ring(shape,phase/128+direction*i/N) for i in range(N)]
                targets=[contained(pose_map@Vector((p.x*.80,p.y*.80,p.z+.012))) for p in local]
                score=sum(((a-center).normalized()-(b-(pose_map@Vector((0,0,.012)))).normalized()).length_squared for a,b in zip(start,targets))
                choices.append((score,direction,phase,targets))
        _,direction,phase,targets=min(choices,key=lambda x:x[0]);weights=[dict(v[deform]) for v in ring]
        palm=body.vertex_groups.get('HandPalm_L') or body.vertex_groups.new(name='HandPalm_L')
        uv=bm.loops.layers.uv.active;mark=bm.verts.layers.int['ArticulatedCuff'];face_mark=bm.faces.layers.int['ArticulatedCuffFace']
        bands=[ring];uv_bands=[[sample_uv(p) for p in start]]
        for band in range(1,5):
            t=band/4;s=t*t*(3-2*t);new=[];uvs=[]
            for i,(a,b) in enumerate(zip(start,targets)):
                vertex=bm.verts.new(contained(a.lerp(b,t)));vertex[original_id]=0;vertex[source]=0;vertex[mark]=2 if band==4 else 1
                for group,weight in weights[i].items():vertex[deform][group]=weight*(1-s)
                vertex[deform][palm.index]=s;new.append(vertex);uvs.append(sample_uv(a.lerp(b,t)))
            prior=bands[-1]
            for i in range(N):
                j=(i+1)%N;face=bm.faces.new((prior[i],prior[j],new[j],new[i]));face[face_mark]=1
                for loop,value in zip(face.loops,(uv_bands[-1][i],uv_bands[-1][j],uvs[j],uvs[i])):loop[uv].uv=value
            bands.append(new);uv_bands.append(uvs)
        cap=bm.verts.new(sum(targets,Vector())/N);cap[original_id]=0;cap[source]=0;cap[mark]=3;cap[deform][palm.index]=1
        for i in range(N):
            j=(i+1)%N;face=bm.faces.new((bands[-1][i],bands[-1][j],cap));face[face_mark]=2
            for loop,value in zip(face.loops,(uv_bands[-1][i],uv_bands[-1][j],sum(uv_bands[-1],Vector((0,0)))/N)):loop[uv].uv=value
        for vertex in bm.verts:
            vertex.co=rest[vertex[original_id]-1] if vertex[original_id]>0 else skin_matrix(body,rig,dict(vertex[deform])).inverted()@vertex.co
        assert all(e.is_manifold for e in bm.edges),'Connector must close the complete body'
        bm.to_mesh(mesh);bm.free();mesh.update()
        rows.append({'lod':lod,'cut_distance_m':.045,'cut_vertices':N,'phase':phase/128,'direction':direction,'new_vertices':sum(x.value==0 for x in mesh.attributes['ArticulatedSourceVertex'].data),'retained_vertices':sum(x.value>0 for x in mesh.attributes['ArticulatedSourceVertex'].data)})
    output=RUN/'candidate/articulated-connector.blend';bpy.ops.wm.save_as_mainfile(filepath=str(output))
    report={'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'candidate_sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'records':rows,'scope':'Cut only the distal original sleeve at 45mm in bind space, join its actual continuous contour to the original hand wrist contour with four skinned bands; original retained vertices exact.','runtime_publish_allowed':False}
    (RUN/'qa/connector-authoring.json').write_text(json.dumps(report,indent=2)+'\n');print('CONNECTOR',json.dumps(report))

if __name__=='__main__':main()
