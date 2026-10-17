"""Reject axial shear that straightens the generated power-grip fingers."""
import argparse,json
from pathlib import Path
import numpy as np
p=argparse.ArgumentParser();p.add_argument('--build',type=Path,required=True);p.add_argument('--report',type=Path,required=True);a=p.parse_args()
data=json.loads(a.build.read_bytes());rows=[];failures=[]
axis=np.array((0,.14,.99));axis/=np.linalg.norm(axis)
toward=np.array((-.06,.275,-.35));toward-=axis*np.dot(toward,axis);toward/=np.linalg.norm(toward)
basis=np.column_stack((axis,toward,np.cross(axis,toward)))
for hand in data['hands']:
    transform=np.array(hand['source_transform']);columns=transform@basis
    scales=np.linalg.norm(columns,axis=0);unit=columns/scales
    shear=float(np.max(np.abs(unit.T@unit-np.eye(3))))
    rows.append({'name':hand['name'],'axis_scales':scales.tolist(),'maximum_axis_shear_cosine':shear})
    if shear>.05:failures.append(hand['name']+': source finger axes are sheared')
    if np.any(np.abs(scales-np.array((.16,.24,.18)))>np.array((.016,.024,.018))):failures.append(hand['name']+': source hand proportions exceed the anatomical fitting envelope')
a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps({'source':str(a.build),'hands':rows,'failures':failures},indent=2)+'\n')
print(json.dumps({'hands':rows,'failures':failures}));assert not failures,'; '.join(failures)
