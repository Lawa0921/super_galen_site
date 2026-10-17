"""Author contact-driven original joint angles against the actual octagonal grip.

This is a numerical candidate, not a collision or visual acceptance gate.
"""
import json,sys,hashlib
from pathlib import Path
import numpy as np
import trimesh
from scipy.optimize import minimize
from scipy.spatial import ConvexHull
from original_glove_grip_math import deform
from original_glove_grip_clearance import triangle_clearance
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-glove-weapon-fit/2026-10-07-v1'
data=json.loads((RUN/'raw/hand.json').read_text());weapon=json.loads((RUN/'raw/weapon.json').read_text());raw=json.loads((ROOT/'art-factory/rts/runs/original-glove-joints/2026-10-07-v1/raw/joint-surface.json').read_text());points=np.array(data['points']);mesh=trimesh.Trimesh(points,data['faces'],process=False)
names=['Index','Middle','Ring','Little','Thumb'];upper=np.array([[58,84,42],[62,86,43],[64,85,42],[66,83,40],[32,55,40]],float)
part=weapon['parts']['support_grip'];wp=np.array(weapon['points_centered_in_hand_basis']);section=wp[part['vertex_start']:part['vertex_end'],1:];planes=ConvexHull(section).equations;length=weapon['support_length_m']
solid_planes=np.vstack([np.column_stack([np.zeros(len(planes)),planes]),[1,0,0,-length/2],[-1,0,0,-length/2]])
faces=np.array(data['faces'],int)
roots=np.array([data['bones'][name+'1_L']['head'] for name in names[:4]])
axis=np.linalg.svd(roots-roots.mean(axis=0))[2][0]
if axis[0]<0:axis=-axis
depth=np.array([0.,1,0]);depth-=axis*depth.dot(axis);depth/=np.linalg.norm(depth)
grip_rotation=np.column_stack([axis,depth,np.cross(axis,depth)])
previous=json.loads((RUN/'iterations/contact-pads-v5/grip-target.json').read_text())
thumb_bone=data['bones']['Thumb1_L'];thumb_direction=np.array(thumb_bone['tail'])-thumb_bone['head'];thumb_direction/=np.linalg.norm(thumb_direction)
thumb_toward=np.array(previous['support_center_hand_m'])-thumb_bone['head'];thumb_toward-=thumb_direction*thumb_toward.dot(thumb_direction)
thumb_swing_axis=np.cross(thumb_direction,thumb_toward);thumb_swing_axis/=np.linalg.norm(thumb_swing_axis)
pads={}
for name,digit in raw['digits'].items():
    rings=[r for r in digit['rings'] if r['is_joint']]+[digit['rings'][-2]]
    pads[name]=[i for ring in rings for i in sorted(ring['indices'],key=lambda v:points[v,1])[:3]]
thumb=[i for i,w in enumerate(data['weights']) if w.get('Thumb3_L',0)>.75 and mesh.vertex_normals[i,1]>.25]
assert len(thumb)>=3;pads['Thumb']=thumb
palm=[i for i,p in enumerate(points) if -.04<p[0]<.045 and .099<p[2]<.114 and mesh.vertex_normals[i,1]<-.4 and sum(w for name,w in data['weights'][i].items() if name.endswith(('2_L','3_L')))<.2]
assert palm
palm_groups=[[i for i in palm if points[i,0]<0],[i for i in palm if points[i,0]>=0]]
assert all(palm_groups)
for name in names[:4]:
    pads[name]=[i for i,w in enumerate(data['weights']) if w.get(name+'2_L',0)+w.get(name+'3_L',0)>.8 and mesh.vertex_normals[i,1]<-.3]
    assert len(pads[name])>=3

def state(parameters):
    angles={name:parameters[i*3:i*3+3].tolist() for i,name in enumerate(names)};center=np.array([.010,parameters[-2],parameters[-1]]);posed=deform(data,angles,{'Thumb':{'axis':thumb_swing_axis,'degrees':parameters[15]}})
    local=(posed-center)@grip_rotation
    side=(local[:,1:]@planes[:,:2].T+planes[:,2]).max(axis=1)
    cap=np.abs(local[:,0])-length/2;sdf=np.maximum(side,cap)
    return angles,center,posed,sdf

