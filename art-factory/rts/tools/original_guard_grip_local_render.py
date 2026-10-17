"""Same six fit cameras plus four bounded ROI close views."""
from pathlib import Path
import hashlib
import json
import sys
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from original_guard_grip_local_inspect import RUN,LOW_RUN,sha

ROOT=Path(__file__).resolve().parents[3]
FIT=ROOT/'art-factory/rts/runs/original-guard-grip-fit/2026-10-05'
LOW=ROOT/'art-factory/rts/runs/original-guard-grip-low/2026-10-05'


def main():
    baseline='--baseline-close' in sys.argv
    flip=json.loads((RUN/'qa/flip-search.json').read_text(encoding='utf8'))
    blend=(LOW_RUN/'candidate/original-guard-grip-low.blend' if baseline
           else RUN/'candidate/original-guard-grip-local-flip.blend')
    assert sha(blend)==(flip['source_low_blend_sha256'] if baseline else flip['candidate_blend_sha256'])
    bpy.ops.wm.open_mainfile(filepath=str(blend))
    scene=bpy.context.scene
    scene.render.engine='BLENDER_EEVEE'
    scene.render.resolution_x=900;scene.render.resolution_y=900
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.world=bpy.data.worlds.new('Local repair inspection world')
    scene.world.color=(.045,.055,.072)
    scene.view_settings.look='AgX - Medium High Contrast'
    target=Vector((.45,.075,.9))
    for location,power,size in [((1.1,1.1,1.7),150,.8),((-.25,.85,.9),85,.7),((.8,-.9,1.4),100,.65)]:
        data=bpy.data.lights.new('Fit softbox','AREA');data.energy=power;data.size=size
        light=bpy.data.objects.new('Fit softbox',data);scene.collection.objects.link(light)
        light.location=location;light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler()
    views={
        'full-sword-proportion':((1.6,1.7,1.0),(.45,.075,.58),1.35),
        'four-finger-palm':((.82,1.25,.98),(.45,.075,.91),.33),
        'back-and-wrist':((.12,-1.25,.99),(.45,.075,.91),.33),
        'guard-and-finger-contact':((1.2,.65,.78),(.45,.075,.87),.29),
        'axis-from-pommel':((.45,.075,1.8),(.45,.075,.91),.28),
        'axis-from-guard':((.45,.075,.18),(.45,.075,.91),.28),
        'roi-main':((.58,.20,1.01),(.5197,.0769,.932),.035),
        'roi-202':((.58,.11,.91),(.512,-.009,.837),.030),
        'roi-1205':((.59,.05,.91),(.5265,-.062,.836),.018),
        'roi-3248':((.51,.20,.97),(.425,.089,.895),.038),
    }
    out=RUN/'qa/renders';out.mkdir(parents=True,exist_ok=True)
    record={}
    for name,(location,aim,scale) in views.items():
        if baseline and not name.startswith('roi-'):continue
        data=bpy.data.cameras.new(name);data.type='ORTHO';data.ortho_scale=scale
        camera=bpy.data.objects.new(name,data);scene.collection.objects.link(camera)
        camera.location=location;camera.rotation_euler=(Vector(aim)-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.camera=camera
        image=out/(('baseline-' if baseline else '')+name+'.png');scene.render.filepath=str(image)
        bpy.ops.render.render(write_still=True)
        record[name]={'path':str(image.relative_to(ROOT)).replace('\\','/'),'sha256':sha(image),
                      'same_camera_source':str((FIT/'qa/renders'/ (name+'.png')).relative_to(ROOT)).replace('\\','/') if name in list(views)[:6] else None,
                      'same_camera_low_baseline':str((LOW/'qa/renders'/ (name+'.png')).relative_to(ROOT)).replace('\\','/') if name in list(views)[:6] else None}
        print('RENDER',name,flush=True)
    if baseline:
        (RUN/'qa/baseline-close-renders.json').write_text(json.dumps({'source_low_blend_sha256':sha(blend),'renders':record},indent=2)+'\n',encoding='utf8')
        print('BASELINE_CLOSE_RENDERS',len(record),flush=True)
        return
    glove=bpy.data.objects['OriginalGripLowCandidate']
    material=bpy.data.materials.new('RenderOnlyTriangleWireShader')
    material.use_nodes=True
    nodes=material.node_tree.nodes;nodes.clear()
    wire=nodes.new('ShaderNodeWireframe');wire.use_pixel_size=True;wire.inputs['Size'].default_value=1.1
    color=nodes.new('ShaderNodeMixRGB');color.inputs[1].default_value=(.8,.82,.86,1.);color.inputs[2].default_value=(.008,.02,.04,1.)
    emission=nodes.new('ShaderNodeEmission');output=nodes.new('ShaderNodeOutputMaterial')
    material.node_tree.links.new(wire.outputs['Fac'],color.inputs[0])
    material.node_tree.links.new(color.outputs[0],emission.inputs['Color'])
    material.node_tree.links.new(emission.outputs[0],output.inputs['Surface'])
    glove.data.materials.clear();glove.data.materials.append(material)
    scene.camera=bpy.data.objects['four-finger-palm']
    image=out/'four-finger-palm-wire.png';scene.render.filepath=str(image)
    bpy.ops.render.render(write_still=True)
    record['four-finger-palm-wire']={'path':str(image.relative_to(ROOT)).replace('\\','/'),'sha256':sha(image),'camera_match':'four-finger-palm','render_only_shader':True}
    (RUN/'qa/renders.json').write_text(json.dumps({'status':'qa_failed_evidence','runtime_publish_allowed':False,
        'candidate_blend_sha256':sha(blend),'renders':record,'candidate_resaved':False},indent=2)+'\n',encoding='utf8')
    print('LOCAL_RENDERS',len(record),flush=True)


if __name__=='__main__':main()
