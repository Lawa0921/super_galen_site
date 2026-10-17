"""Author thumb opening around the real grip; do not interpolate through it."""
import json,sys
from pathlib import Path
import numpy as np
from scipy.spatial import ConvexHull
from original_glove_grip_math import deform
from original_glove_grip_clearance import triangle_clearance
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-glove-weapon-fit/2026-10-07-v1'
h=json.loads((RUN/'raw/hand.json').read_text());w=json.loads((RUN/'raw/weapon.json').read_text());t=json.loads((RUN/'raw/grip-target.json').read_text())
part=w['parts']['support_grip'];wp=np.array(w['points_centered_in_hand_basis']);section=wp[part['vertex_start']:part['vertex_end'],1:];planes=ConvexHull(section).equations;length=w['support_length_m'];solid=np.vstack([np.column_stack([np.zeros(len(planes)),planes]),[1,0,0,-length/2],[-1,0,0,-length/2]])
rows=[]
for opening in [-15,0]:
    for retreat in [[0,y,z] for y in [.005,.010,.020,.030] for z in [0,-.005,-.010]]:
        thumb_curl=1
        margins=[];fail=[]
        for amount in np.linspace(0,1,65):
            angles={name:[a*(amount if name!='Thumb' else thumb_curl*(1-amount)+amount) for a in v] for name,v in t['angles_degrees'].items()}
            swings={name:{'axis':v['axis'],'degrees':v['degrees']*amount+opening*(1-amount)} for name,v in t['root_swings'].items()}
            hand=deform(h,angles,swings)+np.array(retreat)*(1-amount);local=(hand-t['support_center_hand_m'])@np.array(t['support_rotation_hand_rows']);clearance=triangle_clearance(local,np.array(h['faces']),solid);margins.append(float(clearance.min()))
            if clearance.min()<.0004:fail.append({'amount':amount,'triangle':int(clearance.argmin()),'margin_m':float(clearance.min())})
        rows.append({'opening_swing_degrees':opening,'opening_thumb_curl_multiplier':thumb_curl,'opening_hand_offset_m':retreat,'min_margin_m':min(margins),'failed_samples':len(fail),'samples':65,'first_failed':fail[:3]})
passing=[r for r in rows if r['min_margin_m']>=.0004]
report={'rows':rows,'pass':bool(passing),'scope':'Conservative support triangle clearance only; actual full weapon, self and dense Blender required','runtime_publish_allowed':False}
if passing:
    chosen=min(passing,key=lambda r:np.linalg.norm(r['opening_hand_offset_m'])+abs(r['opening_swing_degrees']+15)*.001)
    t['opening_root_swings']={'Thumb':{'axis':t['root_swings']['Thumb']['axis'],'degrees':chosen['opening_swing_degrees']}}
    t['opening_thumb_curl_multiplier']=chosen['opening_thumb_curl_multiplier'];report['chosen']=chosen
    t['opening_hand_offset_m']=chosen['opening_hand_offset_m']
    (RUN/'raw/grip-target.json').write_text(json.dumps(t,indent=2)+'\n')
(RUN/'qa/thumb-opening-scan.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'pass':bool(passing),'passing':passing,'best_failed':sorted(rows,key=lambda r:-r['min_margin_m'])[:2]}))
assert passing,'No safe thumb opening path found'
