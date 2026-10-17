"""Extract the immutable project-original binding for root-only revisions."""
import bpy,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
SOURCE=ROOT/'art-factory/rts/runs/original-glove-joints/2026-10-07-v1/candidate/joint-rig.blend'
RUN=ROOT/'art-factory/rts/runs/original-glove-joints/2026-10-07-v2'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()=='ebd8bc8b462538eec0bd9829ce29c8d42ace7ee2083582e2e9ea2d68e99da5bc'
for name in ['raw','candidate','qa','prompts']:(RUN/name).mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));obj=bpy.data.objects['OriginalJointGlove_L_LOD0'];rig=bpy.data.objects['OriginalHandRig_L']
report={'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'vertices':[list(v.co) for v in obj.data.vertices],'faces':[list(f.vertices) for f in obj.data.polygons],'weights':[{obj.vertex_groups[g.group].name:g.weight for g in v.groups} for v in obj.data.vertices],'bones':{b.name:{'head':list(b.head_local),'tail':list(b.tail_local),'axis':list(b.get('original_flexion_axis',[]))} for b in rig.data.bones},'runtime_publish_allowed':False}
(RUN/'raw/original-binding.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'vertices':len(report['vertices']),'bones':len(report['bones']),'max_distal_influences':max(sum(k[-3]=='2' or k[-3]=='3' for k in w) for w in report['weights'])}))
