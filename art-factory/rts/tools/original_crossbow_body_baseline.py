"""White-material source evidence; never save or change the frozen model."""
import bpy,hashlib,json,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
SOURCE=ROOT/'art-factory/rts/runs/original-crossbow-team-surface/2026-10-06-v1/candidate/original-crossbow-grip.blend'
RUN=ROOT/'art-factory/rts/runs/original-crossbow-body-surface/2026-10-06-v1'
out=RUN/'qa';out.mkdir(parents=True,exist_ok=True)
prefix='baseline';body_name='crossbowOriginalBody_LOD0'
if '--pre-cuff' in sys.argv:
    SOURCE=ROOT/'tmp/rts/body-before-cuff.blend';prefix='pre-cuff';body_name='OriginalCrossbowCanonicalBody'
elif '--candidate' in sys.argv:
    SOURCE=RUN/'candidate/original-crossbow-grip.blend';prefix='candidate'
else:assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()=='35e6c95a646fd8647b3c24fc54ab11106ea53796503ef81d34c76e877e81a4f1'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['crossbowRig20'];scene=bpy.context.scene
mat=bpy.data.materials.new('QAWhiteClay');mat.use_nodes=True;shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.58,.58,.58,1);shader.inputs['Roughness'].default_value=.9
for obj in bpy.data.objects:
    if obj.type=='MESH':
        obj.hide_render=obj.name!=body_name
        if not obj.hide_render:
            obj.data.materials.clear();obj.data.materials.append(mat)
            for face in obj.data.polygons:face.material_index=0
scene.render.engine='BLENDER_EEVEE';scene.eevee.taa_render_samples=48;scene.render.resolution_x=1100;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
camera=scene.camera;camera.data.type='ORTHO';camera.data.ortho_scale=.90
a=bpy.data.actions['Idle'];rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0];scene.frame_set(0)
for pose in ('rest','idle'):
    rig.data.pose_position='REST' if pose=='rest' else 'POSE';bpy.context.view_layer.update()
    target=Vector((0,0,1.40))
    for view,direction in [('front',(1,4,.8)),('back',(-1,-4,.8)),('left',(4,0,.4)),('right',(-4,0,.4))]:
        camera.location=target+Vector(direction);camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(out/f'{prefix}-white-{pose}-{view}.png');bpy.ops.render.render(write_still=True)
(out/f'white-{prefix}.json').write_text(json.dumps({'source':str(SOURCE),'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'scope':'LOD0 rest and actual Idle0, body only with neutral untextured material, 4 views each','runtime_publish_allowed':False},indent=2)+'\n')
print('WHITE_BASELINE',str(out))
