"""Author an original thumb/index precision grip in the existing hand rig."""
import json,math
from pathlib import Path
import numpy as np
from scipy.spatial.transform import Rotation
from scipy.optimize import least_squares
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-crossbow-complete/2026-10-07-v2'
source=json.loads((ROOT/'art-factory/rts/runs/original-crossbow-articulated-hand/2026-10-07-v1/qa/attachment-preflight.json').read_text())['source_bones']
def finger(name,angles,swing):
    head=np.array(source[name+'1_L']['matrix'])[:3,3].copy()
    turn=Rotation.from_rotvec(np.array((0.,0.,1.))*math.radians(swing))
    points=[head.copy()]
    for i,angle in enumerate(angles,1):
        bone=source[f'{name}{i}_L'];turn=turn*Rotation.from_rotvec(np.array(bone['axis'])*math.radians(angle))
        q=turn*Rotation.from_matrix(np.array(bone['matrix'])[:3,:3]);head=head+q.apply((0,bone['length'],0));points.append(head.copy())
    return np.array(points)
# The pad centres oppose across an 11 mm gap. The small original shaft goes
# between the glove pads; surface clearance is a separate evaluated-mesh gate.
targets={'Index':np.array((.042,-.014,.118)),'Thumb':np.array((.054,-.014,.118))}
rows={}
for name,seed in [('Index',[15,65,25,0]),('Thumb',[15,12,5,0])]:
    def error(x):
        points=finger(name,x[:3],x[3]);return np.r_[(points[-1]-targets[name])*1000,(x-np.array(seed))*.018]
    result=least_squares(error,seed,bounds=([0,0,0,-25],[85,100,75,25]),xtol=1e-12,ftol=1e-12,gtol=1e-12,max_nfev=1000)
    points=finger(name,result.x[:3],result.x[3]);gap=float(np.linalg.norm(points[-1]-targets[name]))
    rows[name]={'angles_degrees':result.x[:3].tolist(),'swing_z_degrees':float(result.x[3]),'points':points.tolist(),'endpoint_target_error_m':gap}
contact=(targets['Index']+targets['Thumb'])/2
report={'status':'candidate','authorship':'Original numeric pose authored on original hand; no stock animation',
        'contact_source':contact.tolist(),'fingers':rows,'surface_contact_approved':False,'runtime_publish_allowed':False}
(RUN/'raw/pinch-layout.json').write_text(json.dumps(report,indent=2)+'\n',newline='\n')
print(json.dumps(report))
assert max(r['endpoint_target_error_m'] for r in rows.values())<.001,'Precision grip target is not reached'
