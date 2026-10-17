"""Check actual authored Blender skin against the pinned semantic repair."""
import bpy,json,hashlib
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-glove-power-grip/2026-10-07-v1'
source=RUN/'candidate/natural-hand.blend'
h=json.loads((RUN/'raw/hand.json').read_text())
old=json.loads((ROOT/'art-factory/rts/runs/original-glove-weapon-fit/2026-10-07-v1/raw/hand.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(source));rig=bpy.data.objects['OriginalHandRig_L'];hand=bpy.data.objects['OriginalJointGlove_L_LOD0']
assert all(h[k]==old[k] for k in ['points','faces','bones','source_sha256'])
changed=[i for i,(a,b) in enumerate(zip(h['weights'],old['weights'])) if a!=b]
assert len(changed)==130
assert all(a==b for a,b in zip(h['weights'],old['weights']) if not any(n.startswith('Thumb') for n in b))
weights=[{hand.vertex_groups[g.group].name:g.weight for g in v.groups if g.weight>0} for v in hand.data.vertices]
assert all(set(a)==set(b) for a,b in zip(weights,h['weights']))
weight_error=max(abs(a[n]-b[n]) for a,b in zip(weights,h['weights']) for n in a)
assert weight_error<1e-7
point_error=max((v.co-Vector(p)).length for v,p in zip(hand.data.vertices,h['points']))
assert point_error<1e-9
hand.data.calc_loop_triangles()
assert [list(t.vertices) for t in hand.data.loop_triangles]==h['faces']
assert set(rig.data.bones.keys())==set(h['bones'])
bone_error=max((getattr(rig.data.bones[name],key+'_local')-Vector(data[key])).length for name,data in h['bones'].items() for key in ['head','tail'])
assert bone_error<1e-9
report={'pass':True,'original_source_sha256':h['source_sha256'],'candidate_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'binding_sha256':hashlib.sha256((RUN/'raw/hand.json').read_bytes()).hexdigest(),'changed_vertices':len(changed),'nonthumb_original_vertices_exact':True,'rest_points_max_error_m':point_error,'triangles_exact':True,'bone_endpoint_max_error_m':bone_error,'skin_max_float_error':weight_error,'scope':'Actual Blender rest geometry, triangle indices, bone endpoints and weights vs pinned original and 130-vertex repair. No character fit or art approval.','runtime_publish_allowed':False}
(RUN/'qa/natural-binding-preservation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
