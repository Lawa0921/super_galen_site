"""Fit generated gloves to the mounted source without moving held equipment."""
import argparse,json,sys
from pathlib import Path
import bpy
from mathutils import Matrix,Vector
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
import generated_grip_fit as grip
from visual_guard_body_restore import trim_cuff
from visual_unit_grip_restore import remove_wrist_fragments
from visual_hand_rework import mesh_fingerprint

p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--run',type=Path,required=True);p.add_argument('--lod',type=int,required=True)
p.add_argument('--anatomical-grip',action='store_true')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve();lod=a.lod
for folder in ('raw','candidate','qa'):(run/folder).mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));rig=bpy.data.objects['MountedKnightRig'];body=bpy.data.objects[f'MountedKnightBody_LOD{lod}']
unchanged={o.name:mesh_fingerprint(o) for o in bpy.data.objects if o.type=='MESH' and o!=body and not o.name.startswith('KnightCommanderHand_') and not (a.anatomical_grip and o.name.startswith(('KnightLance_','KnightSunShield_')))}
world=rig.matrix_world.copy();rig.matrix_world=Matrix.Identity(4);bpy.context.view_layer.update()
tracks={t.name:t.strips[0].action.name for t in rig.animation_data.nla_tracks}
for t in rig.animation_data.nla_tracks:t.mute=True
wrists={'L':Vector((-.434176,-.046531,.911712)),'R':Vector((.409796,.089432,.902662))}
changes=[] if a.anatomical_grip else grip.canonical_wrist_pivots(rig,wrists,list(tracks.values()),tracks['Idle'])
g.set_action(rig,tracks['Idle']);bpy.context.scene.frame_set(0);ref=g.skin_matrices(rig)
cuts={} if a.anatomical_grip else {side:trim_cuff(body,rig,side) for side in 'LR'};fragments=0 if a.anatomical_grip else remove_wrist_fragments(body,wrists)
with bpy.data.libraries.load(str(grip.MASTER),link=False) as (available,loaded):loaded.meshes=available.meshes
master=bpy.data.objects.new('GeneratedMountedGripMaster',loaded.meshes[0]);bpy.context.collection.objects.link(master);sculpt=grip.sculpt_source(master);rows=[]
for side in 'LR':
 old=bpy.data.objects[f'KnightCommanderHand_{side}_LOD{lod}'];name=old.name;bpy.data.objects.remove(old,do_unlink=True)
 weapon=bpy.data.objects[('KnightLance_' if side=='R' else 'KnightSunShield_')+f'LOD{lod}']
 base_material='DarkSaddleLeather' if side=='R' else 'WornLeather'
 materials={m.name for m in weapon.data.materials if m.name.split('.')[0]==base_material}
 assert materials,('Missing source grip material',weapon.name,base_material)
 center,axis,radius,_,_=g.weapon_region(weapon,materials);skin=ref['Hand_'+side]
 row={'name':name,'side':side,'lod':lod,'grip':list(skin@center),'axis':list((skin.to_3x3()@axis).normalized()),'radius':radius,
      'wrist':list(ref['Forearm_'+side]@wrists[side]),'wrist_radius':.045,'preserve_weapon_anchor':not a.anatomical_grip,'grip_materials':list(materials),'cuff_radius':.045,'cuff_overlap_m':.035}
 obj=bpy.data.objects.new(name,master.data.copy());bpy.context.collection.objects.link(obj)
 rows.append(grip.fit(obj,rig,row,ref,None,weapon));obj.parent=rig;obj.matrix_parent_inverse=Matrix.Identity(4);obj.matrix_basis=Matrix.Identity(4)
bpy.data.objects.remove(master,do_unlink=True);rig.matrix_world=world
rig.animation_data.action=None
for obj in bpy.data.objects:
 if obj.animation_data:
  obj.animation_data.action=None
  for t in obj.animation_data.nla_tracks:t.mute=t.name!='Idle'
bpy.context.scene.frame_set(1);bpy.context.view_layer.update()
for name,digest in unchanged.items():assert mesh_fingerprint(bpy.data.objects[name])==digest,('Unrelated mesh changed',name)
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(run/f'raw/knight-lod{lod}.blend'))
report={'source':str(a.source),'lod':lod,'hands':rows,'sculpt':sculpt,'cuts':cuts,'removed_wrist_fragments':fragments,'wrist_changes':changes,'runtime_publish_allowed':False,'artistic_quality_proven':False}
(run/f'qa/knight-hand-build-lod{lod}.json').write_bytes((json.dumps(report,indent=2)+'\n').encode())
if a.anatomical_grip:
 for obj in bpy.data.objects:
  if obj.animation_data:
   obj.animation_data.action=None
   for t in obj.animation_data.nla_tracks:t.mute=False
 bpy.ops.object.select_all(action='DESELECT')
 for obj in bpy.data.objects:
  if obj.type in ('MESH','ARMATURE'):obj.select_set(True)
 bpy.context.view_layer.objects.active=rig
 bpy.ops.export_scene.gltf(filepath=str(run/'candidate'/('knight.glb' if lod==0 else 'knight-lod1.glb')),export_format='GLB',use_selection=True,export_yup=True,export_normals=True,export_texcoords=True,export_materials='EXPORT',export_extras=True,export_skins=True,export_def_bones=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_anim_slide_to_zero=True,export_image_format='JPEG',export_jpeg_quality=90)
