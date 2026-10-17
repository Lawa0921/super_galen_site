"""Verify actual merged skin against independent original hand forward kinematics."""
import bpy,json,hashlib,sys,numpy as np
from pathlib import Path
from mathutils import Matrix,Vector
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_attack_probe import activate
from original_glove_deformation import evaluated
from original_glove_grip_math import deform
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-crossbow-articulated-hand/2026-10-07-v1'
source=RUN/'candidate/articulated-connector.blend';bpy.ops.wm.open_mainfile(filepath=str(source));rig=bpy.data.objects['crossbowRig20'];hand=bpy.data.objects['OriginalCrossbowArticulatedHand_L']
author=json.loads((RUN/'qa/attachment-preflight.json').read_text());h=json.loads((ROOT/'art-factory/rts/runs/original-glove-power-grip/2026-10-07-v1/raw/hand.json').read_text());target=json.loads((ROOT/'art-factory/rts/runs/original-glove-weapon-fit/2026-10-07-v1/raw/grip-target.json').read_text());T=Matrix(author['rest_map']);anchor=Matrix(author['source_bones']['Hand_L']['matrix'])
rest_error={n:max(abs((T@Matrix(d['matrix']))[i][j]-rig.data.bones['HandPalm_L' if n=='Hand_L' else n].matrix_local[i][j]) for i in range(4) for j in range(4)) for n,d in author['source_bones'].items()}
point_error=max((v.co-T@Vector(p)).length for v,p in zip(hand.data.vertices,h['points']))
actual_weights=[{('Hand_L' if hand.vertex_groups[g.group].name=='HandPalm_L' else hand.vertex_groups[g.group].name):g.weight for g in v.groups if g.weight>0} for v in hand.data.vertices]
weight_error=max(abs(a.get(n,0)-b.get(n,0)) for a,b in zip(actual_weights,h['weights']) for n in set(a)|set(b))
rows=[]
for clip,frame,amount in [('Idle',0,1),('Attack',8,1),('Attack',25,0),('Death',50,1)]:
    activate(rig,clip,frame)
    angles={n:[v*(amount if n!='Thumb' else target.get('opening_thumb_curl_multiplier',0)*(1-amount)+amount) for v in a] for n,a in target['angles_degrees'].items()}
    swings={n:{'axis':s['axis'],'degrees':s['degrees']*amount+target.get('opening_root_swings',{}).get(n,{'degrees':0})['degrees']*(1-amount)} for n,s in target['root_swings'].items()}
    expected_local=deform(h,angles,swings);M=rig.matrix_world@rig.pose.bones['HandPalm_L'].matrix@anchor.inverted();expected=[M@Vector(p) for p in expected_local];actual,_=evaluated(hand)
    errors=[(p-q).length for p,q in zip(actual,expected)];worst=max(range(len(errors)),key=errors.__getitem__)
    rows.append({'clip':clip,'frame':frame,'max_surface_error_m':max(errors),'worst_vertex':worst,'expected':list(expected[worst]),'actual':list(actual[worst])})
report={'candidate_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'bone_rest_errors':rest_error,'mesh_rest_error_m':point_error,'weight_error':weight_error,'rig_world':[list(r) for r in rig.matrix_world],'hand_world':[list(r) for r in hand.matrix_world],'rows':rows,'pass':max(rest_error.values())<1e-5 and point_error<1e-6 and weight_error<1e-7 and max(r['max_surface_error_m'] for r in rows)<1e-5,'runtime_publish_allowed':False}
(RUN/'qa/skin-transport.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));assert report['pass']
