"""Verify actual exported positions against protected high-poly surface points."""
import hashlib,json
from pathlib import Path
import numpy as np
import trimesh
from scipy.spatial import cKDTree
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-glove-sculpt/2026-10-06-v1'
source=RUN/'candidate/sculpt.glb';data=np.load(RUN/'raw/sculpt-masks.npz')
mesh=trimesh.load(source,force='mesh',process=False);actual=np.asarray(mesh.vertices)[:,[0,2,1]]*np.array([1,-1,1])
tree=cKDTree(actual);before=data['before'];after=data['after'];protected=data['protected']
finger=before[:,2]>=.30
palm=(before[:,0]<.18)&(before[:,1]<=.05)&(before[:,2]>-.50)
rows=[]
for name,mask in [('protected',protected),('fingers_above_root',finger),('main_palm',palm)]:
    assert np.count_nonzero(mask)>100
    authored=np.linalg.norm(after[mask]-before[mask],axis=1)
    distances,_=tree.query(before[mask])
    rows.append({'region':name,'vertices':int(np.count_nonzero(mask)),'authored_max_displacement':float(authored.max()),'actual_glb_max_distance':float(distances.max()),'pass':float(authored.max())==0 and float(distances.max())<1e-6})
all_distance,_=tree.query(after)
report={'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'rows':rows,'all_authored_points_glb_max_distance':float(all_distance.max()),'pass':all(r['pass'] for r in rows) and float(all_distance.max())<1e-6,'scope':'Position preservation/parity only. Does not prove self-intersection freedom, motion or commercial appearance.','runtime_publish_allowed':False}
(RUN/'qa/surface-preservation.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report));assert report['pass']
