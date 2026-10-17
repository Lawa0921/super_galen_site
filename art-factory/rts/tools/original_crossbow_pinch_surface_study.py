"""Isolate the actual precision grip before accepting any full-arm retarget."""
import bpy, json, sys, math, hashlib
from pathlib import Path
from mathutils import Matrix, Vector, Quaternion
sys.path.insert(0, str(Path(__file__).parent))
from original_crossbow_pinch_surface_probe import ROOT, RUN, SOURCE
from original_crossbow_attack_probe import activate
from original_crossbow_carry_build import put_keys

bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
bpy.context.preferences.filepaths.save_version = 0
rig = bpy.data.objects['crossbowRig20']; activate(rig, 'Attack', 54)
data = json.loads((RUN/'raw/pinch-surfaces.json').read_text())
layout = json.loads((RUN/'raw/pinch-layout.json').read_text())
anchor = Matrix(data['source_bones']['Hand_L']['matrix'])
pose = {b.name: b.matrix.copy() for b in rig.pose.bones}
world = pose['HandPalm_L'] @ anchor.inverted()
for name, params in layout['fingers'].items():
    head = Matrix(data['source_bones'][name+'1_L']['matrix']).translation.copy()
    turn = Quaternion((0,0,1), math.radians(params['swing_z_degrees']))
    for i, angle in enumerate(params['angles_degrees'], 1):
        bone = data['source_bones'][f'{name}{i}_L']
        turn = turn @ Quaternion(Vector(bone['axis']), math.radians(angle))
        q = turn @ Matrix(bone['matrix']).to_quaternion()
        pose[f'{name}{i}_L'] = world @ Matrix.LocRotScale(head, q, Vector((1,1,1)))
        head += q @ Vector((0,bone['length'],0))
bolt = Matrix(data['bolt']['baseline_matrix'])
bolt.translation = Vector(layout['contact_source']) - bolt.to_3x3() @ Vector((0,layout['bolt_contact_y'],0))
pose['LoadedBolt'] = world @ bolt
action = bpy.data.actions.new('PinchStudy'); rig.animation_data.action = action
put_keys(rig, action, {0.: pose}, set(pose))
activate(rig, 'PinchStudy', 0)
output = RUN/'candidate/pinch-study.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(output))
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'; scene.eevee.taa_render_samples = 32
scene.render.resolution_x = 1000; scene.render.resolution_y = 850; scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'; scene.render.film_transparent = False
for obj in scene.objects:
    if obj.type == 'MESH': obj.hide_render = obj.name not in {'OriginalCrossbowArticulatedHand_L','OriginalLoadedBolt'}
camera = scene.camera; camera.data.type = 'ORTHO'; camera.data.ortho_scale = .36
target = world @ Vector(layout['contact_source'])
for name, offset in [('palm',(0,-.6,.25)),('side',(.6,-.15,.12)),('back',(0,.6,.15))]:
    camera.location = target + world.to_3x3() @ Vector(offset)
    camera.rotation_euler = (target-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath = str(RUN/f'qa/pinch-{name}.png'); bpy.ops.render.render(write_still=True)
print('PINCH_STUDY', hashlib.sha256(output.read_bytes()).hexdigest())
