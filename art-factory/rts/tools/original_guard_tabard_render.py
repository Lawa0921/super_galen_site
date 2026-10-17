"""Render frozen cloth checkpoint and original source with matching cameras."""
from pathlib import Path
import json,sys
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from original_guard_tabard_blender import ROOT,RUN,QA,source,create,sha,write,evaluated

def main():
    blend=RUN/'candidate/original-guard-tabard.blend'
    report=json.loads((QA/'geometry.json').read_text())
    if sha(blend)!=report['blend_sha256']:raise ValueError('Frozen candidate mismatch')
    bpy.ops.wm.open_mainfile(filepath=str(blend))
    cloth=bpy.data.objects['OriginalGuardFrontTabard']
    reference={}
    for frame in [0,5,10,15,20]:
        bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
        points,_=evaluated(cloth)
        reference[str(frame)]={'time':frame/30,'positions_gltf':[[round(float(p[0]),8),round(float(p[2]),8),round(float(-p[1]),8)] for p in points]}
    write(QA/'browser-reference.json',{'glb_sha256':report['glb_sha256'],'frames':reference})
    bpy.context.scene.frame_set(0)
    v,f,_=source();original=create('OriginalBodyComparisonOnly',v.tolist(),f.tolist())
    material=cloth.data.materials[0];original.data.materials.append(material)
    for face in original.data.polygons:face.use_smooth=True
    original.hide_render=True
    scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE'
    scene.render.resolution_x=800;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.world=bpy.data.worlds.new('Cloth QA world');scene.world.color=(.07,.075,.08)
    scene.view_settings.look='AgX - Medium High Contrast'
    target=Vector((0,.13,.8))
    for loc,power,size in [((1,2,2.5),180,1.2),((-1,1,1),110,1),((0,-1,2),170,1)]:
        light=bpy.data.lights.new('QA area','AREA');light.energy=power;light.size=size
        obj=bpy.data.objects.new('QA area',light);bpy.context.collection.objects.link(obj);obj.location=loc
        obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
    out=QA/'renders';out.mkdir(parents=True,exist_ok=True);files={}
    def render(name,offset,scale=.64,aim=target):
        data=bpy.data.cameras.new(name);data.type='ORTHO';data.ortho_scale=scale
        camera=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(camera)
        camera.location=Vector(aim)+Vector(offset);camera.rotation_euler=(Vector(aim)-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.camera=camera;path=out/(name+'.png');scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
        files[name]={'path':str(path.relative_to(ROOT)).replace('\\','/'),'sha256':sha(path)}
        bpy.data.objects.remove(camera,do_unlink=True)
    for prefix,is_source in [('source-',True),('',False)]:
        original.hide_render=not is_source;cloth.hide_render=is_source
        for name,offset in [('front',(0,2,0)),('side',(2,0,0)),('three-quarter',(1.5,2,.2))]:render(prefix+name,offset)
    scene.frame_set(5);render('sway-front',(1,2,.1));scene.frame_set(0)
    original.hide_render=False;cloth.hide_render=True
    render('source-full-body',(0,3,0),2.05,Vector((0,0,.93)))
    write(QA/'renders.json',{'status':'rendered_pending_visual_review','runtime_publish_allowed':False,'geometry_resaved':False,'renders':files})
    print('TABARD_RENDER_DONE',len(files),flush=True)

if __name__=='__main__':main()
