"""QA cameras in the generated hand's anatomical frame, with actual grip."""
import json,sys
from pathlib import Path
import bpy,bmesh
from mathutils import Vector,Matrix
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g

run=Path(sys.argv[sys.argv.index('--')+1]).resolve()
mounted='--mounted' in sys.argv
bpy.ops.wm.open_mainfile(filepath=str(run/('raw/knight-lod0.blend' if mounted else 'raw/guard-visual-rework.blend')))
rig=bpy.data.objects['MountedKnightRig'] if mounted else next(o for o in bpy.data.objects if o.type=='ARMATURE')
if mounted:
 for obj in bpy.data.objects:
  if obj.animation_data:
   obj.animation_data.action=None
   for track in obj.animation_data.nla_tracks:track.mute=track.name!='Idle'
else:g.set_action(rig,'Idle')
bpy.context.scene.frame_set(1 if mounted else 0)
rows=json.loads((run/('qa/knight-hand-build-lod0.json' if mounted else 'qa/hand-build.json')).read_bytes())['hands'];skin=g.skin_matrices(rig);scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.world=scene.world or bpy.data.worlds.new('Review world');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.1,.14,.16,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.6
for o in list(bpy.data.objects):
 if o.type in ('CAMERA','LIGHT'):bpy.data.objects.remove(o,do_unlink=True)
camera=bpy.data.objects.new('Anatomical camera',bpy.data.cameras.new('Anatomical camera'));scene.collection.objects.link(camera);scene.camera=camera;camera.data.type='ORTHO';camera.data.ortho_scale=.25
for row in rows:
 if row['lod']!=0:continue
 side=row['side'];obj=bpy.data.objects[row['name']];weapon=bpy.data.objects[(('KnightLance' if side=='R' else 'KnightSunShield') if mounted else ('KingdomSteelSword' if side=='R' else 'KingdomSunShield'))+'_LOD0']
 old=weapon.data;weapon.data=old.copy();bm=bmesh.new();bm.from_mesh(weapon.data)
 bmesh.ops.delete(bm,geom=[f for f in bm.faces if 'leather' not in weapon.data.materials[f.material_index].name.lower()],context='FACES');bm.to_mesh(weapon.data);bm.free()
 for o in bpy.data.objects:
  if o.type=='MESH':o.hide_render=o not in (obj,weapon)
 transform=Matrix(row['source_transform']);center=Vector(row['grip']);source_grip=Vector(row['source_grip'])
 if mounted:transform=rig.matrix_world.to_3x3()@transform;center=rig.matrix_world@center
 for view,source_direction in [('thumb',(1,0,0)),('knuckles',(.65,-1,.1)),('back',(-1,0,0))]:
  direction=(transform@Vector(source_direction)).normalized();up=(transform@Vector((0,0,1))).normalized()
  target=center+transform@(Vector((0,.02,.02))-source_grip)
  camera.location=target+direction*3
  right=up.cross(direction).normalized();up=direction.cross(right).normalized();camera.rotation_euler=Matrix((right,up,direction)).transposed().to_euler()
  lights=[]
  for name,offset,energy in [('Key',direction*2+up*2+right,250),('Fill',direction*2-right*2,120)]:
   light=bpy.data.objects.new(name,bpy.data.lights.new(name,'AREA'));light.location=target+offset;light.data.energy=energy;light.data.size=2
   light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler();scene.collection.objects.link(light);lights.append(light)
  scene.render.filepath=str(run/'qa'/f'anatomical-{side}-{view}.png');bpy.ops.render.render(write_still=True)
  for light in lights:bpy.data.objects.remove(light,do_unlink=True)
 temp=weapon.data;weapon.data=old;bpy.data.meshes.remove(temp)
