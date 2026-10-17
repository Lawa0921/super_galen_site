"""Isolate original skirt rest geometry, deformation and albedo without saving source."""
import bpy,hashlib,json,sys
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_waist_verify import measure_belt
ROOT=Path(__file__).resolve().parents[3]
SOURCE=ROOT/'art-factory/rts/runs/original-crossbow-body-surface/2026-10-06-v1/candidate/original-crossbow-grip.blend'
RUN=ROOT/'art-factory/rts/runs/original-crossbow-drape/2026-10-06-v1'
def main():
    global SOURCE
    canonical='--canonical' in sys.argv;candidate='--candidate' in sys.argv;prefix='canonical' if canonical else 'candidate' if candidate else 'baseline'
    if canonical:SOURCE=ROOT/'tmp/rts/body-before-cuff.blend'
    elif candidate:SOURCE=RUN/'candidate/original-crossbow-grip.blend'
    else:assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()=='91d1048ab31dad70e4e66b2a99cea3d666de6e8fb201f9a084f16c00b5922ffe'
    out=RUN/'qa';out.mkdir(parents=True,exist_ok=True);bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['crossbowRig20'];scene=bpy.context.scene
    belt={} if canonical else measure_belt();rows=[]
    for lod in (() if canonical else (0,1)):
        obj=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];points=[]
        for vert in obj.data.vertices:
            if .66<vert.co.z<1.21 and abs(vert.co.x)<.325:
                weights={obj.vertex_groups[g.group].name:g.weight for g in vert.groups}
                arm=sum(w for n,w in weights.items() if 'Arm' in n or 'Hand' in n or 'Shoulder' in n)
                if arm:points.append({'index':vert.index,'rest':list(vert.co),'arm_weight':arm,'weights':weights})
        rows.append({'lod':lod,'arm_influenced_waist_vertices':points})
    report={'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'belt':belt,'waist_weights':rows,'runtime_publish_allowed':False}
    (out/f'{prefix}-analysis.json').write_text(json.dumps(report,indent=2)+'\n');print('DRAPE_DIAG',json.dumps({'belt':belt,'waist_arm_points':[len(r['arm_influenced_waist_vertices']) for r in rows]}))
    if '--measure-only' in sys.argv:return
    body=bpy.data.objects['OriginalCrossbowCanonicalBody' if canonical else 'crossbowOriginalBody_LOD0'];originals=list(body.data.materials)
    clay=bpy.data.materials.new('QAClay');shader=clay.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.6,.6,.6,1);shader.inputs['Roughness'].default_value=.9
    unlit_materials=[]
    for original in originals:
        unlit=original.copy();nodes=unlit.node_tree.nodes;output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL');bsdf=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');color=bsdf.inputs['Base Color'].links[0].from_socket
        emission=nodes.new('ShaderNodeEmission');unlit.node_tree.links.new(color,emission.inputs['Color']);unlit.node_tree.links.new(emission.outputs[0],output.inputs['Surface']);unlit_materials.append(unlit)
    for obj in bpy.data.objects:
        if obj.type=='MESH':obj.hide_render=obj!=body
    scene.render.engine='BLENDER_EEVEE';scene.eevee.taa_render_samples=48;scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
    camera=scene.camera;camera.data.type='ORTHO';camera.data.ortho_scale=.78;target=Vector((0,0,.955))
    for clip,frame in ([('Rest',0)] if canonical else [('Rest',0),('Idle',0),('Hurt',8),('Walk',10)]):
        rig.data.pose_position='REST' if clip=='Rest' else 'POSE';a=bpy.data.actions['Idle' if clip=='Rest' else clip];rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0];scene.frame_set(frame)
        for mode,materials in [('clay',[clay]*len(originals)),('albedo',unlit_materials),('lit',originals)]:
            for i,material in enumerate(materials):body.data.materials[i]=material
            bpy.context.view_layer.update()
            for view,xyz in [('front',(0,4,.3)),('back',(0,-4,.3))]:
                camera.location=target+Vector(xyz);camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(out/f'{prefix}-{clip}-{frame}-{mode}-{view}.png');bpy.ops.render.render(write_still=True)
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==report['source_sha256']
if __name__=='__main__':main()
