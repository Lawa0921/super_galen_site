"""Attach generated-reference atlas and export the unchanged original motion."""
from pathlib import Path
import hashlib,json,sys
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from original_guard_tabard_blender import evaluated
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-guard-portrait-material/2026-10-05'


def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path,data):path.write_bytes((json.dumps(data,indent=2)+'\n').encode())


def main():
    bpy.ops.wm.open_mainfile(filepath=str(RUN/'candidate/atlas-prepared.blend'))
    low=bpy.data.objects['OriginalGuardPortraitBust'];rig=bpy.data.objects['OriginalPortraitControls'];scene=bpy.context.scene
    scene.frame_set(0);bpy.context.view_layer.update()
    expected=json.loads((RUN/'qa/preparation.json').read_text())
    v=np.asarray([v.co[:] for v in low.data.vertices]);f=np.asarray([p.vertices[:] for p in low.data.polygons])
    if hashlib.sha256(v.tobytes()+f.tobytes()).hexdigest()!=expected['geometry_sha256_before']:raise ValueError('Geometry differs')
    mat=bpy.data.materials.new('OriginalGeneratedGuardReferenceProjection');mat.use_nodes=True
    nodes=mat.node_tree.nodes;links=mat.node_tree.links;bsdf=nodes['Principled BSDF']
    base=nodes.new('ShaderNodeTexImage');base.image=bpy.data.images.load(str(RUN/'candidate/original-guard-portrait-basecolor.png'));base.image.pack()
    links.new(base.outputs['Color'],bsdf.inputs['Base Color'])
    response=nodes.new('ShaderNodeTexImage');response.image=bpy.data.images.load(str(RUN/'candidate/original-guard-portrait-response.png'));response.image.colorspace_settings.name='Non-Color';response.image.pack()
    split=nodes.new('ShaderNodeSeparateColor');links.new(response.outputs['Color'],split.inputs['Color']);links.new(split.outputs['Green'],bsdf.inputs['Roughness']);links.new(split.outputs['Blue'],bsdf.inputs['Metallic'])
    low.data.materials.clear();low.data.materials.append(mat)
    for polygon in low.data.polygons:polygon.material_index=0
    bpy.context.preferences.filepaths.save_version=0
    blend=RUN/'candidate/original-guard-portrait-material.blend';glb=RUN/'candidate/original-guard-portrait-material.glb'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.object.select_all(action='DESELECT');low.select_set(True);rig.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_animations=True)
    ref=json.loads((ROOT/'art-factory/rts/runs/original-guard-portrait-study/2026-10-05/qa/browser-reference.json').read_text())
    frames={};deltas=[]
    for frame in [0,30,60,90,120]:
        scene.frame_set(frame);bpy.context.view_layer.update();p,_=evaluated(low);points=np.column_stack((p[:,0],p[:,2],-p[:,1]))
        delta=float(np.linalg.norm(points-np.asarray(ref['frames'][str(frame)]['positions_gltf']),axis=1).max());deltas.append(delta)
        frames[str(frame)]={'positions_gltf':points.tolist()}
    if max(deltas)>1e-8:raise ValueError('Original authored motion changed')
    write(RUN/'qa/browser-reference.json',{'glb_sha256':sha(glb),'frames':frames})
    write(RUN/'qa/geometry.json',{'status':'unchanged_geometry_motion_textured_pending_visual_review','runtime_publish_allowed':False,
      'blend_sha256':sha(blend),'glb_sha256':sha(glb),'source_geometry_sha256':expected['geometry_sha256_before'],'sampled_pose_max_difference_m':max(deltas),
      'source_vertex_count':len(v),'triangles':len(f),'texture_only_change':True})
    # Identical source QA framing, now with the projected original material.
    scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=800;scene.render.resolution_y=900;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.world=bpy.data.worlds.new('Original portrait material QA');scene.world.color=(.07,.075,.08)
    scene.view_settings.look='AgX - Medium High Contrast';target=Vector((0,0,1.60))
    for loc,power,size in [((1,2,3),220,1.4),((-1,1,2),100,1.1),((0,-1,2.5),160,1)]:
        data=bpy.data.lights.new('Portrait material QA','AREA');data.energy=power;data.size=size
        light=bpy.data.objects.new(data.name,data);bpy.context.collection.objects.link(light);light.location=loc;light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler()
    out=RUN/'qa/renders';out.mkdir(exist_ok=True);files={}
    for name,offset,frame in [('front',(0,2,.03),0),('right',(2,0,.03),0),('back',(0,-2,.03),0),('left',(-2,0,.03),0),('pose-30',(0,2,.03),30),('pose-90',(0,2,.03),90)]:
        scene.frame_set(frame);data=bpy.data.cameras.new(name);data.type='ORTHO';data.ortho_scale=.70
        camera=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(camera);camera.location=target+Vector(offset);camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
        path=out/(name+'.png');scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
        files[name]={'path':str(path.relative_to(ROOT)).replace('\\','/'),'sha256':sha(path)};bpy.data.objects.remove(camera,do_unlink=True)
    write(RUN/'qa/renders.json',{'status':'rendered_pending_visual_review','runtime_publish_allowed':False,'renders':files})
    print('PORTRAIT_MATERIAL_DONE',max(deltas),flush=True)


if __name__=='__main__':main()
