"""Original natural-grasp continuation with bounded complete-weapon placement.

Numerical authoring only. Exact self/full-weapon and visual review are separate.
"""
import json,hashlib
from pathlib import Path
import numpy as np
import trimesh
from scipy.optimize import minimize
from scipy.spatial import ConvexHull
from scipy.spatial import cKDTree
from original_glove_grip_math import deform,rotation
from original_glove_grip_clearance import triangle_clearance
from original_glove_self_contact import triangle_pair_gaps
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-glove-power-grip/2026-10-07-v1'
h=json.loads((RUN/'raw/hand.json').read_text());w=json.loads((RUN/'raw/weapon.json').read_text());previous=json.loads((RUN/'raw/previous-grip.json').read_text());points=np.array(h['points']);faces=np.array(h['faces']);mesh=trimesh.Trimesh(points,faces,process=False)
names=['Index','Middle','Ring','Little','Thumb'];upper=np.array([[45,65,35],[45,65,35],[45,65,35],[45,65,35],[32,55,40]],float)
preferred=np.array([[32,60,28],[38,65,30],[40,65,30],[42,65,28],[20,24,15]],float)
part=w['parts']['support_grip'];wp=np.array(w['points_centered_in_hand_basis']);planes=ConvexHull(wp[part['vertex_start']:part['vertex_end'],1:]).equations;length=w['support_length_m'];solid=np.vstack([np.column_stack([np.zeros(len(planes)),planes]),[1,0,0,-length/2],[-1,0,0,-length/2]])
base_rotation=np.array(previous['support_rotation_hand_rows']);swing_axis=np.array(previous['root_swings']['Thumb']['axis']);pads=previous['contact_vertex_ids'];palms=previous['palm_contact_groups']
proximal={name:[i for i,p in enumerate(points) if h['weights'][i].get(name+'1_L',0)>.6 and p[2]>.103 and mesh.vertex_normals[i,1]<-.35] for name in names[:4]}
assert all(proximal.values())
def state(p):
    angles={name:p[i*3:i*3+3].tolist() for i,name in enumerate(names)};center=p[16:19]
    orient=base_rotation@rotation([1,0,0],p[19])@rotation([0,1,0],p[20])@rotation([0,0,1],p[21])
    swings={'Thumb':{'axis':swing_axis,'degrees':p[15]},**{name:{'axis':[0,1,0],'degrees':p[22+i]} for i,name in enumerate(names[:4])}}
    posed=deform(h,angles,swings);local=(posed-center)@orient
    distances=local@solid[:,:3].T+solid[:,3];sdf=distances.max(axis=1)
    return angles,center,orient,posed,local,sdf
def costs(p):
    *_,sdf=state(p)
    contact=np.array([v for ids in pads.values() for v in np.sort(sdf[ids])[:3]])
    pad=float(np.mean(((contact-.0009)*1000)**2))
    palm=float(np.sum([max(0,float(np.sort(sdf[ids])[:2].mean())-.003)**2*1e6 for ids in palms]))
    proximal_cost=float(np.mean([max(0,float(np.sort(sdf[ids])[:2].mean())-.003)**2*1e6 for ids in proximal.values()]))
    authored_pose=float(.02*np.mean(((p[:15].reshape(5,3)-preferred)/30)**2))
    placement=float(.005*np.mean((p[19:22]/20)**2)+.002*np.mean((p[22:]/15)**2))
    return {'distal_pad':pad,'distal_palm':palm,'proximal_pad':proximal_cost,'authored_pose':authored_pose,'placement':placement}
def safe(p):return triangle_clearance(state(p)[4],faces,solid)
def nearby_pairs(posed):
    triangles=posed[faces];lo=triangles.min(axis=1);hi=triangles.max(axis=1);centers=triangles.mean(axis=1);radii=np.linalg.norm(triangles-centers[:,None],axis=2).max(axis=1)
    pairs=cKDTree(centers).query_pairs(2*float(radii.max())+.001,output_type='ndarray')
    pairs=pairs[np.all(lo[pairs[:,0]]<=hi[pairs[:,1]]+.001,axis=1)&np.all(lo[pairs[:,1]]<=hi[pairs[:,0]]+.001,axis=1)]
    return np.array([p for p in pairs if not set(faces[p[0]])&set(faces[p[1]])],int).reshape(-1,2)
seed=json.loads((RUN/'qa/natural-hand-seeds.json').read_text())['best'][0]
initial=np.r_[np.array([seed['angles_degrees'][name] for name in names]).ravel(),seed['root_swings']['Thumb']['degrees'],[.01,-.06,.11],[0,0,0],[seed['root_swings'][name]['degrees'] for name in names[:4]]]
active=set()
def add_near(p):
    posed=state(p)[3];pairs=nearby_pairs(posed);gaps=triangle_pair_gaps(posed,faces,pairs)
    found={tuple(pair) for pair,gap in zip(pairs,gaps) if gap < -1e-8};new=found-active;active.update(found);return len(new)
