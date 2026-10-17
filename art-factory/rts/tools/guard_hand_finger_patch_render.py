"""Inspection renders only; display wire offset never changes the saved cage."""
import bpy,hashlib,json,sys
from mathutils import Vector
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from guard_hand_surface_chart import ROOT,RUN

adjacent='--adjacent' in sys.argv
owned='--owned-control' in sys.argv or adjacent
if owned:RUN=ROOT/'art-factory/rts/runs/guard-right-hand-cage/2026-10-08-v2'
if adjacent:RUN=ROOT/'art-factory/rts/runs/guard-right-hand-cage/2026-10-08-v3-adjacent'
candidate=RUN/('candidate/finger-band-03-control-cage.blend' if adjacent else 'candidate/finger-band-02-control-cage.blend' if owned else 'candidate/finger-band-02-open-patch.blend')
bpy.ops.wm.open_mainfile(filepath=str(candidate))
patch=bpy.data.objects['GuardFingerBand03_OpenPatch' if adjacent else 'GuardFingerBand02_OpenPatch'];source=bpy.data.objects['OriginalGripChannelCandidate']
for obj in bpy.data.objects:obj.hide_render=obj not in (source,patch)
def material(name,color):
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    node=mat.node_tree.nodes['Principled BSDF'];node.inputs['Base Color'].default_value=(*color,1);node.inputs['Roughness'].default_value=.7
    return mat
source.data.materials.clear();source.data.materials.append(material('Inspection source clay',(.28,.31,.35)))
patch.data.materials.clear();patch.data.materials.append(material('Measured open patch',(.02,.3,.28)))
wire=bpy.data.objects.new('Inspection wire only',patch.data.copy());bpy.context.collection.objects.link(wire)
wire.data.materials.clear();wire.data.materials.append(material('Inspection wire',(.9,.48,.07)))
offset=wire.modifiers.new('Display offset only','DISPLACE');offset.strength=.00006;offset.mid_level=0
wireframe=wire.modifiers.new('Editable quad inspection','WIREFRAME');wireframe.thickness=.00009
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.world=bpy.data.worlds.new('Inspection world');scene.world.color=(.06,.06,.06)
scene.view_settings.look='AgX - Medium High Contrast'
for loc,power,size in [((.7,.8,.8),70,.6),((-.7,.4,.5),45,.6),((0,-.7,.7),65,.5)]:
    data=bpy.data.lights.new('Inspection area','AREA');data.energy=power*(.2 if owned else 1);data.size=size
    obj=bpy.data.objects.new('Inspection area',data);bpy.context.collection.objects.link(obj);obj.location=loc
    obj.rotation_euler=(Vector((0,0,.17))-obj.location).to_track_quat('-Z','Y').to_euler()
focus_z=.18 if adjacent else .145
views={'whole-source':((0,1,.22),(0,0,.17),.36,True),
    'finger-source-detail':((.2,.9,.23),(.076,.049,focus_z),.063,True),
    'open-patch-only':((.22,.9,.29),(.076,.049,focus_z),.065,False)}
out=RUN/('qa/control-renders' if owned else 'qa/renders');out.mkdir(exist_ok=True);records={}
for name,(loc,target,scale,show_source) in views.items():
    source.hide_render=not show_source
    data=bpy.data.cameras.new(name);data.type='ORTHO';data.ortho_scale=scale
    camera=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(camera);camera.location=loc
    camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
    path=out/(name+'.png');scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
    records[name]={'path':str(path.relative_to(ROOT)).replace('\\','/'),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
(RUN/('qa/owned-control-renders.json' if owned else 'qa/finger-patch-renders.json')).write_text(json.dumps({'candidate_sha256':hashlib.sha256(candidate.read_bytes()).hexdigest(),'runtime_publish_allowed':False,'geometry_resaved':False,'renders':records},indent=2)+'\n',encoding='utf-8')
