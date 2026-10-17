"""Articulate original generated armor faces over the retained body surface."""
import argparse,json,sys
from pathlib import Path
import bpy,bmesh
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from visual_guard_armor_test import armor_core,WRISTS

def selected_faces(body,rig,side,part,claimed):
    elbow=rig.data.bones['Forearm_'+side].head_local
    end=rig.data.bones['UpperArm_'+side].head_local if part=='UpperArm' else WRISTS[side];axis=(end-elbow).normalized()
    core=set(armor_core(body,rig,side,part));selected=set()
    for face in body.data.polygons:
        if face.index in claimed or not body.data.materials[face.material_index].name.startswith('GuardArmor'):continue
        center=sum((body.data.vertices[i].co for i in face.vertices),Vector())/len(face.vertices);d=center-elbow;t=d.dot(axis)
        if .020<t<.175 and (d-axis*t).length<.135:selected.add(face.index)
    edge_faces={}
    for i in selected:
        for edge in body.data.polygons[i].edge_keys:edge_faces.setdefault(tuple(sorted(edge)),set()).add(i)
    neighbours={i:set() for i in selected}
    for faces in edge_faces.values():
        for i in faces:neighbours[i].update(faces-{i})
    keep=set()
    while selected:
        stack=[selected.pop()];component=set()
        while stack:
            i=stack.pop();component.add(i);extra=neighbours[i]&selected;selected-=extra;stack.extend(extra)
        if any(set(body.data.polygons[i].vertices)&core for i in component):keep.update(component)
    covered={v for i in keep for v in body.data.polygons[i].vertices};assert core<=covered,('Uncovered source plate core',side,part,core-covered)
    return sorted(keep),core

def make_shell(body,rig,lod,side,part,faces,core):
    incident={};edge_faces={}
    for i in faces:
        face=body.data.polygons[i]
        for v in face.vertices:incident.setdefault(v,set()).add(i)
        for edge in face.edge_keys:edge_faces.setdefault(tuple(sorted(edge)),set()).add(i)
    vertices=[];source_ids=[];index={};pinches=0
    # A point shared by two otherwise separate face fans must be split before
    # closing the rim. Otherwise a solidify operation creates a nonmanifold edge.
    for vertex_id,around in incident.items():
        pending=set(around);fans=0
        while pending:
            stack=[pending.pop()];fan=set()
            while stack:
                i=stack.pop();fan.add(i)
                connected=set().union(*(edge_faces[tuple(sorted(e))] for e in body.data.polygons[i].edge_keys if vertex_id in e))
                extra=connected&pending;pending-=extra;stack.extend(extra)
            source=body.data.vertices[vertex_id];new=len(vertices);vertices.append(source.co+source.normal*.002);source_ids.append(vertex_id)
            for i in fan:index[i,vertex_id]=new
            fans+=1
        pinches+=max(0,fans-1)
    outer=[];uvs=[];original_uv=body.data.uv_layers.active
    for i in faces:
        face=body.data.polygons[i];outer.append(tuple(index[i,v] for v in face.vertices));uvs.append([tuple(original_uv.data[li].uv) for li in face.loop_indices])
    count=len(vertices);vertices.extend(body.data.vertices[i].co.copy() for i in source_ids)
    polygons=list(outer)+[tuple(i+count for i in reversed(face)) for face in outer];alluv=list(uvs)+[list(reversed(uv)) for uv in uvs]
    boundary={}
    for face,uv in zip(outer,uvs):
        for j,start in enumerate(face):
            end=face[(j+1)%len(face)];key=tuple(sorted((start,end)))
            if key in boundary:boundary.pop(key)
            else:boundary[key]=(start,end,uv[j],uv[(j+1)%len(face)])
    degree={}
    for start,end,u,v in boundary.values():
        for i in (start,end):degree[i]=degree.get(i,0)+1
        polygons.append((end,start,start+count,end+count));alluv.append([v,u,u,v])
    assert all(n==2 for n in degree.values()),('Unsplit boundary pinch',body.name,side,part)
    mesh=bpy.data.meshes.new(f'GuardRigidPlate_{part}_{side}_LOD{lod}');mesh.from_pydata(vertices,[],polygons);mesh.update()
    plate=bpy.data.objects.new(mesh.name,mesh);bpy.context.collection.objects.link(plate)
    plate.parent=body.parent;plate.matrix_parent_inverse=body.matrix_parent_inverse.copy();plate.matrix_basis=body.matrix_basis.copy()
    mesh.materials.append(body.data.materials[body.data.polygons[faces[0]].material_index]);uv=mesh.uv_layers.new(name=original_uv.name)
    for poly,values in zip(mesh.polygons,alluv):
        for li,value in zip(poly.loop_indices,values):uv.data[li].uv=value
        poly.use_smooth=True
    group=plate.vertex_groups.new(name=part+'_'+side);group.add(list(range(len(mesh.vertices))),1,'REPLACE')
    skin=plate.modifiers.new('Source skeleton rigid plate','ARMATURE');skin.object=rig
    plate['source_lod']=lod;plate['side']=side;plate['part']=part;plate['source_vertex_ids']=json.dumps(source_ids);plate['source_faces']=json.dumps(faces);plate['source_outer_vertices']=count
    bm=bmesh.new();bm.from_mesh(mesh);bad=sum(not e.is_manifold for e in bm.edges);volume=bm.calc_volume(signed=True);bm.free()
    assert bad==0 and volume>0,(plate.name,bad,volume)
    for poly,values in zip(mesh.polygons[:len(outer)],uvs):
        assert all((uv.data[li].uv-Vector(value)).length<1e-7 for li,value in zip(poly.loop_indices,values))
    return {'object':plate.name,'source_faces':len(faces),'source_vertices':len(incident),'source_core_vertices':len(core),'split_vertex_fans':pinches,'nonmanifold_edges':bad,'signed_volume':volume}

