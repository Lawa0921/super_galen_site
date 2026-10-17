"""Restore the watertight original mother before skinning and LOD reduction."""
import ast,bpy,bmesh,hashlib,json,os,sys
from pathlib import Path
from collections import Counter
import numpy as np
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_wrist_topology_build import repair
from original_crossbow_waist_build import weights_for_waist
ROOT=Path(__file__).resolve().parents[3]
SOURCE=ROOT/'art-factory/rts/runs/original-crossbow-team-surface/2026-10-06-v1/candidate/original-crossbow-grip.blend'
MOTHER=ROOT/'art-factory/rts/runs/unit-bodies/crossbow/v1/projected/candidate/guard-neural-v3.blend'
RUN=ROOT/'art-factory/rts/runs/original-crossbow-body-surface/2026-10-06-v1'

def topology(mesh):
    count=Counter(tuple(sorted(e)) for p in mesh.polygons for e in p.edge_keys)
    return {'vertices':len(mesh.vertices),'triangles':sum(len(p.vertices)-2 for p in mesh.polygons),'edges':len(count),'boundary':sum(n==1 for n in count.values()),'nonmanifold':sum(n>2 for n in count.values())}

def weld_mother(obj):
    mesh=obj.data;before=topology(mesh);uv_before=[tuple(loop.uv) for loop in mesh.uv_layers.active.data]
    bm=bmesh.new();bm.from_mesh(mesh);positions={};merge={}
    for vertex in bm.verts:
        key=tuple(vertex.co)
        if key in positions:merge[vertex]=positions[key]
        else:positions[key]=vertex
    bmesh.ops.weld_verts(bm,targetmap=merge);bm.to_mesh(mesh);bm.free();mesh.update();after=topology(mesh)
    assert [tuple(loop.uv) for loop in mesh.uv_layers.active.data]==uv_before,'Original corner UV changed'
    assert after=={'vertices':13234,'triangles':26464,'edges':39696,'boundary':0,'nonmanifold':0},after
    return {'before':before,'after':after,'merged_exact_duplicate_vertices':len(merge),'per_corner_uv_exact':True}

def transfer_continuous_weights(body,donor,rig):
    mesh=donor.data;mesh.calc_loop_triangles();points=[v.co.copy() for v in mesh.vertices];triangles=[tuple(t.vertices) for t in mesh.loop_triangles]
    tree=BVHTree.FromPolygons(points,triangles,all_triangles=True);names=list(rig.data.bones.keys());name_to_index={n:i for i,n in enumerate(names)}
    source=np.zeros((len(points),len(names)),dtype=np.float64)
    for v in mesh.vertices:
        for g in v.groups:source[v.index,name_to_index[donor.vertex_groups[g.group].name]]=g.weight
    seed=np.zeros((len(body.data.vertices),len(names)),dtype=np.float64);distances=[]
    for vertex in body.data.vertices:
        point,_,index,distance=tree.find_nearest(vertex.co);tri=triangles[index];distances.append(distance)
        bary=barycentric_transform(point,*[points[i] for i in tri],Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)))
        mix=np.maximum(np.asarray(bary),0);mix/=mix.sum();seed[vertex.index]=sum(source[i]*w for i,w in zip(tri,mix))
    edges=np.asarray([tuple(e.vertices) for e in body.data.edges],dtype=np.int32);a=np.concatenate((edges[:,0],edges[:,1]));b=np.concatenate((edges[:,1],edges[:,0]))
    degree=np.bincount(a,minlength=len(seed)).reshape(-1,1);weights=seed.copy()
    # Regularized graph diffusion on the continuous original mesh, before UV
    # export splitting. It is not a per-island copy of the broken donor skin.
    for _ in range(10):
        neighbors=np.zeros_like(weights);np.add.at(neighbors,a,weights[b]);average=neighbors/degree
        weights=.15*seed+.85*(.45*weights+.55*average)
    for name in names:body.vertex_groups.new(name=name)
    for vertex,values in zip(body.data.vertices,weights):
        result=weights_for_waist(vertex.co,{name:float(w) for name,w in zip(names,values) if w>1e-8})
        items=sorted(result.items(),key=lambda item:(-item[1],item[0]))[:4];total=sum(w for _,w in items)
        for name,w in items:body.vertex_groups[name].add([vertex.index],w/total,'REPLACE')
    body.parent=rig;body.matrix_parent_inverse=Matrix.Identity(4);mod=body.modifiers.new('OriginalContinuousBodySkin','ARMATURE');mod.object=rig
    return {'method':'Nearest original bind-surface barycentric seed, 10 regularized graph diffusion steps on welded original topology, original authored waist field, normalized top 4','distance_percentiles_m':np.percentile(distances,[50,95,99,100]).tolist()}

def normalize_skin(obj):
    # Collapse interpolates deform groups, sometimes creating five or more.
    # Finalize the exact runtime top-four field in source before QA/export.
    trimmed=0;maximum_removed_mass=0
    for vertex in obj.data.vertices:
        values=sorted(((g.group,g.weight) for g in vertex.groups if g.weight>.0001),key=lambda item:(-item[1],item[0]));top=values[:4];total=sum(w for _,w in top)
        assert total>0
        if len(values)>4:trimmed+=1;maximum_removed_mass=max(maximum_removed_mass,sum(w for _,w in values[4:]))
        for g in list(vertex.groups):obj.vertex_groups[g.group].remove([vertex.index])
        for index,weight in top:obj.vertex_groups[index].add([vertex.index],weight/total,'REPLACE')
    return {'trimmed_vertices':trimmed,'maximum_removed_mass':maximum_removed_mass,'exporter_min_influence':.0001}

