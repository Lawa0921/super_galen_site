"""Restore each unit from its own generated mesh, preserving source UV/materials."""
import argparse,hashlib,json,sys
from pathlib import Path
import bpy,bmesh,numpy as np
from mathutils import Matrix,Vector
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from human_units_build import remove_tiny_islands,fill_sparse_auto_weights
from human_units_spec import UNITS,skirt_weights
from visual_rider_surface_test import audit
from visual_hand_rework import mesh_fingerprint
from all_models_units import trim
from visual_knight_motion_test import positions
ROOT=Path(__file__).resolve().parents[3]


def continuous_robe_weights(body,height):
    adjusted=0
    for v in body.data.vertices:
        # A continuous robe must not steal the boots from Foot/Shin. Fade
        # the cloth treatment in above the ankle, retaining heat weights on
        # the original boot geometry and a broad transition at the hem.
        blend=g.smooth((v.co.z/height-.14)/.10)*(1-g.smooth((v.co.z/height-.44)/.02))*(1-g.smooth((abs(v.co.x)/height-.26)/.02))
        if blend<=0:continue
        weights={body.vertex_groups[w.group].name:w.weight*(1-blend) for w in v.groups}
        for name,w in skirt_weights(v.co.x,v.co.z,height).items():weights[name]=weights.get(name,0)+w*blend
        for group in body.vertex_groups:group.remove([v.index])
        for name,w in weights.items():
            if w>1e-7:(body.vertex_groups.get(name) or body.vertex_groups.new(name=name)).add([v.index],w,'REPLACE')
        adjusted+=1
    return adjusted


def repair_robe_seam(body,rig,height,lod):
    """Feather the actual strained rear-skirt patch without stealing boots."""
    edges=np.array([list(e.vertices) for e in body.data.edges]);bind=np.array([list(v.co) for v in body.data.vertices])
    lengths=np.linalg.norm(bind[edges[:,0]]-bind[edges[:,1]],axis=1);seeds=set()
    g.set_action(rig,'Walk');action=bpy.data.actions['Walk']
    for frame in range(int(action.frame_range[0]),int(action.frame_range[1])+1):
        bpy.context.scene.frame_set(frame);points=positions(body)
        current=np.linalg.norm(points[edges[:,0]]-points[edges[:,1]],axis=1)
        seeds.update(edges[(lengths>.005)&(current>lengths*3)].flatten().tolist())
    assert 4<=len(seeds)<=24,('Unexpected robe seam topology',lod,len(seeds))
    assert all(.14*height<bind[i,2]<.20*height and abs(bind[i,0])<.05*height for i in seeds),'Strain is outside the audited rear hem'
    adjacency=[set() for _ in body.data.vertices]
    for left,right in edges.tolist():adjacency[left].add(right);adjacency[right].add(left)
    rings,gain=(6,.70) if lod==0 else (4,.60);distance={i:0 for i in seeds};front=set(seeds)
    for d in range(1,rings+1):
        front={j for i in front for j in adjacency[i] if j not in distance and bind[j,2]>=.12*height}
        distance.update({i:d for i in front})
    for i,d in distance.items():
        v=body.data.vertices[i];alpha=1 if d==0 else gain*g.smooth(1-d/(rings+1))
        weights={body.vertex_groups[w.group].name:w.weight*(1-alpha) for w in v.groups}
        for name,w in skirt_weights(v.co.x,v.co.z,height).items():weights[name]=weights.get(name,0)+alpha*w
        weights=sorted(weights.items(),key=lambda item:-item[1])[:4];total=sum(w for _,w in weights)
        for group in body.vertex_groups:group.remove([i])
        for name,w in weights:
            if w>1e-7:body.vertex_groups[name].add([i],w/total,'REPLACE')
    return {'core_vertices':sorted(seeds),'rings':rings,'ring_gain':gain,'patched_vertices':len(distance),'boot_exclusion_minimum_z':.12*height}


