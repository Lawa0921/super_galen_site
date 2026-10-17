"""Export actual original hand, local motion and complete original weapon."""
import bpy,json,hashlib,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-glove-weapon-fit/2026-10-07-v1'
source=RUN/'candidate/support-grip.blend';bpy.ops.wm.open_mainfile(filepath=str(source))
rig=bpy.data.objects['OriginalHandRig_L'];hand=bpy.data.objects['OriginalJointGlove_L_LOD0'];weapon=bpy.data.objects['OriginalContactCrossbow'];scene=bpy.context.scene
scene.frame_set(18);bpy.context.view_layer.update();world=hand.matrix_world.copy();hand.parent=None;hand.matrix_world=world
assert max(abs(world[r][c]-float(r==c)) for r in range(4) for c in range(4))<1e-6
keys=[k for a in bpy.data.actions for layer in a.layers for strip in layer.strips for slot in a.slots for bag in [strip.channelbag(slot)] if bag for curve in bag.fcurves for k in curve.keyframe_points]
for key in keys:key.co.x*=4;key.handle_left.x*=4;key.handle_right.x*=4
scene.render.fps=96;scene.frame_end=192;scene.frame_set(72)
bpy.ops.object.select_all(action='DESELECT')
for obj in (rig,hand,weapon):obj.select_set(True)
bpy.context.view_layer.objects.active=rig
output=RUN/'candidate/support-grip.glb'
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_animations=True,export_force_sampling=True,export_optimize_animation_size=False,export_skins=True,export_morph=False,export_materials='EXPORT',export_apply=True,export_yup=True)
report={'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'glb_sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'source_sample_frames':.25,'clip':'SupportGrip','duration_seconds':2,'export_binding':'Hand mesh detached at identity hold transform; original skin and animated Hand_L bone reach retained. Armature object stays identity. Source blend unchanged.','runtime_publish_allowed':False}
(RUN/'qa/export-authoring.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
