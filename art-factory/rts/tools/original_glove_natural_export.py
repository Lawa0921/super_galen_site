"""Export the verified original simultaneous hand animation, without weapon."""
import bpy,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-glove-power-grip/2026-10-07-v1'
source=RUN/'candidate/natural-hand.blend'
qa=json.loads((RUN/'qa/natural-motion-source.json').read_text())
assert qa['pass'] and qa['candidate_sha256']==hashlib.sha256(source.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(source))
rig=bpy.data.objects['OriginalHandRig_L'];hand=bpy.data.objects['OriginalJointGlove_L_LOD0'];scene=bpy.context.scene
scene.frame_set(0);bpy.context.view_layer.update();world=hand.matrix_world.copy();hand.parent=None;hand.matrix_world=world
assert max(abs(world[r][c]-float(r==c)) for r in range(4) for c in range(4))<1e-6
for action in bpy.data.actions:
    for layer in action.layers:
        for strip in layer.strips:
            for slot in action.slots:
                bag=strip.channelbag(slot)
                if bag:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:
                            key.co.x*=4;key.handle_left.x*=4;key.handle_right.x*=4
scene.render.fps=96;scene.frame_end=192;scene.frame_set(0)
bpy.ops.object.select_all(action='DESELECT')
for obj in (rig,hand):obj.select_set(True)
bpy.context.view_layer.objects.active=rig
output=RUN/'candidate/natural-hand.glb'
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_animations=True,export_force_sampling=True,export_optimize_animation_size=False,export_skins=True,export_morph=False,export_materials='EXPORT',export_apply=True,export_yup=True)
report={'source_sha256':qa['candidate_sha256'],'glb_sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'source_sample_frames':.25,'clip':'NaturalCurl','duration_seconds':2,'runtime_publish_allowed':False}
(RUN/'qa/natural-export-authoring.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
