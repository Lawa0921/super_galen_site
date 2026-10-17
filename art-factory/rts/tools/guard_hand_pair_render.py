"""Inspection-only two-patch views. Does not save or alter either candidate."""
import bpy,hashlib,json,sys
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from guard_hand_pair_qa import ROOT,RUN,SOURCE,EXPECTED,INPUTS

assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==EXPECTED
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));source=bpy.data.objects['OriginalGripChannelCandidate']
for obj in bpy.data.objects:obj.hide_render=obj!=source


def material(name,color):
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    node=mat.node_tree.nodes['Principled BSDF'];node.inputs['Base Color'].default_value=(*color,1);node.inputs['Roughness'].default_value=.7
    return mat


source.data.materials.clear();source.data.materials.append(material('Inspection clay',(.17,.19,.22)))
for spec,color in zip(INPUTS,((.025,.32,.28),(.32,.13,.035))):
    path=RUN.parent/spec['run']/'candidate'/f'{spec["branch"]}-control-cage.blend'
    assert hashlib.sha256(path.read_bytes()).hexdigest()==spec['candidate_sha256']
    with bpy.data.libraries.load(str(path),link=False) as (available,loaded):loaded.objects=[spec['object']]
    patch=loaded.objects[0];bpy.context.collection.objects.link(patch);patch.hide_render=False
    patch.data.materials.clear();patch.data.materials.append(material(spec['branch'],color))
    wire=bpy.data.objects.new('Inspection wire '+spec['branch'],patch.data.copy());bpy.context.collection.objects.link(wire)
    wire.data.materials.clear();wire.data.materials.append(material('Wire '+spec['branch'],(.9,.62,.19)))
    offset=wire.modifiers.new('Inspection offset only','DISPLACE');offset.strength=.00006;offset.mid_level=0
    outline=wire.modifiers.new('Quad edges','WIREFRAME');outline.thickness=.00009

scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.world=bpy.data.worlds.new('Pair review world');scene.world.color=(.035,.035,.035)
scene.view_settings.look='AgX - Medium High Contrast'
for loc,power,size in [((.7,.8,.8),14,.6),((-.7,.4,.5),9,.6),((0,-.7,.7),12,.5)]:
    data=bpy.data.lights.new('Pair review softbox','AREA');data.energy=power;data.size=size
    obj=bpy.data.objects.new('Pair review softbox',data);bpy.context.collection.objects.link(obj);obj.location=loc
    obj.rotation_euler=(Vector((.07,.04,.163))-obj.location).to_track_quat('-Z','Y').to_euler()
views={'source-pair-front':((.2,.9,.21),(.076,.049,.162),.096,True),
    'open-pair-only':((.22,.9,.25),(.076,.049,.162),.096,False),
    'inner-pair-only':((.07,.012,.162),(.07,.05,.162),.096,False)}
out=RUN/'qa/renders';out.mkdir(exist_ok=True);records={}
for name,(loc,target,scale,show_source) in views.items():
    source.hide_render=not show_source
    data=bpy.data.cameras.new(name);data.type='ORTHO';data.ortho_scale=scale;data.clip_start=.001
    camera=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(camera);camera.location=loc
    camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
    path=out/f'{name}.png';scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
    records[name]={'path':str(path.relative_to(ROOT)).replace('\\','/'),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
(RUN/'qa/renders.json').write_text(json.dumps({'inputs':INPUTS,'geometry_resaved':False,'runtime_publish_allowed':False,'renders':records},indent=2)+'\n',encoding='utf-8')
