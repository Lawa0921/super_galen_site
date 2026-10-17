"""Author original co-rotating cuff sections, preserving the original motion."""
import bpy,json,sys,hashlib,numpy as np
from pathlib import Path
from mathutils import Matrix,Vector
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_attack_probe import activate
from original_crossbow_carry_build import put_keys
from original_crossbow_cuff_frame import rigid_fit
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-crossbow-cuff-motion/2026-10-07-v1'
SOURCE=RUN/'raw/cuff-contour.blend'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['crossbowRig20'];activate(rig,'Idle',0)
def points(obj):
    e=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh();p=np.empty(len(m.vertices)*3,dtype=np.float32);m.vertices.foreach_get('co',p);e.to_mesh_clear();return p.reshape(-1,3).astype(float)
prepared={};binds={};palm0=rig.pose.bones['HandPalm_L'].matrix.copy()
for lod in (0,1):
    obj=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];p=points(obj);mesh=obj.data;mark=mesh.attributes['ArticulatedCuff'];fm=mesh.attributes['ArticulatedCuffFace'];palm=obj.vertex_groups['HandPalm_L'].index
    strip={i for f in mesh.polygons if fm.data[f.index].value==1 for i in f.vertices}
    cut=sorted(i for i in strip if mark.data[i].value==0);end=sorted(i for i in strip if mark.data[i].value==2)
    c0=Vector(p[cut].mean(axis=0));c4=Vector(p[end].mean(axis=0));bands={}
    for band,weight in [(1,.15625),(2,.5),(3,.84375)]:
        ids=[v.index for v in mesh.vertices if mark.data[v.index].value==1 and any(g.group==palm and abs(g.weight-weight)<1e-6 for g in v.groups)]
        assert len(ids)==len(cut)
        name=f'CuffBand{band}_LOD{lod}_L';center=Vector(p[ids].mean(axis=0));binds[name]=Matrix.Translation(center);bands[name]=(ids,band/4,center)
    prepared[lod]=(obj,p,cut,c0,c4,bands)
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
for name,M in binds.items():
    b=rig.data.edit_bones.new(name);b.head=M.translation;b.tail=M@Vector((0,.025,0));b.matrix=M;b.parent=rig.data.edit_bones['Root']
bpy.ops.object.mode_set(mode='OBJECT');residual={lod:0. for lod in prepared};captured_all={}
for clip in ['Idle','Walk','Attack','Hurt','Death']:
    action=activate(rig,clip,0);captured={}
    for i in range(round(action.frame_range[1])*8+1):
        frame=i/8;activate(rig,clip,frame);D4=rig.pose.bones['HandPalm_L'].matrix@palm0.inverted();matrices={'Root':rig.pose.bones['Root'].matrix.copy()}
        for lod,(obj,p,cut,c0,c4,bands) in prepared.items():
            D0,error=rigid_fit(p[cut],points(obj)[cut]);D0=Matrix(D0.tolist());residual[lod]=max(residual[lod],error)
            for name,(ids,t,center) in bands.items():
                q=D0.to_quaternion().slerp(D4.to_quaternion(),t)
                offset=center-c0.lerp(c4,t);location=(D0@c0).lerp(D4@c4,t)+q@offset
                matrices[name]=Matrix.LocRotScale(location,q,Vector((1,1,1)))
        captured[frame]=matrices
    captured_all[clip]=captured
for clip,captured in captured_all.items():
    action=activate(rig,clip,0);put_keys(rig,action,captured,set(binds))
activate(rig,'Idle',0);rows=[]
for lod,(obj,p,cut,c0,c4,bands) in prepared.items():
    for name,(ids,t,center) in bands.items():
        for group in obj.vertex_groups:group.remove(ids)
        group=obj.vertex_groups.new(name=name);group.add(ids,1.,'REPLACE')
        for i in ids:obj.data.vertices[i].co=Vector(p[i])
    obj.data.update();error=float(np.linalg.norm(points(obj)-p,axis=1).max());assert error<1e-5
    rows.append({'lod':lod,'idle_max_error_m':error,'maximum_cut_rigid_fit_residual_m':residual[lod]})
output=RUN/'candidate/cuff-bands.blend';bpy.ops.wm.save_as_mainfile(filepath=str(output))
report={'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'candidate_sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'bones':len(rig.data.bones),'records':rows,'runtime_publish_allowed':False}
(RUN/'qa/band-authoring.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n');print(json.dumps(report))
