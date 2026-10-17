"""Find an actually separated original natural-hand pose before weapon fitting."""
import json,itertools,hashlib
from pathlib import Path
import numpy as np
from scipy.spatial import cKDTree
from original_glove_grip_math import deform
from original_glove_self_contact import triangle_pair_gaps
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-glove-power-grip/2026-10-07-v1'
h=json.loads((RUN/'raw/hand.json').read_text());prior=json.loads((RUN/'raw/previous-grip.json').read_text());faces=np.array(h['faces']);points=np.array(h['points']);rows=[];names=['Index','Middle','Ring','Little'];swing_axis=prior['root_swings']['Thumb']['axis']
def crossings(posed):
    tris=posed[faces];lo=tris.min(axis=1);hi=tris.max(axis=1);centers=tris.mean(axis=1);radius=np.linalg.norm(tris-centers[:,None],axis=2).max()
    pairs=cKDTree(centers).query_pairs(2*radius,output_type='ndarray');pairs=pairs[np.all(lo[pairs[:,0]]<=hi[pairs[:,1]],axis=1)&np.all(lo[pairs[:,1]]<=hi[pairs[:,0]],axis=1)]
    pairs=np.array([p for p in pairs if not set(faces[p[0]])&set(faces[p[1]])],int).reshape(-1,2)
    gaps=triangle_pair_gaps(posed,faces,pairs);bad=pairs[gaps < -1e-8]
    return len(bad),bad[:10].tolist()
for root,pip,spread,thumb_swing in itertools.product([30,35,40],[35,45,55],[6,10,14],[-10,0,10]):
    angles={name:[root,pip,20] for name in names};angles['Thumb']=[20,30,20]
    root_swings={name:{'axis':[0,1,0],'degrees':d} for name,d in zip(names,[3,spread,0,-2])};root_swings['Thumb']={'axis':swing_axis,'degrees':thumb_swing}
    posed=deform(h,angles,root_swings);count,pairs=crossings(posed);rows.append({'angles_degrees':angles,'root_swings':root_swings,'self_sat_crossings':count,'first_pairs':pairs})
passing=[r for r in rows if r['self_sat_crossings']==0]
report={'binding_sha256':hashlib.sha256((RUN/'raw/hand.json').read_bytes()).hexdigest(),'poses':len(rows),'passing':len(passing),'best':sorted(rows,key=lambda x:x['self_sat_crossings'])[:5],'scope':'True triangle SAT broadphase; excludes shared vertices. Blender exact including shared-vertex crossings still required.','runtime_publish_allowed':False}
(RUN/'qa/natural-hand-seeds.json').write_text(json.dumps(report,indent=2)+'\n')
if passing:(RUN/'raw/feasible-hand-seed.json').write_text(json.dumps(passing[0],indent=2)+'\n')
print(json.dumps(report));assert passing
