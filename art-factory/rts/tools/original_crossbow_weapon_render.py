"""Render actual candidate weapon and its animated assembly without saving it."""
import bpy
import json
import os
from pathlib import Path
import sys
from mathutils import Vector

run=Path(sys.argv[sys.argv.index('--')+1]).resolve()
out=run/'qa/detail';out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(run/'candidate/original-crossbow-grip.blend'))
rig=bpy.data.objects['crossbowRig20'];scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE';scene.eevee.taa_render_samples=32
scene.render.resolution_x=1200;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
if scene.world:scene.world.color=(.10,.10,.10)
camera=scene.camera;camera.data.type='ORTHO'
def capture(name,target,direction,scale):
    target=Vector(target);camera.location=target+Vector(direction)
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale=scale;scene.render.filepath=str(out/(name+'.png'));bpy.ops.render.render(write_still=True)
for lod in (0,1):
    weapon=bpy.data.objects[f'CrossbowWeapon_LOD{lod}']
    for obj in bpy.data.objects:
        if obj.type=='MESH':obj.hide_render=obj!=weapon
    rig.data.pose_position='REST';bpy.context.view_layer.update()
    for view,direction in [('top',(0,0,3)),('side',(3,0,.08)),('quarter',(2,-2,2))]:
        capture(f'weapon-lod{lod}-{view}',(.4756,.26,1.085),direction,1.0)
    rig.data.pose_position='POSE'
    for obj in bpy.data.objects:
        if obj.type=='MESH':obj.hide_render=obj.name not in [weapon.name,f'crossbowOriginalBody_LOD{lod}','OriginalCrossbowClosedGrip_R','OriginalCrossbowClosedGrip_L']
    for clip,frame in [('Idle',0),('Attack',16),('Hurt',14),('Death',35)]:
        action=bpy.data.actions[clip];rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
        scene.frame_set(frame);bpy.context.view_layer.update()
        target=(rig.matrix_world@rig.pose.bones['Hand_R'].head+rig.matrix_world@rig.pose.bones['Hand_L'].head)/2
        for view,direction in [('front',(2,4,1.9)),('back',(-2,-4,1.5))]:
            capture(f'grip-lod{lod}-{clip}-{view}',target,direction,.78)
print('WEAPON_RENDER',str(out))
