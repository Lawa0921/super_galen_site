"""One smooth original corrective pose across the attack, not per-frame fitting."""
import bpy,json,sys,hashlib,numpy as np
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_attack_probe import activate
from original_crossbow_carry_build import put_keys
from original_crossbow_cuff_corrective_math import area_jacobian
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-crossbow-cuff-motion/2026-10-07-v1';SOURCE=RUN/'candidate/cuff-bands.blend'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['crossbowRig20'];activate(rig,'Idle',0)
def points(obj):
    e=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh();p=np.empty(len(m.vertices)*3,dtype=np.float32);m.vertices.foreach_get('co',p);e.to_mesh_clear();return p.reshape(-1,3).astype(float)
def smooth(t):
    t=max(0.,min(1.,t));return t*t*(3-2*t)
def amount(frame):return smooth(frame/4)*(1-smooth((frame-34)/6))
prepared={};captured={};frames=np.arange(321)/8;env=np.array([amount(f) for f in frames]);rows=[]
for lod in (0,1):
    obj=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];mesh=obj.data;mesh.calc_loop_triangles();mark=mesh.attributes['ArticulatedCuffFace']
    tri=np.array([list(t.vertices) for t in mesh.loop_triangles if mark.data[t.polygon_index].value==1]);names=[f'CuffBand{k}_LOD{lod}_L' for k in (1,2,3)];ids=np.unique(tri);reverse={i:j for j,i in enumerate(ids)};tri=np.vectorize(reverse.get)(tri)
    group=np.full(len(ids),-1,dtype=int)
    for j,i in enumerate(ids):
        for g in mesh.vertices[int(i)].groups:
            name=obj.vertex_groups[g.group].name
            if g.weight>.999 and name in names:group[j]=names.index(name)
    base=points(obj)[ids];ref=area_jacobian(base,tri,group,3)[0]
    prepared[lod]={'obj':obj,'ids':ids,'tri':tri,'names':names,'group':group,'reference':ref,'poses':[],'rotations':[]}
for frame in frames:
    activate(rig,'Attack',frame);captured[float(frame)]={'Root':rig.pose.bones['Root'].matrix.copy()}
    for data in prepared.values():
        data['poses'].append(points(data['obj'])[data['ids']]);data['rotations'].append([np.asarray(rig.pose.bones[n].matrix.to_3x3()) for n in data['names']])
        for n in data['names']:captured[float(frame)][n]=rig.pose.bones[n].matrix.copy()
for lod,d in prepared.items():
    poses=np.array(d['poses']);R=np.array(d['rotations']);N,V,_=poses.shape;T=len(d['tri']);tri=np.concatenate([d['tri']+i*V for i in range(N)]);groups=np.tile(d['group'],N);reference=np.tile(d['reference'],N);valid=d['group']>=0;delta=np.zeros((3,3));history=[]
    for iteration in range(64):
        p=poses.copy();shift=np.einsum('ngcd,gd->ngc',R,delta)*env[:,None,None];p[:,valid]+=shift[:,d['group'][valid]]
        area,jac=area_jacobian(p.reshape(-1,3),tri,groups,3);ratio=area/reference;target=np.clip(ratio,.33,3.6);active=np.abs(ratio-target)>1e-5
        history.append([float(ratio.min()),float(ratio.max())])
        if not active.any():break
        J=np.einsum('ntgc,ngcd->ntgd',jac.reshape(N,T,3,3),R)*env[:,None,None,None];J=(J.reshape(-1,9)/reference[:,None])[active]
        error=(target-ratio)[active];J=np.vstack((J,np.eye(9)*3));error=np.r_[error,-delta.ravel()*3]
        step=np.linalg.lstsq(J,error,rcond=None)[0].reshape(3,3);length=np.linalg.norm(step,axis=1);step*=np.minimum(1.,.001/np.maximum(length,1e-12))[:,None];delta+=step
        length=np.linalg.norm(delta,axis=1);delta*=np.minimum(1.,.015/np.maximum(length,1e-12))[:,None]
    for index,frame in enumerate(frames):
        for name,offset,rotation in zip(d['names'],delta,R[index]):captured[float(frame)][name].translation+=Vector(rotation@offset*env[index])
    rows.append({'lod':lod,'constant_local_offsets_m':delta.tolist(),'maximum_offset_m':float(np.linalg.norm(delta,axis=1).max()),'iterations':len(history),'predicted_area_min':history[-1][0],'predicted_area_max':history[-1][1]})
activate(rig,'Attack',0);put_keys(rig,bpy.data.actions['Attack'],captured,{n for d in prepared.values() for n in d['names']});activate(rig,'Idle',0)
output=RUN/'iterations/cuff-pose-corrected.blend';bpy.ops.wm.save_as_mainfile(filepath=str(output))
report={'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'candidate_sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'records':rows,'envelope':'Smooth in over frames 0-4, hold through 34, smooth out through 40; one constant local corrective pose per LOD.','runtime_publish_allowed':False}
(RUN/'qa/pose-corrective-authoring.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n');print(json.dumps(report))