def objective(parameters):
    angles,center,posed,sdf=state(parameters);contacts=[]
    for name,ids in pads.items():
        contacts.extend(np.sort(sdf[ids])[:3])
    pad_error=(np.array(contacts)-.0009)*1000
    # Distal palm is a support region, not three prescribed pressure points.
    palm_error=np.array([max(0,float(np.sort(sdf[group])[:2].mean())-.003)*1000 for group in palm_groups])
    return float(np.mean(pad_error**2)+np.sum(palm_error**2))

def clearance(parameters):
    _,center,posed,_=state(parameters)
    return triangle_clearance((posed-center)@grip_rotation,faces,solid_planes)

starts=[]
for y in np.linspace(-.040,.010,14):
    for z in np.linspace(.095,.130,10):
        p=np.r_[np.zeros(16),y,z];safe=clearance(p)
        if safe.min()>.0008:starts.append((objective(p),p,float(safe.min())))
assert starts,'No feasible open-hand support placement found'
prior=np.r_[np.array([previous['angles_degrees'][name] for name in names]).ravel(),0,previous['support_center_hand_m'][1:]]
if clearance(prior).min()>=.00069:starts.append((objective(prior),prior,float(clearance(prior).min())))
_,initial,initial_margin=min(starts,key=lambda row:row[0]);scale=np.r_[np.full(16,60.),.01,.01]
lower=np.r_[np.zeros(16),-.045,.090]/scale;higher=np.r_[upper.ravel(),30,.025,.145]/scale
result=minimize(lambda x:objective(x*scale),initial/scale,method='SLSQP',bounds=list(zip(lower,higher)),constraints=[{'type':'ineq','fun':lambda x:(clearance(x*scale)-.0007)*1000}],options={'maxiter':240,'ftol':1e-8,'eps':1e-6})
angles,center,posed,sdf=state(result.x*scale);face_margin=float(clearance(result.x*scale).min());feasible=face_margin>=.00069
report={'status':'candidate' if feasible else 'qa_failed','hand_source_sha256':data['source_sha256'],'weapon_source_sha256':weapon['source_sha256'],'angles_degrees':angles,'support_center_hand_m':center.tolist(),'support_rotation_hand_rows':grip_rotation.tolist(),'support_length_m':length,'contact_vertex_ids':pads,'palm_vertex_ids':palm,'vertex_sdf_min_m':float(sdf.min()),'contact_sdf_m':{name:{'min':float(sdf[ids].min()),'max':float(sdf[ids].max()),'mean':float(sdf[ids].mean())} for name,ids in pads.items()},'solver':{'method':'SLSQP explicit skin-vertex nonpenetration from a feasible open pose','cost':float(result.fun),'evaluations':result.nfev,'success':bool(result.success),'message':result.message,'initial_parameters':initial.tolist(),'initial_margin_m':initial_margin,'numerical_feasible':feasible},'scope':'Convex support half-space vertex contact objective only. Not full triangle collision, hand-self collision, continuous motion or character acceptance.','runtime_publish_allowed':False}
report['triangle_separating_face_margin_m']=face_margin
report['root_swings']={'Thumb':{'axis':thumb_swing_axis.tolist(),'degrees':float(result.x[15]*scale[15])}}
report['palm_contact_groups']=palm_groups
report['contact_target']='Nearest three original palmar vertices per digit at 0.9mm; radial/ulnar distal palm nearest-two average <=3mm. Full actual normals required in QA.'
report['solver']['method']='SLSQP conservative per-triangle separating-face hard constraint from feasible open pose'
report['scope']='Support-grip convex separating-face triangle clearance; conservative sufficient exclusion only. Still requires full weapon, self collision, normals and motion QA.'
(RUN/'raw/grip-target.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k not in ['contact_vertex_ids','palm_vertex_ids']}))
assert feasible,'Numerical support penetration remains; candidate rejected'