p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--reference',type=Path,required=True);p.add_argument('--run',type=Path,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve()
for folder in ('raw','candidate','qa'):(run/folder).mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(a.reference.resolve()))
weights={o.name:[{o.vertex_groups[w.group].name:w.weight for w in v.groups} for v in o.data.vertices] for o in bpy.data.objects if o.name.startswith('GuardBody_')}
bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');rows=[]
for lod in (0,1):
    body=bpy.data.objects[f'GuardBody_LOD{lod}'];claimed=set();regions=[]
    for side in 'LR':
        for part in ('UpperArm','Forearm'):
            faces,core=selected_faces(body,rig,side,part,claimed);claimed.update(faces);regions.append((side,part,faces,core))
    for side,part,faces,core in regions:rows.append(make_shell(body,rig,lod,side,part,faces,core))
    cloth=next(i for i,m in enumerate(body.data.materials) if m.name.startswith('TeamCloth'))
    for i in claimed:body.data.polygons[i].material_index=cloth
    for vertex,row in zip(body.data.vertices,weights[body.name]):
        for group in body.vertex_groups:group.remove([vertex.index])
        for name,weight in row.items():body.vertex_groups[name].add([vertex.index],weight,'REPLACE')
g.set_action(rig,'Idle');bpy.context.scene.frame_set(0);bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(run/'raw/guard-assembly.blend'));objects=[o for o in bpy.data.objects if o.type=='MESH']
for lod in (0,1):g.export_lod(run/'candidate'/('guard.glb' if lod==0 else 'guard-lod1.glb'),rig,[o for o in objects if o.name.endswith(f'_LOD{lod}')])
(run/'qa/plates-build.json').write_text(json.dumps({'source':str(a.source),'reference_weights':str(a.reference),'plates':rows,'runtime_publish_allowed':False,'artistic_quality_proven':False},indent=2)+'\n')
