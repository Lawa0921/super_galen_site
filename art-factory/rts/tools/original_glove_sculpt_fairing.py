"""Prepare a connected dorsal correction from immutable v3 pre-sculpt positions."""
import hashlib,json
from pathlib import Path
import numpy as np
import trimesh
from scipy.spatial import cKDTree
from original_glove_surface_fairing import fair_patch

ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-glove-sculpt/2026-10-06-v1'
BASE=RUN/'iterations/rejected-normal-gated-band-v3'
artifact=BASE/'candidate/sculpt.glb'
assert hashlib.sha256(artifact.read_bytes()).hexdigest()=='d54401cf0e909dba7d06085b30a187bd915186a1004b595d134c24f9c8c4ca86'
data=np.load(BASE/'raw/sculpt-masks.npz');before=data['before']
mesh=trimesh.load(artifact,force='mesh',process=False)
actual=np.asarray(mesh.vertices)[:,[0,2,1]]*np.array([1,-1,1])
distance,indices=cKDTree(data['after']).query(actual)
assert len(actual)==len(before) and distance.max()<1e-6 and len(np.unique(indices))==len(before)
faces=indices[np.asarray(mesh.faces)]
assert faces.shape==(499957,3)
# The pinned GLB supplies the solver's triangles. The NPZ supplies positions;
# it contains no faces and is not evidence of independent topology parity.
x,y,z=before.T
# Connected, rounded patch including the former overhang and its upper groove.
# The broad perimeter is outside that defect; palm and fingers stay fixed.
roi=(np.abs((x+.175)/.42)**6+np.abs((z+.075)/.19)**6<1)&(y>.115)
after,info=fair_patch(before,faces,roi)
free=info.pop('free_mask')
assert info['max_displacement']<.18
assert np.array_equal(before[~free],after[~free])
np.savez_compressed(RUN/'raw/dorsal-fairing.npz',before=before,after=after,free=free)
report={'method':'connected XYZ biharmonic fairing with position-fixed collar; transition bending is penalized, not an exact normal constraint',
    'source_sha256':'8c4962dd9f9789252c959f2e113a0459862cb8771cc85639a20608b9330895f9',
    'topology_source_sha256':hashlib.sha256(artifact.read_bytes()).hexdigest(),
    'pre_sculpt_positions_sha256':hashlib.sha256(before.tobytes()).hexdigest(),
    'input_map_max_error':float(distance.max()),'position_mapping_bijective':True,'solver_triangles':len(faces),'roi_vertices':int(roi.sum()),
    'outside_roi_displacement':0.0,**info,'runtime_publish_allowed':False}
(RUN/'qa/dorsal-fairing.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report))
