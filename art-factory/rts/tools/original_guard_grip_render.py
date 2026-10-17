"""Neutral diagnostic renders of the untouched original single-view hand shape."""
from pathlib import Path
import hashlib,json,math
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-guard-right-grip-shape/2026-10-05'


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    source=RUN/'candidate/candidate.glb';bpy.ops.import_scene.gltf(filepath=str(source))
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
    # The generator is Y-up/+Z front. Blender import is Z-up/-Y front.
    vertices=[o.matrix_world@v.co for o in objects for v in o.data.vertices]
    low=min(v.z for v in vertices);high=max(v.z for v in vertices);scale=.34/(high-low)
    for obj in objects:
        obj.rotation_euler.z+=math.pi
        obj.scale*=scale
        obj.location.z-=low*scale
        bpy.context.view_layer.update()
        mat=bpy.data.materials.new('QA untextured original shape');mat.diffuse_color=(.42,.47,.53,1);mat.use_nodes=True
        mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.42,.47,.53,1)
        mat.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.56
        obj.data.materials.clear();obj.data.materials.append(mat)
        for face in obj.data.polygons:face.use_smooth=True
    target=Vector((0,0,.17));scene=bpy.context.scene
    scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=900;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.world=bpy.data.worlds.new('QA world');scene.world.color=(.06,.075,.095)
    scene.view_settings.look='AgX - Medium High Contrast'
    for loc,power,size in [((.8,1.0,.9),80,.7),((-.8,.5,.4),45,.6),((0,-.7,.7),65,.5)]:
        data=bpy.data.lights.new('QA softbox','AREA');data.energy=power;data.size=size
        light=bpy.data.objects.new('QA softbox',data);bpy.context.collection.objects.link(light);light.location=loc
        light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler()
    out=RUN/'qa/renders';out.mkdir(parents=True,exist_ok=True)
    views={'front':(0,1,.22),'back':(0,-1,.22),'left':(-1,0,.22),'right':(1,0,.22),'palm-three-quarter':(.8,1,.35),'opposite-three-quarter':(-.8,-1,.35)}
    outputs={}
    for name,loc in views.items():
        data=bpy.data.cameras.new(name);data.type='ORTHO';data.ortho_scale=.40
        camera=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(camera);camera.location=loc
        camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
        path=out/f'{name}.png';scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
        outputs[name]={'path':str(path.relative_to(ROOT)).replace('\\','/'),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    blend=RUN/'candidate/hand-shape-inspection.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    report={'status':'raw_shape_visual_review_pending','runtime_publish_allowed':False,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'inspection_blend_sha256':hashlib.sha256(blend.read_bytes()).hexdigest(),'render_tool_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'source_mesh_modified':False,'display_transform':{'rotate_blender_z_degrees':180,'total_height_m':.34,'scale':scale,'native_import_ground_z':low},'vertices':sum(len(o.data.vertices) for o in objects),'triangles':sum(sum(len(f.vertices)-2 for f in o.data.polygons) for o in objects),'views':outputs,'limitations':['0.34m includes handle and cuff; display scale is not measured weapon-fit approval','Gray material is diagnostic only; no UV, rig, separate fingers or separate handle claimed','Unseen surfaces are generated hypotheses, not recovered measured anatomy']}
    (RUN/'qa/render.json').write_bytes((json.dumps(report,indent=2)+'\n').encode())
    print(json.dumps({'status':report['status'],'views':len(outputs),'triangles':report['triangles']}))


if __name__=='__main__':main()
