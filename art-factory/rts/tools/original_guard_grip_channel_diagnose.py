"""Distinguish float32 Boolean micro-faces and coordinate rounding from material shape changes."""
from pathlib import Path
import json
import bpy,bmesh
import numpy as np
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/"art-factory/rts/runs/original-guard-grip-channel/2026-10-05";QA=RUN/"qa"
bpy.ops.wm.open_mainfile(filepath=str(RUN/"candidate/original-guard-grip-channel.blend"))
body=bpy.data.objects["OriginalGripChannelCandidate"];mesh=body.data
actual=np.array([tuple(v.co) for v in mesh.vertices],dtype=np.float32)
fit=json.loads((QA/"input.json").read_text())["fit"];axis=np.asarray(fit["direction"]);origin=np.asarray(fit["origin"])
before=np.load(ROOT/"tmp/rts/grip-channel-input.npz")["vertices"]
delta=before-origin;radial=np.linalg.norm(delta-np.outer(delta@axis,axis),axis=1);outer=before[radial>fit["radius"]+.00005]
keys={v.tobytes() for v in actual};missing=[v for v in outer if v.tobytes() not in keys]
nearest=[]
for v in missing:
    d=np.linalg.norm(actual.astype(np.float64)-v.astype(np.float64),axis=1);i=int(np.argmin(d))
    nearest.append({"source":v.tolist(),"output":actual[i].tolist(),"distance_m":float(d[i]),"output_id":i})
bm=bmesh.new();bm.from_mesh(mesh);bm.faces.ensure_lookup_table();micro=[]
for f in bm.faces:
    area=f.calc_area()
    if area>=1e-14: continue
    points=np.array([tuple(v.co) for v in f.verts],dtype=np.float64)
    exact=sum(np.linalg.norm(np.cross(points[i]-points[0],points[i+1]-points[0]))/2 for i in range(1,len(points)-1))
    micro.append({"face":f.index,"vertices":[v.index for v in f.verts],"bmesh_area":area,"float64_fan_area":float(exact),"center":points.mean(axis=0).tolist(),"unique_coordinate_count":len(np.unique(points,axis=0))})
bm.free()
value={"status":"numerical_diagnosis_only","outer_missing_count":len(missing),"nearest_output":nearest,"micro_faces":micro,
       "exact_zero_fan_count":sum(v["float64_fan_area"]==0 for v in micro)}
(QA/"numerical-diagnosis.json").write_bytes((json.dumps(value,indent=2)+"\n").encode())
print(json.dumps({"missing":nearest,"micro_count":len(micro),"exact_zero":value["exact_zero_fan_count"]}))