add_near(initial)
scale=np.r_[np.full(16,60.),np.full(3,.01),np.full(7,20.)]
rows=[]
for attempt in range(4):
    minimum=30;active_pairs=np.array(sorted(active),int)
    # Cutting planes are added for actual intersecting faces, not nearby
    # same-surface tessellation. Exact Blender/GLB zero-crossing gates remain.
    rest_gaps=triangle_pair_gaps(points,faces,active_pairs)
    assert rest_gaps.min()>0
    required_gaps=np.minimum(.00001,rest_gaps*.1)
    lower_angles=np.zeros((5,3));lower_angles[:4,0]=minimum;lower_angles[:4,1]=30;lower_angles[:4,2]=10;lower_angles[4,1]=minimum/2;lower_angles[4,2]=minimum/6
    lower=np.r_[lower_angles.ravel(),-30,[-.02,-.08,.075],[-20,-20,-20],[-5,0,-10,-15]]/scale
    higher=np.r_[upper.ravel(),30,[.03,.035,.14],[20,20,20],[15,20,5,5]]/scale
    constraints=[{'type':'ineq','fun':lambda x:(safe(x*scale)-.0007)*1000},{'type':'ineq','fun':lambda x:(triangle_pair_gaps(state(x*scale)[3],faces,active_pairs)-required_gaps)*1000}]
    if attempt==0:
        seed_parameters=initial/scale
        restore=minimize(lambda x:float(np.sum((x-seed_parameters)**2)),seed_parameters,method='SLSQP',bounds=list(zip(lower,higher)),constraints=constraints,options={'maxiter':240,'ftol':1e-10,'eps':1e-6})
        initial=restore.x*scale
        print(json.dumps({'feasible_start_restore':bool(restore.success),'message':restore.message,'weapon_margin_m':float(safe(initial).min()),'self_residual_m':float((triangle_pair_gaps(state(initial)[3],faces,active_pairs)-required_gaps).min())}),flush=True)
    result=minimize(lambda x:sum(costs(x*scale).values()),initial/scale,method='SLSQP',bounds=list(zip(lower,higher)),constraints=constraints,options={'maxiter':320,'ftol':1e-8,'eps':1e-6})
    p=result.x*scale;angles,center,orient,posed,local,sdf=state(p);margin=float(safe(p).min());pair_gaps=triangle_pair_gaps(posed,faces,active_pairs);self_margin=float(pair_gaps.min());feasible=margin>=.00069 and bool(np.all(pair_gaps>=required_gaps-1e-8))
    report={'status':'candidate' if feasible else 'qa_failed','hand_source_sha256':h['source_sha256'],'weapon_source_sha256':w['source_sha256'],'angles_degrees':angles,'support_center_hand_m':center.tolist(),'support_rotation_hand_rows':orient.tolist(),'support_length_m':length,'contact_vertex_ids':pads,'palm_contact_groups':palms,'palm_vertex_ids':sum(palms,[]),'proximal_contact_vertex_ids':proximal,'root_swings':{'Thumb':{'axis':swing_axis.tolist(),'degrees':float(p[15])}},'triangle_separating_face_margin_m':margin,'vertex_sdf_min_m':float(sdf.min()),'contact_sdf_nearest3_m':{name:np.sort(sdf[ids])[:3].tolist() for name,ids in pads.items()},'solver':{'method':'SLSQP proximal-flexion continuation and bounded rigid weapon placement','minimum_mcp_degrees':minimum,'success':bool(result.success),'message':result.message,'evaluations':result.nfev,'costs':costs(p),'parameters':p.tolist(),'numerical_feasible':feasible},'scope':'Actual support convex triangle separation only. Requires true contact normals, self/full-weapon collisions, motion and art review.','runtime_publish_allowed':False}
    report['root_swings'].update({name:{'axis':[0,1,0],'degrees':float(p[22+i])} for i,name in enumerate(names[:4])})
    report['self_contact_constraints']={'pairs':active_pairs.tolist(),'minimum_gap_m':self_margin,'required_gaps_m':required_gaps.tolist(),'scope':'Cutting planes for actual crossing triangle pairs, excluding shared vertices. Margin min(10um,0.1 original rest gap). No new SAT crossings allowed; final full Blender/GLB BVH gates unchanged.'}
    (RUN/f'iterations/sat-{attempt:02d}.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'attempt':attempt,'active_pairs':len(active_pairs),'self_margin_m':self_margin,'minimum_mcp':minimum,'feasible':feasible,'margin_m':margin,'costs':costs(p),'success':bool(result.success),'angles':angles,'center':center.tolist(),'rotation_delta':p[19:].tolist()}),flush=True)
    rows.append({'minimum_mcp':minimum,'feasible':feasible,'costs':costs(p),'margin_m':margin})
    if not feasible:break
    initial=p
    if add_near(p)==0:break
(RUN/'qa/pose-continuation.json').write_text(json.dumps({'rows':rows,'runtime_publish_allowed':False},indent=2)+'\n')
(RUN/'raw/grip-target.json').write_text(json.dumps(report,indent=2)+'\n')
assert feasible and minimum==30,'Natural-grasp continuation remains infeasible'
