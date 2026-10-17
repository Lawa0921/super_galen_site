"""Inspect and repair collapsed cross-chart corner UVs against the original mother."""
import bpy,hashlib,json,sys
from pathlib import Path
from collections import defaultdict
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_body_build import ROOT,MOTHER,weld_mother
SOURCE=ROOT/'art-factory/rts/runs/original-crossbow-body-surface/2026-10-06-v1/candidate/original-crossbow-grip.blend'
RUN=ROOT/'art-factory/rts/runs/original-crossbow-drape/2026-10-06-v1'

def load_mother():
    assert hashlib.sha256(MOTHER.read_bytes()).hexdigest()=='6467f72f90b373b8409d93d6f274c908c967921e61cb4fa4944b58200a2c6be0'
    with bpy.data.libraries.load(str(MOTHER),link=False) as (src,dst):dst.objects=list(src.objects)
    imported=[o for o in dst.objects if o];obj=next(o for o in imported if o.type=='MESH');bpy.context.scene.collection.objects.link(obj)
    for other in imported:
        if other!=obj:bpy.data.objects.remove(other,do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);weld_mother(obj)
    landmarks=json.loads((ROOT/'art-factory/rts/runs/human-units/2026-10-05-v1/crossbow/qa/landmarks.json').read_text());b=landmarks['source_bounds'];scale=landmarks['scale'];cx=(b['minimum'][0]+b['maximum'][0])/2;cy=(b['minimum'][1]+b['maximum'][1])/2;z0=b['minimum'][2]
    for v in obj.data.vertices:
        x,y,z=v.co;v.co=(-(y-cy)*scale,(x-cx)*scale,(z-z0)*scale)
    obj.data.update();return obj

def charts(mesh):
    uv=mesh.uv_layers.active.data;links=defaultdict(list)
    for face in mesh.polygons:
        loops=list(face.loop_indices)
        for i,j in zip(loops,loops[1:]+loops[:1]):
            a,b=mesh.loops[i].vertex_index,mesh.loops[j].vertex_index
            links[tuple(sorted((a,b)))].append((face.index,{a:uv[i].uv.copy(),b:uv[j].uv.copy()}))
    graph={p.index:set() for p in mesh.polygons}
    for edge,items in links.items():
        if len(items)==2:
            (a,ua),(b,ub)=items
            if all((ua[i]-ub[i]).length<1e-7 for i in edge):graph[a].add(b);graph[b].add(a)
    ids={};members=[]
    for start in graph:
        if start in ids:continue
        number=len(members);todo=[start];group=[];ids[start]=number
        while todo:
            i=todo.pop();group.append(i)
            for j in graph[i]:
                if j not in ids:ids[j]=number;todo.append(j)
        members.append(group)
    return ids,members,links

def span(mesh,face):
    uv=mesh.uv_layers.active.data;points=[uv[i].uv for i in face.loop_indices]
    return max((a-b).length for i,a in enumerate(points) for b in points[i+1:])

def inspect(body,mother,chart_ids,tree):
    mesh=body.data;bad={p.index for p in mesh.polygons if span(mesh,p)>.25};edges=defaultdict(list)
    for p in mesh.polygons:
        for e in p.edge_keys:edges[tuple(sorted(e))].append(p.index)
    graph={p.index:set() for p in mesh.polygons}
    for faces in edges.values():
        if len(faces)==2:a,b=faces;graph[a].add(b);graph[b].add(a)
    nearest={}
    for p in mesh.polygons:
        point=sum((mesh.vertices[i].co for i in p.vertices),Vector())/len(p.vertices)
        nearest[p.index]=chart_ids[tree.find_nearest(point)[2]]
    todo=set(bad);components=[]
    while todo:
        start=min(todo);todo.remove(start);stack=[start];group={start}
        while stack:
            i=stack.pop();new=graph[i]&todo;todo-=new;group|=new;stack.extend(new)
        boundary={j for i in group for j in graph[i] if j not in bad};hints={nearest[i] for i in boundary}
        points=[mesh.vertices[v].co for i in group for v in mesh.polygons[i].vertices]
        components.append({'faces':sorted(group),'bounds':[[min(p[k] for p in points),max(p[k] for p in points)] for k in range(3)],'boundary_faces':sorted(boundary),'boundary_charts':sorted(hints),'centroid_charts':sorted({nearest[i] for i in group})})
    return {'body':body.name,'bad_faces':len(bad),'max_uv_edge':max(span(mesh,p) for p in mesh.polygons),'components':components}

def main():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()=='91d1048ab31dad70e4e66b2a99cea3d666de6e8fb201f9a084f16c00b5922ffe'
    mother=load_mother();mesh=mother.data;chart_ids,members,_=charts(mesh);tree=BVHTree.FromPolygons([v.co for v in mesh.vertices],[tuple(p.vertices) for p in mesh.polygons],all_triangles=True)
    rows=[inspect(bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'],mother,chart_ids,tree) for lod in (0,1)]
    report={'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'canonical_charts':len(members),'canonical_max_uv_edge':max(span(mesh,p) for p in mesh.polygons),'rows':rows,'pass':all(r['bad_faces']==0 for r in rows),'runtime_publish_allowed':False}
    out=RUN/'qa';out.mkdir(parents=True,exist_ok=True);(out/'uv-baseline.json').write_text(json.dumps(report,indent=2)+'\n')
    print('UV_DIAG',json.dumps({'charts':len(members),'rows':[{'body':r['body'],'bad_faces':r['bad_faces'],'patches':len(r['components']),'boundary_chart_counts':[len(c['boundary_charts']) for c in r['components']]} for r in rows]}))
    if '--baseline' in sys.argv:assert report['pass'],'Cross-chart UV jumps remain'
if __name__=='__main__':main()
