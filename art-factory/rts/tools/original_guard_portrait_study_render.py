"""Matching-camera original source, reduced bust and authored poses."""
from pathlib import Path
import json,sys
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from original_guard_portrait_study_blender import ROOT,RUN,QA,sha,write

def main():
    report=json.loads((QA/'geometry.json').read_text());blend=RUN/'candidate/original-guard-portrait-study.blend'
    if sha(blend)!=report['blend_sha256']:raise ValueError('Frozen portrait differs')
    bpy.ops.wm.open_mainfile(filepath=str(blend))
    low=bpy.data.objects['OriginalGuardPortraitBust'];high=bpy.data.objects['OriginalHighBustReference']
    scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=800;scene.render.resolution_y=900;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.world=bpy.data.worlds.new('Portrait QA world');scene.world.color=(.07,.075,.08)
    scene.view_settings.look='AgX - Medium High Contrast';target=Vector((0,0,1.60))
    for loc,power,size in [((1,2,3),220,1.4),((-1,1,2),100,1.1),((0,-1,2.5),160,1)]:
        data=bpy.data.lights.new('Portrait source QA','AREA');data.energy=power;data.size=size
        light=bpy.data.objects.new(data.name,data);bpy.context.collection.objects.link(light);light.location=loc
        light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler()
    out=QA/'renders';out.mkdir(parents=True,exist_ok=True);files={}
    def render(name,offset):
        data=bpy.data.cameras.new(name);data.type='ORTHO';data.ortho_scale=.70
        camera=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(camera);camera.location=target+Vector(offset)
        camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
        path=out/(name+'.png');scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
        files[name]={'path':str(path.relative_to(ROOT)).replace('\\','/'),'sha256':sha(path)};bpy.data.objects.remove(camera,do_unlink=True)
    scene.frame_set(0)
    for prefix,source in [('source-',True),('candidate-',False)]:
        high.hide_render=not source;low.hide_render=source
        for name,offset in [('front',(0,2,.03)),('side',(2,0,.03)),('back',(0,-2,.03))]:render(prefix+name,offset)
    for frame in [30,60,90]:scene.frame_set(frame);render('pose-'+str(frame),(0,2,.03))
    write(QA/'renders.json',{'status':'rendered_pending_visual_review','runtime_publish_allowed':False,'renders':files})
    print('PORTRAIT_RENDER_DONE',len(files),flush=True)

if __name__=='__main__':main()
