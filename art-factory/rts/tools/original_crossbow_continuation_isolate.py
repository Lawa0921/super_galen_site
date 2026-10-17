import bpy,sys,os
from mathutils import Vector
root=os.path.abspath(sys.argv[sys.argv.index('--')+1])
bpy.ops.wm.open_mainfile(filepath=os.path.join(root,'candidate','original-crossbow-grip.blend'))
rig=bpy.data.objects['crossbowRig20'];a=bpy.data.actions['Idle'];rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0]
bpy.context.scene.frame_set(20)
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.eevee.taa_render_samples=16
scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100
cam=scene.camera;target=(rig.pose.bones['Hand_R'].head+rig.pose.bones['Hand_L'].head)/2
cam.location=target+Vector((3.2,4.2,1.8));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=.5
for variant,needle in [('gloves','ClosedGrip'),('body','Body_LOD0')]:
    for o in bpy.data.objects:
        if o.type=='MESH':o.hide_render=needle not in o.name
    scene.render.filepath=os.path.join(root,'qa','isolate-'+variant+'.png');bpy.ops.render.render(write_still=True)
