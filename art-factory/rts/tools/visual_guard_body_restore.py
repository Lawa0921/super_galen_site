"""Restore the guard's original generated body while retaining repaired hands."""
import argparse,hashlib,json,sys
from pathlib import Path
import bpy,bmesh
from mathutils import Matrix,Vector
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from neural_guard_production_spec import transformed_point
from visual_rider_surface_test import audit
ROOT=Path(__file__).resolve().parents[3]


def stabilize_knee_patches(body):
    """Keep each collapsed skin patch under one affine LBS transform.

    These landmarks belong to the deterministic welded 13k source, after
    cuff cutting. Guard bind-surface QA caught four adjacent faces becoming
    almost collinear at 106 degree knee bends. Preserve Volume alone would
    not survive a standard glTF skin export.
    """
    if body.name!='GuardBody_LOD0':return []
    patches=[('L',[2035,2049,2072,2077,3426,3427],.50,(-.224,-.200,.389),(-.186,-.184,.425)),
             ('R',[1027,1029,4352,4358,4365,4371],.35,(.124,-.126,.372),(.170,-.095,.392))]
    reports=[]
    for side,ids,thigh,low,high in patches:
        for index in ids:
            v=body.data.vertices[index]
            assert all(low[i]<v.co[i]<high[i] for i in range(3)),('Knee landmark changed',side,index,list(v.co))
            names={body.vertex_groups[w.group].name for w in v.groups if w.weight>1e-6}
            assert names=={'Thigh_'+side,'Shin_'+side},('Unexpected knee influences',side,index,names)
        body.vertex_groups['Thigh_'+side].add(ids,thigh,'REPLACE')
        body.vertex_groups['Shin_'+side].add(ids,1-thigh,'REPLACE')
        reports.append({'side':side,'vertices':ids,'thigh_weight':thigh,'shin_weight':1-thigh})
    return reports


def trim_cuff(body,rig,side):
    # The previous plane followed a posed hand direction in bind space and
    # sliced lengthwise up the bracer. Cut perpendicular to the rest forearm.
    wrist=Vector((-.434176,-.046531,.911712) if side=='L' else (.409796,.089432,.902662))
    bone=rig.data.bones['Forearm_'+side];axis=(bone.tail_local-bone.head_local).normalized()
    center=wrist-axis*.012;roi=.13
    bm=bmesh.new();bm.from_mesh(body.data)
    def local(v):
        d=v.co-center;t=d.dot(axis);return t,(d-axis*t).length
    region={v for v in bm.verts if -.08<local(v)[0]<.35 and local(v)[1]<roi}
    faces=[f for f in bm.faces if any(v in region for v in f.verts)]
    edges=list({e for f in faces for e in f.edges});verts=list({v for f in faces for v in f.verts})
    before=len(bm.faces)
    bmesh.ops.bisect_plane(bm,geom=[*verts,*edges,*faces],dist=1e-6,plane_co=center,plane_no=axis,clear_outer=True,clear_inner=False)
    rim=[v for v in bm.verts if abs((v.co-center).dot(axis))<1e-5 and (v.co-center).length<roi]
    assert len(rim)>=8,(body.name,side,'Missing wrist rim',len(rim))
    deform=bm.verts.layers.deform.verify();group=body.vertex_groups['Forearm_'+side].index
    for v in bm.verts:
        axial,radial=local(v)
        if -.025<axial<.0001 and radial<roi:
            v[deform].clear();v[deform][group]=1
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(body.data);bm.free()
    return {'wrist':list(wrist),'cut_center':list(center),'plane_normal':list(axis),'rim_vertices':len(rim),'removed_faces':before-len(body.data.polygons)}


def main():
    p=argparse.ArgumentParser();p.add_argument('--source-run',type=Path,required=True);p.add_argument('--run',type=Path,required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);source=a.source_run.resolve();run=a.run.resolve()
    for f in ('raw','candidate','qa'):(run/f).mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(source/'raw/guard-visual-rework.blend'))
    rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    raw=ROOT/'art-factory/rts/runs/guard-neural-pilot/v2/candidate/guard-neural-uv.obj'
    cloth_faces=set(json.loads((ROOT/'art-factory/rts/runs/guard-neural-pilot/production-v1/candidate/cloth-faces.json').read_bytes()))
    reports=[]
    for lod in (0,1):
        old=bpy.data.objects[f'GuardBody_LOD{lod}'];name=old.name;before=audit(old,rig)
        bpy.ops.wm.obj_import(filepath=str(raw),forward_axis='Y',up_axis='Z');body=bpy.context.object
        low=min(v.co.z for v in body.data.vertices);high=max(v.co.z for v in body.data.vertices);scale=1.86/(high-low)
        for v in body.data.vertices:v.co=transformed_point(v.co,low,scale)
        body.data.materials.clear()
        for material in old.data.materials:body.data.materials.append(material)
        for poly in body.data.polygons:poly.material_index=int(poly.index in cloth_faces);poly.use_smooth=True
        bm=bmesh.new();bm.from_mesh(body.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(body.data);bm.free()
        mod=body.modifiers.new('Weld before LOD','DECIMATE');mod.ratio=min(1,(13000 if lod==0 else 5200)/g.tri_count(body))
        bpy.ops.object.modifier_apply(modifier=mod.name)
        rig.data.pose_position='REST'
        bpy.ops.object.select_all(action='DESELECT');body.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
        bpy.ops.object.parent_set(type='ARMATURE_AUTO',keep_transform=True)
        body.matrix_parent_inverse=Matrix.Identity(4);body.matrix_basis=Matrix.Identity(4);rig.data.pose_position='POSE'
        bpy.context.view_layer.objects.active=body;rig.select_set(False)
        bpy.ops.object.vertex_group_limit_total(limit=4);bpy.ops.object.vertex_group_normalize_all(lock_active=False)
        bpy.data.objects.remove(old,do_unlink=True)
        body.name=name
        cuts={side:trim_cuff(body,rig,side) for side in 'LR'}
        knees=stabilize_knee_patches(body)
        reports.append({'lod':lod,'before':before,'after':audit(body,rig),'cuts':cuts,'stabilized_knee_patches':knees})
    g.set_action(rig,'Idle');bpy.context.scene.frame_set(0)
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(run/'raw/guard-visual-rework.blend'))
    for lod in (0,1):
        objects=[o for o in bpy.data.objects if o.type=='MESH' and o.name.endswith(f'_LOD{lod}')]
        g.export_lod(run/'candidate'/('guard.glb' if lod==0 else 'guard-lod1.glb'),rig,objects)
    (run/'qa/hand-build.json').write_bytes((source/'qa/hand-build.json').read_bytes())
    report={'source_run':str(source),'raw_source':str(raw.relative_to(ROOT)),'raw_sha256':hashlib.sha256(raw.read_bytes()).hexdigest(),
            'bodies':reports,'status':'candidate_requires_visual_review','runtime_publish_allowed':False,'artistic_quality_proven':False}
    (run/'qa/body-restore.json').write_bytes((json.dumps(report,indent=2)+'\n').encode());print(json.dumps(report))


if __name__=='__main__':main()