def commander_cuff(body,side):
    center=Vector((.437116683,.097158521,1.10) if side=='R' else (-.431010246,.085044675,1.10));axis=Vector((0,0,-1));radius=.12
    groups={body.vertex_groups[n].index for n in ('Hand_'+side,'Forearm_'+side)}
    influence={v.index:sum(w.weight for w in v.groups if w.group in groups) for v in body.data.vertices}
    bm=bmesh.new();bm.from_mesh(body.data);bm.verts.ensure_lookup_table()
    region={v for v in bm.verts if influence[v.index]>.5 and -.08<(v.co-center).dot(axis)<.4 and (Vector((v.co.x-center.x,v.co.y-center.y,0))).length<radius}
    faces=[f for f in bm.faces if any(v in region for v in f.verts)];edges=list({e for f in faces for e in f.edges});verts=list({v for f in faces for v in f.verts})
    before=len(bm.faces)
    bmesh.ops.bisect_plane(bm,geom=[*verts,*edges,*faces],dist=1e-6,plane_co=center,plane_no=axis,clear_outer=True,clear_inner=False)
    rim=[v for v in bm.verts if abs(v.co.z-1.10)<1e-5 and (v.co-center).length<radius]
    assert len(rim)>8,(side,'Missing cuff rim')
    deform=bm.verts.layers.deform.verify();group=body.vertex_groups['Forearm_'+side].index
    for v in bm.verts:
        if 1.10<=v.co.z<1.12 and (v.co-center).length<radius:v[deform].clear();v[deform][group]=1
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(body.data);bm.free()
    return {'cut_center':list(center),'plane_normal':list(axis),'radius':radius,'rim_vertices':len(rim),'removed_faces':before-len(body.data.polygons)}


