"""Reconstruct a continuous surface from the generated horse, transferring UV/skin."""
import argparse
import hashlib
import json
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

sys.path.insert(0,str(Path(__file__).parent))
from visual_knight_surface_test import audit

ROOT=Path(__file__).resolve().parents[3]
BASE=ROOT/'art-factory/rts/runs/all-models/2026-10-15-knight-mouth/raw'


def bary(point,vertices):
    return barycentric_transform(point,*vertices,Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)))


def main():
    p=argparse.ArgumentParser();p.add_argument('--run',type=Path,required=True);p.add_argument('--lod',type=int,required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve();lod=a.lod
    for f in ('raw','candidate','qa'):(run/f).mkdir(parents=True,exist_ok=True)
    source=BASE/f'knight-lod{lod}.blend';bpy.ops.wm.open_mainfile(filepath=str(source))
    horse=bpy.data.objects[f'NeuralWarhorse_LOD{lod}'];before=audit(horse)
    rig=next(m.object for m in horse.modifiers if m.type=='ARMATURE')
    original=horse.data.copy()
    bm=bmesh.new();bm.from_mesh(original);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(original);bm.free()
    points=[v.co.copy() for v in original.vertices];faces=[list(p.vertices) for p in original.polygons]
    weights=[{horse.vertex_groups[w.group].name:w.weight for w in v.groups if w.weight>0} for v in original.vertices]
    uv=[original.uv_layers.active.data[i].uv.copy() for i in range(len(original.loops))]
    tree=BVHTree.FromPolygons(points,faces,all_triangles=True)
    horse.modifiers.clear();bpy.ops.object.select_all(action='DESELECT');horse.hide_set(False);horse.select_set(True)
    bpy.context.view_layer.objects.active=horse
    mod=horse.modifiers.new('Continuous generated horse surface','REMESH');mod.mode='VOXEL';mod.voxel_size=.006
    mod.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=mod.name)
    mod=horse.modifiers.new('Remove reconstruction spikes','SMOOTH');mod.factor=.30;mod.iterations=3
    bpy.ops.object.modifier_apply(modifier=mod.name)
    triangles=sum(len(p.vertices)-2 for p in horse.data.polygons)
    mod=horse.modifiers.new('Horse LOD surface','DECIMATE');mod.ratio=min(1,(16000 if lod==0 else 7500)/triangles)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bm=bmesh.new();bm.from_mesh(horse.data);remaining=set(bm.verts);removed=0
    while remaining:
        v=remaining.pop();component={v};stack=[v]
        while stack:
            v=stack.pop();nexts={e.other_vert(v) for e in v.link_edges}&remaining
            remaining.difference_update(nexts);component.update(nexts);stack.extend(nexts)
        if len(component)<12:removed+=len(component);bmesh.ops.delete(bm,geom=list(component),context='VERTS')
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(horse.data);bm.free()
    horse.vertex_groups.clear();groups={name:horse.vertex_groups.new(name=name) for name in rig.data.bones.keys()}
    max_distance=0
    for vertex in horse.data.vertices:
        point,_,index,distance=tree.find_nearest(vertex.co);max_distance=max(max_distance,distance)
        ids=faces[index];blend=bary(point,[points[i] for i in ids]);result={}
        for i,w in zip(ids,blend):
            for name,value in weights[i].items():result[name]=result.get(name,0)+value*max(0,w)
        total=sum(result.values())
        if total<.00001:
            # Small originally unweighted seams inherit the closest valid
            # vertex's original bone, not a newly inferred deformation rig.
            ids=sorted(range(len(points)),key=lambda i:(points[i]-vertex.co).length_squared)
            result=next(weights[i] for i in ids if weights[i]);total=sum(result.values())
        for name,value in result.items():
            if value>0:groups[name].add([vertex.index],value/total,'REPLACE')
    for layer in list(horse.data.uv_layers):horse.data.uv_layers.remove(layer)
    target_uv=horse.data.uv_layers.new(name='UVMap')
    for poly in horse.data.polygons:
        center=sum((horse.data.vertices[i].co for i in poly.vertices),Vector())/len(poly.vertices)
        _,_,index,_=tree.find_nearest(center);sourcepoly=original.polygons[index]
        ids=faces[index];coords=[points[i] for i in ids];values=[uv[i] for i in sourcepoly.loop_indices]
        poly.material_index=sourcepoly.material_index;poly.use_smooth=True
        for i in poly.loop_indices:
            point=horse.data.vertices[horse.data.loops[i].vertex_index].co;blend=bary(point,coords)
            target_uv.data[i].uv=sum((q*w for q,w in zip(values,blend)),Vector((0,0)))
    mod=horse.modifiers.new('Skin','ARMATURE');mod.object=rig
    report={'source':str(source.relative_to(ROOT)),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
            'before':before,'after':audit(horse),'maximum_projection_distance_m':max_distance,
            'removed_small_component_vertices':removed,'method':'voxel surface reconstruction; source triangle UV and deform interpolation',
            'status':'candidate_requires_visual_review','runtime_publish_allowed':False,'artistic_quality_proven':False}
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(run/f'raw/knight-lod{lod}.blend'))
    (run/f'qa/remesh-lod{lod}.json').write_bytes((json.dumps(report,indent=2)+'\n').encode())
    print(json.dumps({k:v for k,v in report.items() if k not in ('before','after')}))


if __name__=='__main__':main()
