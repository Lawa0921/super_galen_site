"""Prepare the original glove's main closed component and source-fitted bore."""
from pathlib import Path
import hashlib,json,sys
import numpy as np
import trimesh
from original_guard_grip_channel_math import fit_handle_axis

ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/"art-factory/rts/runs/original-guard-grip-channel/2026-10-05"
SOURCE=ROOT/"art-factory/rts/runs/original-guard-right-grip-shape/2026-10-05/candidate/candidate.glb"

def main():
    expected="e323c874e0ccff8ba55f97312c04697133c716ae92a732b6155cc034325c8057"
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest()!=expected: raise ValueError("Source hash changed")
    loaded=trimesh.load(SOURCE,force="mesh",process=False)
    vertices,inverse=np.unique(np.asarray(loaded.vertices),axis=0,return_inverse=True)
    faces=inverse[np.asarray(loaded.faces)]
    exact=trimesh.Trimesh(vertices=vertices,faces=faces,process=False)
    parts=exact.split(only_watertight=False); mesh=max(parts,key=lambda p:len(p.faces))
    if not mesh.is_watertight or not mesh.is_winding_consistent or np.any(mesh.area_faces==0):
        raise ValueError("Main original component is not closed and nondegenerate")
    ground=vertices[:,1].min(); scale=.34/np.ptp(vertices[:,1]); v=np.asarray(mesh.vertices)
    canonical=(np.column_stack((-v[:,0],v[:,2],v[:,1]-ground))*scale).astype(np.float32)
    fit=fit_handle_axis(canonical)
    if fit["radius"]>.031: raise ValueError("Bore exceeds measured exposed-stem scope")
    temporary=ROOT/"tmp/rts/grip-channel-input.npz"; temporary.parent.mkdir(parents=True,exist_ok=True)
    np.savez_compressed(temporary,vertices=canonical,faces=np.asarray(mesh.faces,dtype=np.int32))
    report={"status":"prepared_candidate_only","runtime_publish_allowed":False,"source_sha256":expected,
            "source_components":len(parts),"kept_component_vertices":len(canonical),"kept_component_faces":len(mesh.faces),
            "removed_disconnected_faces":len(faces)-len(mesh.faces),"source_main_watertight":True,
            "display_scale":float(scale),"ground":float(ground),"fit":fit,
            "temporary_input_sha256":hashlib.sha256(temporary.read_bytes()).hexdigest(),
            "source_license_reference":"art-factory/rts/runs/original-guard-right-grip-shape/2026-10-05/qa/provenance.json"}
    qa=RUN/"qa"; qa.mkdir(parents=True,exist_ok=True)
    (qa/"input.json").write_bytes((json.dumps(report,indent=2)+"\n").encode())
    print(json.dumps(report))
if __name__=="__main__": main()
