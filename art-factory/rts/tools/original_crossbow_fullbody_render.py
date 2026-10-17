"""Full-character source QA. Candidate only, never a runtime publication."""
import bpy,sys,json
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_fullbody_build import RUN
from original_crossbow_fullbody_props import PROP_NAMES
from original_crossbow_attack_probe import activate
bpy.ops.wm.open_mainfile(filepath=str(RUN/'candidate/complete-crossbow.blend'))
rig=bpy.data.objects['crossbowRig20'];scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE';scene.eevee.taa_render_samples=24
scene.render.resolution_x=700;scene.render.resolution_y=850;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
names={'crossbowOriginalBody_LOD0','CrossbowWeapon_LOD0','OriginalCrossbowArticulatedHand_L','OriginalCrossbowClosedGrip_R','OriginalLoadedBolt',*PROP_NAMES}
for obj in scene.objects:
    if obj.type=='MESH':obj.hide_render=obj.name not in names
camera=scene.camera;camera.data.type='ORTHO';camera.data.ortho_scale=2.12
target=Vector((0,.10,.90));frames=[0,10,26,36,40,50,54,60,62,68]
critical='--critical' in sys.argv
if critical:frames=[43.375,49.125,54,56.375,56.5]
for frame in frames:
    activate(rig,'Attack',frame)
    if critical:
        target=(rig.pose.bones['HandPalm_L'].matrix.translation+rig.pose.bones['Forearm_L'].matrix.translation)*.5
        camera.data.ortho_scale=.78
    for view,offset in [('threequarter',(3.2,4.2,1.8)),('left',(-3.2,4.2,1.8))]:
        camera.location=target+Vector(offset);camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
        prefix='critical' if critical else 'fullbody'
        scene.render.filepath=str(RUN/f'qa/{prefix}-{frame:02}-{view}.png');bpy.ops.render.render(write_still=True)
print('FULLBODY_RENDER',len(frames)*2)
