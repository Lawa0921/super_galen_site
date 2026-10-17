"""Closed body, original rig/prop preservation and actual GLB seam skin parity."""
import bpy,hashlib,json,struct,sys
from pathlib import Path
from collections import Counter
from mathutils.kdtree import KDTree
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_body_build import ROOT,RUN,SOURCE
from original_crossbow_cuff_verify import snapshot

def surface(mesh,quotient=False):
    positions={};ids=[]
    for v in mesh.vertices:
        key=tuple(v.co) if quotient else v.index
        if key not in positions:positions[key]=len(positions)
        ids.append(positions[key])
    edges=Counter();direction=Counter();graph={i:set() for i in ids};degenerate=0
    for face in mesh.polygons:
        row=[ids[i] for i in face.vertices]
        if len(set(row))!=len(row):degenerate+=1
        for a,b in zip(row,row[1:]+row[:1]):
            edges[tuple(sorted((a,b)))]+=1;direction[(a,b)]+=1;graph[a].add(b);graph[b].add(a)
    todo=set(graph);components=0
    while todo:
        stack=[todo.pop()];components+=1
        while stack:
            v=stack.pop();new=graph[v]&todo;todo-=new;stack.extend(new)
    return {'vertices':len(positions),'triangles':sum(len(p.vertices)-2 for p in mesh.polygons),'boundary':sum(v==1 for v in edges.values()),'nonmanifold':sum(v>2 for v in edges.values()),'inconsistent_winding':sum(direction[(a,b)]!=1 or direction[(b,a)]!=1 for a,b in edges if edges[(a,b)]==2),'degenerate_faces':degenerate,'components':components}

def weight_rows(obj):
    return [{obj.vertex_groups[g.group].name:g.weight for g in v.groups if g.weight>1e-8} for v in obj.data.vertices]

def main():
    global SOURCE,RUN
    if '--run' in sys.argv:RUN=Path(sys.argv[sys.argv.index('--run')+1]).resolve()
    if '--source' in sys.argv:SOURCE=Path(sys.argv[sys.argv.index('--source')+1]).resolve()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));before,bones,actions=snapshot()
    candidate=SOURCE if '--baseline' in sys.argv else RUN/'candidate/original-crossbow-grip.blend'
    bpy.ops.wm.open_mainfile(filepath=str(candidate));after,new_bones,new_actions=snapshot()
    assert bones==new_bones and actions==new_actions,'Rig or authored animation changed'
    preserved=[n for n in before if not n.startswith('crossbowOriginalBody')]
    assert all(before[n]==after[n] for n in preserved),'Original non-body geometry/UV/weights changed'
    rig=bpy.data.objects['crossbowRig20'];rig.data.pose_position='REST';bpy.context.view_layer.update()
    sources={};rows=[]
    for lod in (0,1):
        body=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];result=surface(body.data);weights=weight_rows(body)
        assert result['boundary']==result['nonmanifold']==result['inconsistent_winding']==result['degenerate_faces']==0 and result['components']==1,result
        assert all(1<=len(w)<=4 and abs(sum(w.values())-1)<1e-5 for w in weights),'Invalid body weights'
        sources[lod]=([body.matrix_world@v.co for v in body.data.vertices],weights);rows.append({'lod':lod,'source':result})
    for lod in (0,1):
        bpy.ops.wm.read_factory_settings(use_empty=True);glb=RUN/f'candidate/original-crossbow-grip-lod{lod}.glb';bpy.ops.import_scene.gltf(filepath=str(glb))
        rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');rig.data.pose_position='REST';bpy.context.view_layer.update()
        assert len(rig.data.bones)==20
        body=next(o for o in bpy.data.objects if o.type=='MESH' and o.name==f'crossbowOriginalBody_LOD{lod}')
        result=surface(body.data,True);assert result['boundary']==result['nonmanifold']==result['inconsistent_winding']==result['degenerate_faces']==0 and result['components']==1,result
        points,weights=sources[lod];tree=KDTree(len(points))
        for i,p in enumerate(points):tree.insert(p,i)
        tree.balance();position_error=weight_error=0;duplicates={};seam_pairs=0
        for vertex,w in zip(body.data.vertices,weight_rows(body)):
            _,index,distance=tree.find(body.matrix_world@vertex.co);position_error=max(position_error,distance)
            weight_error=max(weight_error,sum(abs(w.get(n,0)-weights[index].get(n,0)) for n in w.keys()|weights[index].keys()))
            key=tuple(vertex.co)
            if key in duplicates:
                old=duplicates[key];assert sum(abs(w.get(n,0)-old.get(n,0)) for n in w.keys()|old.keys())<1e-6,'UV seam skin divergence';seam_pairs+=1
            duplicates[key]=w
        # Blender's importer adds a non-runtime bone display mesh (80 tris).
        # Budget the actual glTF primitives, as Three.js does.
        raw=glb.read_bytes();size=struct.unpack_from('<I',raw,12)[0];gltf=json.loads(raw[20:20+size])
        primitives=[p for mesh in gltf['meshes'] for p in mesh['primitives']];assert all(p.get('mode',4)==4 for p in primitives)
        total=sum(gltf['accessors'][p['indices']]['count']//3 for p in primitives)
        assert position_error<3e-6 and weight_error<1e-5,(position_error,weight_error)
        assert total<=(20000 if lod==0 else 10000),total
        rows[lod].update(export_quotient=result,glb_sha256=hashlib.sha256(glb.read_bytes()).hexdigest(),rest_max_error_m=position_error,weights_max_l1_error=weight_error,duplicate_uv_vertices_checked=seam_pairs,total_triangles=total)
    report={'pass':True,'source_sha256':hashlib.sha256(candidate.read_bytes()).hexdigest(),'preserved':preserved+['20 original bind matrices','all five authored action curves'],'rows':rows,'scope':'Complete connected closed oriented source/GLB body; rest position and skin parity including every UV duplicate. Bone animation parity and visual appearance require separate evidence.','runtime_publish_allowed':False}
    (RUN/'qa/body-surface-verification.json').write_text(json.dumps(report,indent=2)+'\n');print('BODY_VERIFY',json.dumps(report))
if __name__=='__main__':main()
