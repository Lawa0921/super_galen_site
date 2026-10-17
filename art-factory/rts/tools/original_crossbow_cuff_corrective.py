"""Bounded pose corrections of original cuff rings; no body or hand changes."""
import bpy,json,sys,hashlib,numpy as np
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_attack_probe import activate
from original_crossbow_carry_build import put_keys
from original_crossbow_cuff_corrective_math import area_jacobian,correct
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-crossbow-cuff-motion/2026-10-07-v1';SOURCE=RUN/'candidate/cuff-bands.blend'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['crossbowRig20'];activate(rig,'Idle',0)
def points(obj):
    e=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh();p=np.empty(len(m.vertices)*3,dtype=np.float32);m.vertices.foreach_get('co',p);e.to_mesh_clear();return p.reshape(-1,3).astype(float)
prepared={}
for lod in (0,1):
    obj=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];mesh=obj.data;mesh.calc_loop_triangles();mark=mesh.attributes['ArticulatedCuffFace']
    tri=np.array([list(t.vertices) for t in mesh.loop_triangles if mark.data[t.polygon_index].value==1]);names=[f'CuffBand{k}_LOD{lod}_L' for k in (1,2,3)]
    groups=np.full(len(mesh.vertices),-1,dtype=int)
    for v in mesh.vertices:
        for g in v.groups:
            name=obj.vertex_groups[g.group].name
            if g.weight>.999 and name in names:groups[v.index]=names.index(name)
    reference,_=area_jacobian(points(obj),tri,groups,3);prepared[lod]=(obj,tri,names,groups,reference)
all_captured={};rows=[]
for clip in ['Idle','Walk','Attack','Hurt','Death']:
    action=activate(rig,clip,0);captured={};prior={lod:None for lod in prepared};previous={}
    for sample in range(round(action.frame_range[1])*8+1):
        frame=sample/8;activate(rig,clip,frame);matrices={'Root':rig.pose.bones['Root'].matrix.copy()}
        for lod,(obj,tri,names,groups,reference) in prepared.items():
            delta,history=correct(points(obj),tri,groups,reference,prior[lod]);prior[lod]=delta
            speed=float(np.linalg.norm(delta-previous[lod],axis=1).max()*192) if lod in previous else 0.;previous[lod]=delta.copy()
            for name,offset in zip(names,delta):
                M=rig.pose.bones[name].matrix.copy();M.translation+=Vector(offset);matrices[name]=M
            rows.append({'clip':clip,'frame':frame,'lod':lod,'max_offset_m':float(np.linalg.norm(delta,axis=1).max()),'offset_speed_m_s':speed,'ratio_min':history[-1][0],'ratio_max':history[-1][1]})
        captured[frame]=matrices
    all_captured[clip]=captured
for clip,captured in all_captured.items():
    action=activate(rig,clip,0);put_keys(rig,action,captured,{n for data in prepared.values() for n in data[2]})
activate(rig,'Idle',0);output=RUN/'iterations/cuff-corrected.blend';bpy.ops.wm.save_as_mainfile(filepath=str(output))
report={'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'candidate_sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'rows':rows,'maximum_offset_m':max(r['max_offset_m'] for r in rows),'maximum_offset_speed_m_s':max(r['offset_speed_m_s'] for r in rows),'runtime_publish_allowed':False}
(RUN/'qa/corrective-authoring.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n');print(json.dumps({k:v for k,v in report.items() if k!='rows'}))