def main():
    p=argparse.ArgumentParser();p.add_argument('--unit',choices=['worker','priest','neutral-raider','crossbow','commander'],required=True);p.add_argument('--run',type=Path,required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);unit=a.unit;run=a.run.resolve()
    for folder in ('raw','candidate','qa'):(run/folder).mkdir(parents=True,exist_ok=True)
    source=ROOT/f'art-factory/rts/runs/all-models/2026-10-14-v1/raw/{unit}-assembly.blend'
    if unit=='crossbow':source=ROOT/'art-factory/rts/runs/all-models/2026-10-14-crossbow/final/raw/crossbow-assembly.blend'
    if unit=='commander':source=ROOT/'art-factory/rts/runs/commander-assembly/2026-10-14-v1/raw/commander-assembly.blend'
    raw=ROOT/f'art-factory/rts/runs/unit-bodies/{unit}/v1/neural/candidate/guard-neural-uv.obj'
    version='2026-10-05-v2' if unit in ('priest','commander') else '2026-10-05-v1'
    cloth=ROOT/f'art-factory/rts/runs/human-units/{version}/{unit}/candidate/cloth-faces.json'
    bpy.ops.wm.open_mainfile(filepath=str(source));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    unchanged={o.name:mesh_fingerprint(o) for o in bpy.data.objects if o.type=='MESH' and 'OriginalBody' not in o.name}
    reports=[]
    for lod in (0,1):
        old=bpy.data.objects[f'{unit}OriginalBody_LOD{lod}'];name=old.name;before=audit(old,rig)
        bpy.ops.wm.obj_import(filepath=str(raw),forward_axis='Y',up_axis='Z');body=bpy.context.object
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);cleanup=remove_tiny_islands(body)
        low=[min(v.co[i] for v in body.data.vertices) for i in range(3)];high=[max(v.co[i] for v in body.data.vertices) for i in range(3)]
        scale=UNITS[unit]['height_m']/(high[2]-low[2]);cx=(low[0]+high[0])/2;cy=(low[1]+high[1])/2
        for v in body.data.vertices:
            x,y,z=v.co;v.co=(-(y-cy)*scale,(x-cx)*scale,(z-low[2])*scale)
        assert abs(max(v.co.z for v in body.data.vertices)-max(v.co.z for v in old.data.vertices))<.002,'Source/body height mismatch'
        cloth_faces=set(json.loads(cloth.read_bytes())) if cloth.exists() else set()
        body.data.materials.clear()
        for material in old.data.materials:body.data.materials.append(material)
        for poly in body.data.polygons:poly.material_index=int(len(body.data.materials)>1 and poly.index in cloth_faces);poly.use_smooth=True
        bm=bmesh.new();bm.from_mesh(body.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(body.data);bm.free()
        mod=body.modifiers.new('Welded source reduction','DECIMATE');mod.ratio=min(1,(13000 if lod==0 else 6000)/g.tri_count(body))
        bpy.ops.object.modifier_apply(modifier=mod.name)
        world=rig.matrix_world.copy();rig.matrix_world=Matrix.Identity(4);rig.data.pose_position='REST'
        bpy.ops.object.select_all(action='DESELECT');body.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
        bpy.ops.object.parent_set(type='ARMATURE_AUTO',keep_transform=True)
        body.matrix_parent_inverse=Matrix.Identity(4);body.matrix_basis=Matrix.Identity(4);rig.matrix_world=world;rig.data.pose_position='POSE'
        bpy.context.view_layer.objects.active=body;rig.select_set(False)
        sparse=fill_sparse_auto_weights(body,rig)
        skirt=continuous_robe_weights(body,UNITS[unit]['height_m']) if unit=='priest' else 0
        bpy.ops.object.vertex_group_limit_total(limit=4);bpy.ops.object.vertex_group_normalize_all(lock_active=False)
        robe_patch=repair_robe_seam(body,rig,UNITS[unit]['height_m'],lod) if unit=='priest' else None
        for key,value in old.items():body[key]=value
        bpy.data.objects.remove(old,do_unlink=True);body.name=name
        if unit=='commander':
            cuts={side:commander_cuff(body,side) for side in 'LR'}
            body['intentional_cuff_planes']=json.dumps(list(cuts.values()))
        elif unit=='crossbow':
            cuts={}
            for side in 'LR':
                cuts[side]={'removed_faces':g.trim_open_hand(body,rig,side)}
                assert cuts[side]['removed_faces']>0,'Crossbow palm was not trimmed'
        else:cuts={'R':trim(body,rig,'R',proximal=.03)}
        bpy.ops.object.vertex_group_limit_total(limit=4);bpy.ops.object.vertex_group_normalize_all(lock_active=False)
        reports.append({'lod':lod,'before':before,'after':audit(body,rig),'cuts':cuts,'sparse_vertices':len(sparse),'skirt_vertices':skirt,'robe_seam_patch':robe_patch,'cleanup':cleanup})
    for name,digest in unchanged.items():assert mesh_fingerprint(bpy.data.objects[name])==digest,'Unrelated equipment changed'
    g.set_action(rig,'Idle');bpy.context.scene.frame_set(0);bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(run/f'raw/{unit}-assembly.blend'))
    for lod in (0,1):
        objects=[o for o in bpy.data.objects if o.type=='MESH' and o.name.endswith(f'_LOD{lod}')]
        g.export_lod(run/'candidate'/(f'{unit}.glb' if lod==0 else f'{unit}-lod1.glb'),rig,objects)
    report={'unit':unit,'source':str(source.relative_to(ROOT)),'raw_source':str(raw.relative_to(ROOT)),'raw_source_sha256':hashlib.sha256(raw.read_bytes()).hexdigest(),
            'bodies':reports,'unchanged_equipment':unchanged,'method':'Weld before decimation, preserve loop UV and existing materials, heat weights on the existing unit-specific skeleton',
            'status':'candidate_requires_visual_and_motion_review','runtime_publish_allowed':False,'artistic_quality_proven':False}
    (run/f'qa/{unit}-body-restore.json').write_bytes((json.dumps(report,indent=2)+'\n').encode());print(json.dumps(report))


if __name__=='__main__':main()
