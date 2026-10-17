"""Inspect actual failing cuff skin transforms, without changing source art."""
import bpy,json,sys,numpy as np
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_attack_probe import activate
from original_crossbow_wrist_topology_build import skin_matrix
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-crossbow-cuff-motion/2026-10-07-v1'
SOURCE=ROOT/'art-factory/rts/runs/original-crossbow-articulated-hand/2026-10-07-v1/candidate/articulated-connector.blend'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['crossbowRig20']
baseline=json.loads((RUN/'qa/strain-baseline.json').read_text());rows=[]
for lod in baseline['rows']:
    obj=bpy.data.objects[f'crossbowOriginalBody_LOD{lod["lod"]}']
    for kind in ('minimum','maximum'):
        failure=lod[kind]
        for clip,frame in [('Idle',0),(failure['clip'],failure['frame'])]:
            activate(rig,clip,frame)
            for vid in failure['vertices']:
                v=obj.data.vertices[vid];weights={g.group:g.weight for g in v.groups}
                skin=np.asarray(skin_matrix(obj,rig,weights));singular=np.linalg.svd(skin[:3,:3],compute_uv=False)
                rows.append({'lod':lod['lod'],'failure':kind,'clip':clip,'frame':frame,'vertex':vid,'rest_m':list(v.co),'singular_values':singular.tolist(),'condition':float(singular.max()/singular.min()),'determinant':float(np.linalg.det(skin[:3,:3]))})
report={'rows':rows,'source':str(SOURCE)}
(RUN/'qa/skin-matrices.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n');print(json.dumps(report))