def reduce(obj,target):
    before=topology(obj.data);bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    mod=obj.modifiers.new('CanonicalOriginalLOD','DECIMATE');mod.ratio=target/before['triangles'];mod.use_collapse_triangulate=True
    obj.modifiers.move(len(obj.modifiers)-1,0);bpy.ops.object.modifier_apply(modifier=mod.name)
    after=topology(obj.data);assert after['boundary']==0 and after['nonmanifold']==0,after
    return {'before':before,'after':after,'top_four_skin':normalize_skin(obj)}

def main():
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()=='35e6c95a646fd8647b3c24fc54ab11106ea53796503ef81d34c76e877e81a4f1'
    assert hashlib.sha256(MOTHER.read_bytes()).hexdigest()=='6467f72f90b373b8409d93d6f274c908c967921e61cb4fa4944b58200a2c6be0'
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['crossbowRig20'];donors=[bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'] for lod in (0,1)]
    with bpy.data.libraries.load(str(MOTHER),link=False) as (source,target):target.objects=list(source.objects)
    imported=[o for o in target.objects if o is not None];bodies=[o for o in imported if o.type=='MESH'];assert len(bodies)==1
    body=bodies[0];body.name='OriginalCrossbowCanonicalBody';bpy.context.scene.collection.objects.link(body)
    for obj in imported:
        if obj!=body:bpy.data.objects.remove(obj,do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    quotient=weld_mother(body)
    landmarks=json.loads((ROOT/'art-factory/rts/runs/human-units/2026-10-05-v1/crossbow/qa/landmarks.json').read_text());bounds=landmarks['source_bounds'];scale=landmarks['scale'];cx=(bounds['minimum'][0]+bounds['maximum'][0])/2;cy=(bounds['minimum'][1]+bounds['maximum'][1])/2;z0=bounds['minimum'][2]
    for vert in body.data.vertices:
        x,y,z=vert.co;vert.co=(-(y-cy)*scale,(x-cx)*scale,(z-z0)*scale)
    body.data.update();body.data.materials.clear();body.data.materials.append(donors[0].data.materials[0])
    for face in body.data.polygons:face.material_index=0;face.use_smooth=True
    weights=transfer_continuous_weights(body,donors[0],rig)
    a=bpy.data.actions['Idle'];rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0];bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
    if '--before-cuff' in sys.argv:
        bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tmp/rts/body-before-cuff.blend'));return
    canonical=topology(body.data);assert canonical['boundary']==0 and canonical['nonmanifold']==0,canonical
    for lod,obj in enumerate(donors):obj.name=f'QAOriginalBrokenDonor_LOD{lod}';obj.hide_render=True
    low=body.copy();low.data=body.data.copy();bpy.context.scene.collection.objects.link(low)
    body.name='crossbowOriginalBody_LOD0';low.name='crossbowOriginalBody_LOD1'
    # Simplify the original closed body first. Cuff caps must never pass
    # through collapse: their exact Hand-only skin is an attachment contract.
    lods=[reduce(body,14300),reduce(low,5700)];cuffs=[]
    for obj,record in zip((body,low),lods):
        cuffs.extend(repair(obj,rig,side,.130,sample_body=donors[0]) for side in ('R','L'))
        record['final_skin']=normalize_skin(obj);record['final_surface']=topology(obj.data)
        assert record['final_surface']['boundary']==record['final_surface']['nonmanifold']==0
    # Remove only memory donor objects; originals remain frozen on disk.
    for obj in donors:bpy.data.objects.remove(obj,do_unlink=True)
    out=RUN/'candidate';out.mkdir(parents=True,exist_ok=True);(RUN/'qa').mkdir(exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'original-crossbow-grip.blend'))
    report={'source':str(SOURCE),'mother':str(MOTHER),'quotient':quotient,'normalize':{'scale':scale,'source_bounds':bounds},'weights':weights,'cuffs':cuffs,'canonical_before_lod':canonical,'lods':lods,'runtime_publish_allowed':False}
    (out/'body-surface-report.json').write_text(json.dumps(report,indent=2)+'\n');print('BODY_SOURCE',json.dumps(report))
    if '--no-export' in sys.argv:return
    exporter=Path(__file__).with_name('original_crossbow_grip_build.py');tree=ast.parse(exporter.read_text(encoding='utf8'));fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='export_lod')
    for node in ast.walk(fn):
        if isinstance(node,ast.Call) and isinstance(node.func,ast.Attribute) and node.func.attr=='gltf':node.keywords.append(ast.keyword(arg='export_extras',value=ast.Constant(True)))
    ast.fix_missing_locations(fn);ns={'bpy':bpy,'os':os};exec(compile(ast.Module(body=[fn],type_ignores=[]),str(exporter),'exec'),ns)
    weapons=[bpy.data.objects[f'CrossbowWeapon_LOD{lod}'] for lod in (0,1)];hands=[bpy.data.objects['OriginalCrossbowClosedGrip_'+s] for s in ('R','L')]
    for lod in (0,1):ns['export_lod'](rig,[body,low],weapons,[],hands,str(out/f'original-crossbow-grip-lod{lod}.glb'),[body,low][lod].name,weapons[lod].name)
    base=json.loads((ROOT/'art-factory/rts/runs/original-crossbow-wrist-topology/2026-10-06-v1/candidate/weapon-candidate-report.json').read_text());base['body_surface_source']=str(SOURCE);base['files']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.iterdir() if p.suffix in ('.blend','.glb')}
    (out/'weapon-candidate-report.json').write_text(json.dumps(base,indent=2)+'\n');print('BODY_EXPORT',json.dumps(base['files']))

if __name__=='__main__':main()
