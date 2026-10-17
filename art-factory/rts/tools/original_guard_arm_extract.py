"""Fit a right elbow/wrist test cage to the accepted original high-poly surface.

No smoothing, volumetric remeshing, inferred full shoulder or hand construction.
The closed end caps are QA cuts, not production anatomy.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
import trimesh
from source_fit_cage import select_local_loop, contour_resample, align_ring, capped_ring_mesh

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT/'art-factory/rts/runs/original-guard-arm-cage/2026-10-05'
SOURCE = ROOT/'art-factory/rts/runs/original-guard-shape/2026-10-05/candidate/candidate-body.glb'


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes((json.dumps(data, indent=2)+'\n').encode('utf-8'))


def line_distances(points, ring):
    a=ring; b=np.roll(ring,-1,axis=0); edge=b-a
    p=points[:,None,:]-a[None,:,:]
    t=np.clip(np.sum(p*edge[None,:,:],axis=2)/np.sum(edge*edge,axis=1),0,1)
    d=np.linalg.norm(p-t[:,:,None]*edge[None,:,:],axis=2)
    return np.min(d,axis=1)


def main():
    source_hash=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    assert source_hash=='b2a94ddd3c7f66ea8e1edf993fce13ce4c24a795b9106076648e773ebffecdfd'
    mesh=trimesh.load(SOURCE,force='mesh',process=False)
    p=mesh.vertices.copy(); ground=float(p[:,1].min()); scale=1.86/np.ptp(p[:,1])
    mesh.vertices=np.column_stack((-p[:,0]*scale,p[:,2]*scale,(p[:,1]-ground)*scale))
    a=np.array([.29,.02,1.42]); b=np.array([.42,.025,1.025]); axis=(b-a)/np.linalg.norm(b-a)
    ts=np.round(np.arange(.25,1.00001,.025),6)
    rings=[]; centers=[]; residuals=[]; original_loops=[]
    for t in ts:
        hint=a*(1-t)+b*t
        section=mesh.section(plane_origin=hint,plane_normal=axis)
        loop=select_local_loop(section.discrete,hint,axis,.22,.105)
        center=(loop.min(axis=0)+loop.max(axis=0))/2
        center-=np.dot(center-hint,axis)*axis
        assert center[0]>=.24
        ring=contour_resample(loop,center,axis,32)
        if rings:
            ring=align_ring(rings[-1],ring)
        rings.append(ring); centers.append(center); original_loops.append(loop)
        error=line_distances(loop,ring)
        residuals.append({'t':float(t),'source_points':len(loop),'source_to_ring_max_m':float(error.max()),'source_to_ring_rms_m':float(np.sqrt(np.mean(error**2)))})
    # Mid-section errors expose loss between rings, not just fitted vertices.
    for i in range(len(ts)-1):
        t=(ts[i]+ts[i+1])/2; hint=a*(1-t)+b*t
        loop=select_local_loop(mesh.section(plane_origin=hint,plane_normal=axis).discrete,hint,axis,.22,.105)
        error=line_distances(loop,(rings[i]+rings[i+1])/2)
        residuals.append({'t':float(t),'between_rings':True,'source_points':len(loop),'source_to_ring_max_m':float(error.max()),'source_to_ring_rms_m':float(np.sqrt(np.mean(error**2)))})
    verts,faces=capped_ring_mesh(rings)
    arm=trimesh.Trimesh(vertices=verts,faces=np.array([tri for f in faces for tri in ([f] if len(f)==3 else [[f[0],f[1],f[2]],[f[0],f[2],f[3]]])]),process=False)
    # The right-arm section axis points shoulder -> wrist; winding follows this axis.
    assert arm.is_watertight and arm.is_winding_consistent and arm.volume>0
    data={'status':'geometry_method_candidate','runtime_publish_allowed':False,
          'source':str(SOURCE.relative_to(ROOT)).replace('\\','/'),'source_sha256':source_hash,
          'canonical_transform':{'scale':float(scale),'ground_native_y':ground,'formula':'(-nativeX, nativeZ, nativeY-ground)*scale'},
          'axis':axis.tolist(),'ts':ts.tolist(),'centers':np.asarray(centers).tolist(),'ring_size':32,
          'vertices':verts,'faces':faces,'elbow_t':.475,
          'elbow_design_note':'Provisional local hinge at source-derived ring .475; anatomy/articulation still requires visual review.',
          'qa_cuts':'Upper arm starts below fused armpit; lower cap at wrist. Neither cap is a production seam.',
          'source_residuals':residuals,
          'mechanical':{'vertices':len(verts),'quads':sum(len(f)==4 for f in faces),'triangles':len(arm.faces),'watertight':bool(arm.is_watertight),'winding_consistent':bool(arm.is_winding_consistent),'volume_m3':float(arm.volume),
                        'source_max_residual_m':max(r['source_to_ring_max_m'] for r in residuals)},
          'tools_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__),Path(__file__).with_name('source_fit_cage.py')]}}
    write_json(RUN/'candidate/source-fit-arm.json',data)
    # Preserve exact source triangles in the local region for side-by-side QA.
    station=((mesh.vertices-a)@axis)/np.linalg.norm(b-a)
    mask=(station>=ts[0])&(station<=ts[-1])&(mesh.vertices[:,0]>.22)
    crop=mesh.submesh([np.all(mask[mesh.faces],axis=1)],append=True,repair=False)
    (RUN/'candidate').mkdir(parents=True,exist_ok=True)
    crop.export(RUN/'candidate/source-arm-region.ply')
    write_json(RUN/'qa/extraction.json',{k:v for k,v in data.items() if k not in ('vertices','faces')})
    print(json.dumps(data['mechanical']))


if __name__=='__main__':
    main()
