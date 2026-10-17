"""Complete digit shape inspection only; candidate geometry is never resaved."""
import bpy,hashlib,json,sys
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from guard_digit02_shape import ROOT,RUN

report=json.loads((RUN/'qa/shape.json').read_text(encoding='utf-8'));candidate=RUN/'candidate/guard-right-digit02-shape.blend'
assert hashlib.sha256(candidate.read_bytes()).hexdigest()==report['candidate_sha256']
bpy.ops.wm.open_mainfile(filepath=str(candidate));shape=bpy.data.objects['GuardRightDigit02_ShapeMaster'];source=bpy.data.objects['OriginalGripChannelCandidate']
for obj in bpy.data.objects:obj.hide_render=True
shape.hide_render=False


def material(name,color):
    mat=bpy.data.materials.new(name);mat.use_nodes=True;node=mat.node_tree.nodes['Principled BSDF']
    node.inputs['Base Color'].default_value=(*color,1);node.inputs['Roughness'].default_value=.7
    return mat


shape.data.materials.clear();shape.data.materials.append(material('Original shape clay',(.17,.32,.29)))
source.data.materials.clear();source.data.materials.append(material('Source reference clay',(.17,.19,.22)))
wire=bpy.data.objects.new('Editable shape inspection wire',shape.data.copy());bpy.context.collection.objects.link(wire)
wire.data.materials.clear();wire.data.materials.append(material('Inspection wire',(.9,.6,.18)))
offset=wire.modifiers.new('Display offset only','DISPLACE');offset.strength=.00006;offset.mid_level=0
outline=wire.modifiers.new('Authored face edges','WIREFRAME');outline.thickness=.000075
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.world=bpy.data.worlds.new('Shape review world');scene.world.color=(.035,.035,.035)
scene.view_settings.look='AgX - Medium High Contrast'
for loc,power,size in [((.7,.8,.8),14,.6),((-.7,.4,.5),9,.6),((0,-.7,.7),12,.5)]:
    data=bpy.data.lights.new('Shape review softbox','AREA');data.energy=power;data.size=size
    obj=bpy.data.objects.new('Shape review softbox',data);bpy.context.collection.objects.link(obj);obj.location=loc
    obj.rotation_euler=(Vector((.07,.04,.145))-obj.location).to_track_quat('-Z','Y').to_euler()
views={'source-context':((.2,.9,.23),(.07,.035,.145),.12,True,True),
    'shape-front':((.2,.9,.23),(.07,.035,.145),.12,False,True),
    'shape-channel':((.07,.013,.145),(.07,.06,.145),.12,False,True),
    'shape-axial':((.1,.03,.7),(.07,.035,.145),.12,False,True),
    'shape-oblique-clay':((.5,.4,.5),(.07,.035,.145),.12,False,False)}
out=RUN/'qa/renders';out.mkdir(exist_ok=True);renders={}
points=[shape.matrix_world@v.co for v in shape.data.vertices]
center=Vector(tuple((min(p[i] for p in points)+max(p[i] for p in points))/2 for i in range(3)))
full_shape_scale=max((p-center).length for p in points)*2.24
for name,(location,target,scale,show_source,show_wire) in views.items():
    if not show_source:target=center;scale=full_shape_scale
    source.hide_render=not show_source;wire.hide_render=not show_wire
    data=bpy.data.cameras.new(name);data.type='ORTHO';data.ortho_scale=scale;data.clip_start=.001
    camera=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(camera);camera.location=location
    camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
    path=out/f'{name}.png';scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
    renders[name]={'path':str(path.relative_to(ROOT)).replace('\\','/'),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
(RUN/'qa/renders.json').write_text(json.dumps({'candidate_sha256':report['candidate_sha256'],'geometry_resaved':False,'runtime_publish_allowed':False,'renders':renders},indent=2)+'\n',encoding='utf-8')
