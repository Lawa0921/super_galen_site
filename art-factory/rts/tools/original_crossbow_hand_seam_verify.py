"""Actual cap containment and animated local cuff deformation evidence."""
import bpy,json,sys,hashlib,numpy as np
from pathlib import Path
from collections import Counter
from mathutils import Vector,Matrix
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_attack_probe import activate
from original_glove_deformation import evaluated
from original_crossbow_interface_probe import winding
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-crossbow-articulated-hand/2026-10-07-v1';source=RUN/'candidate/articulated-connector.blend'
bpy.ops.wm.open_mainfile(filepath=str(source));rig=bpy.data.objects['crossbowRig20'];activate(rig,'Idle',0);hand=bpy.data.objects['OriginalCrossbowArticulatedHand_L'];hp,hf=evaluated(hand)
counts=Counter(tuple(sorted((a,b))) for f in hf for a,b in zip(f,f[1:]+f[:1]));edges=[e for e,n in counts.items() if n==1];boundary={i for e in edges for i in e};assert len(edges)==len(boundary)==37
center=sum((hp[i] for i in boundary),Vector())/37;closed=hp+[center];closed_faces=list(hf)
for a,b in edges:
    face=next(f for f in hf if a in f and b in f)
    if any(x==a and y==b for x,y in zip(face,face[1:]+face[:1])):a,b=b,a
    closed_faces.append((a,b,len(hp)))
anchor=Matrix(json.loads((RUN/'qa/attachment-preflight.json').read_text())['source_bones']['Hand_L']['matrix']);M=rig.pose.bones['HandPalm_L'].matrix@anchor.inverted();inv=M.inverted()
local_hand=[inv@p for p in hp];moving={v.index for v in hand.data.vertices if sum(g.weight for g in v.groups if hand.vertex_groups[g.group].name!='HandPalm_L')>1e-7}
moving_face_vertices={i for f in hf if any(v in moving for v in f) for i in f};wrist_ids=set(range(len(hp)))-moving_face_vertices
minimum_moving_surface_z=1.
records=[];prepared={}
for lod in (0,1):
    body=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];bp,bf=evaluated(body);mark=body.data.attributes['ArticulatedCuff'];face_mark=body.data.attributes['ArticulatedCuffFace'];body.data.calc_loop_triangles()
    cap={i for i,v in enumerate(mark.data) if v.value in (2,3)};ring={i for i,v in enumerate(mark.data) if v.value==2}
    cap_faces=[f for f in bf if set(f)<=cap];cap_edges={tuple(sorted(e)) for f in cap_faces for e in zip(f,f[1:]+f[:1])}
    samples=[bp[i] for i in cap]+[bp[i].lerp(bp[j],t) for i,j in cap_edges for t in (.25,.5,.75)]+[sum((bp[i] for i in f),Vector())/3 for f in cap_faces]
    values=[abs(winding(p,closed,closed_faces)) for p in samples];outside=sum(v<.99 for v in values)
    section=[tuple(t.vertices) for t in body.data.loop_triangles if face_mark.data[t.polygon_index].value]
    def area(points,tri):a,b,c=(points[i] for i in tri);return (b-a).cross(c-a).length*.5
    area0=[area(bp,f) for f in section];assert min(area0)>1e-12
    assert all(sum(g.weight for g in body.data.vertices[i].groups if body.vertex_groups[g.group].name!='HandPalm_L')<1e-7 for i in cap)
    row={'lod':lod,'cap_vertices':len(cap),'containment_samples':len(samples),'outside_cap_samples':outside,'minimum_winding':min(values),'cap_max_local_z_m':max((inv@bp[i]).z for i in cap),'max_cap_motion_error_m':0.,'area_ratio_min':1.,'area_ratio_max':1.,'minimum_area_m2':min(area0),'dense_poses':0}
    records.append(row);prepared[lod]=(body,cap,{i:inv@bp[i] for i in cap},section,area0,row)
for clip in ['Idle','Walk','Attack','Hurt','Death']:
    action=activate(rig,clip,0)
    for sample in range(round(action.frame_range[1])*8+1):
        activate(rig,clip,sample/8);M=rig.pose.bones['HandPalm_L'].matrix@anchor.inverted();inv=M.inverted()
        hp,_=evaluated(hand);minimum_moving_surface_z=min(minimum_moving_surface_z,min((inv@hp[i]).z for i in moving_face_vertices))
        for lod,(body,cap,local0,section,area0,row) in prepared.items():
            p,_=evaluated(body);error=max(((inv@p[i])-local0[i]).length for i in cap);areas=[area(p,f) for f in section];ratios=[a/b for a,b in zip(areas,area0)]
            row['max_cap_motion_error_m']=max(row['max_cap_motion_error_m'],error);row['area_ratio_min']=min(row['area_ratio_min'],min(ratios));row['area_ratio_max']=max(row['area_ratio_max'],max(ratios));row['minimum_area_m2']=min(row['minimum_area_m2'],min(areas));row['dense_poses']+=1
report={'candidate_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'rows':records,'rigid_hand_wrist_vertices':len(wrist_ids),'minimum_moving_hand_surface_local_z_m':minimum_moving_surface_z,'pass':minimum_moving_surface_z>max(r['cap_max_local_z_m'] for r in records)+.001 and all(r['outside_cap_samples']==0 and r['max_cap_motion_error_m']<1e-5 and r['area_ratio_min']>.25 and r['area_ratio_max']<4 and r['minimum_area_m2']>1e-12 for r in records),'scope':'Complete cap vertices, quarter edge samples and face centroids against the actual glove closed only at its original 37-edge wrist for winding QA. Cap is palm-rigid; 1589 actual poses establish cap-relative invariance and separation from every nonrigid hand triangle. Four connecting bands retain their physical sleeve-to-hand transition and are checked for area collapse; their intentional wrist overlap is not equivalent to whole-character self-contact approval.','runtime_publish_allowed':False}
(RUN/'qa/seam.json').write_text(json.dumps(report,indent=2)+'\n');print('SEAM',json.dumps(report));assert report['pass']
