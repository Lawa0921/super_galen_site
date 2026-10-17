"""Export original root-bound hand with the skinned mesh as a GLB scene root."""
import bpy,sys,json,hashlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import original_glove_build as output
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-glove-joints/2026-10-07-v2'
source=RUN/'candidate/joint-rig.blend';bpy.ops.wm.open_mainfile(filepath=str(source));rig=bpy.data.objects['OriginalHandRig_L'];obj=bpy.data.objects['OriginalJointGlove_L_LOD0'];output.RUN=RUN
parent=obj.parent;world=obj.matrix_world.copy()
try:
 obj.parent=None;obj.matrix_world=world;output.export(rig,[obj],'L')
finally:obj.parent=parent;obj.matrix_world=world
report={'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'glb_sha256':hashlib.sha256((RUN/'candidate/glove-l-lod0.glb').read_bytes()).hexdigest(),'export_change':'Skinned mesh temporarily unparented with world transform retained. Armature modifier and skin still target original rig. Actual export parity required.','runtime_publish_allowed':False}
(RUN/'qa/export-authoring.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
if '--no-render' not in sys.argv:output.render(rig,[obj],'L')
