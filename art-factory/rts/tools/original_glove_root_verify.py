"""Check actual root-only Blender changes against the immutable original."""
import bpy,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-glove-joints/2026-10-07-v2'
SOURCE=RUN.parent/'2026-10-07-v1/candidate/joint-rig.blend';CANDIDATE=RUN/'candidate/joint-rig.blend'
def capture(path):
 bpy.ops.wm.open_mainfile(filepath=str(path));obj=bpy.data.objects['OriginalJointGlove_L_LOD0'];rig=bpy.data.objects['OriginalHandRig_L']
 return {'points':[tuple(v.co) for v in obj.data.vertices],'faces':[tuple(f.vertices) for f in obj.data.polygons],'bones':{b.name:(tuple(b.head_local),tuple(b.tail_local),b.parent.name if b.parent else None) for b in rig.data.bones},'axes':{b.name:tuple(b.get('original_flexion_axis',[])) for b in rig.data.bones},'weights':[{obj.vertex_groups[g.group].name:g.weight for g in v.groups} for v in obj.data.vertices]}
old=capture(SOURCE);new=capture(CANDIDATE)
distal_error=max(abs(a.get(name,0)-b.get(name,0)) for a,b in zip(old['weights'],new['weights']) for name in old['bones'] if name[-3] in ['2','3'])
tests={'all_rest_vertices_exact':old['points']==new['points'],'all_faces_exact':old['faces']==new['faces'],'all_bone_heads_tails_parents_exact':old['bones']==new['bones'],'distal_weights_preserved':distal_error<1e-7,'all_other_axes_preserved':all(v==new['axes'][k] for k,v in old['axes'].items() if k!='Middle1_L'),'maximum_four_normalized_weights':all(len(w)<=4 and abs(sum(w.values())-1)<1e-6 for w in new['weights'])}
report={'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'candidate_sha256':hashlib.sha256(CANDIDATE.read_bytes()).hexdigest(),'tests':tests,'vertices':len(new['points']),'distal_weight_max_error':distal_error,'middle_axis_before':old['axes']['Middle1_L'],'middle_axis_after':new['axes']['Middle1_L'],'pass':all(tests.values()),'runtime_publish_allowed':False}
(RUN/'qa/preservation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));assert report['pass']
