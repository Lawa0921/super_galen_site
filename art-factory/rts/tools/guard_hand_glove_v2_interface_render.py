"""Read-only true source cuff placement witness, not an assembled runtime asset."""
import sys
from pathlib import Path
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path(__file__).parent))
import bpy
from mathutils import Vector
from guard_hand_glove_v2_build import RUN,WC,CC,R,T,read,write,sha,material
def main():
    blend=RUN/'candidate/guard-right-hand-soft-glove-clay.blend';before=sha(blend);bpy.ops.wm.open_mainfile(filepath=str(blend));obj=bpy.data.objects['GuardRightSoftGlove_ClayLOD0'];cuff=read(RUN/'qa/v35-interface.json')['actual_right_cuff']
    mesh=bpy.data.meshes.new('QA true cuff exact world geometry');mesh.from_pydata(cuff['vertices_m'],[],cuff['triangles']);mesh.update();o=bpy.data.objects.new('QA ONLY actual v35 cuff',mesh);bpy.context.collection.objects.link(o);mesh.materials.append(material('QA cuff blue',(.11,.25,.34)))
    scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.world=bpy.data.worlds.new('True interface QA');scene.world.color=(.045,.045,.045);scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-1
    aim=(WC+CC)/2
    for delta,power in (((.5,.7,.7),25),((-.4,.4,.4),15),((.2,-.6,.6),20)):
        data=bpy.data.lights.new('QA softbox','AREA');data.energy=power;data.size=.5;l=bpy.data.objects.new(data.name,data);bpy.context.collection.objects.link(l);l.location=aim+Vector(delta);l.rotation_euler=(aim-l.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new('QA true cuff interface');data.type='ORTHO';data.ortho_scale=.20;data.clip_start=.001;cam=bpy.data.objects.new(data.name,data);bpy.context.collection.objects.link(cam);cam.location=aim-R*.5-T*.5+Vector((0,0,.20));cam.rotation_euler=(aim-cam.location).to_track_quat('-Z','Y').to_euler();scene.camera=cam
    path=RUN/'qa/renders/actual-v35-cuff-interface.png';scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
    write(RUN/'qa/cuff-interface-render.json',{'path':path.as_posix(),'sha256':sha(path),'candidate_sha256':before,'source_cuff_sha256':read(RUN/'qa/v35-interface.json')['source_sha256'],'actual_source_vertices_unchanged':True,'QA_objects_saved':False});assert sha(blend)==before
if __name__=='__main__':main()
