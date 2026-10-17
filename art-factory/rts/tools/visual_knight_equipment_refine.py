"""Rotate held equipment about the physical cuff, preserving generated meshes."""
import argparse,json,math,sys
from pathlib import Path
import bpy
from mathutils import Matrix,Quaternion,Vector
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from visual_priest_staff_refine import capture,restore,write_keys
from visual_hand_rework import mesh_fingerprint
from original_crossbow_grip_math import solve_two_bone

WRISTS={'L':Vector((-.434176,-.046531,.911712)),'R':Vector((.409796,.089432,.902662))}

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--run',type=Path,required=True);p.add_argument('--lod',type=int,required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve()
    for folder in ('raw','candidate','qa'):(run/folder).mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));rig=bpy.data.objects['MountedKnightRig']
    meshes={o.name:mesh_fingerprint(o) for o in bpy.data.objects if o.type=='MESH'}
    tracks={t.name:t.strips[0].action.name for t in rig.animation_data.nla_tracks}
    for t in rig.animation_data.nla_tracks:t.mute=True
    g.set_action(rig,tracks['Idle']);bpy.context.scene.frame_set(40)
    fore=rig.pose.bones['Forearm_L'];hand=rig.pose.bones['Hand_L'];idle_wrist=(fore.matrix@fore.bone.matrix_local.inverted())@WRISTS['L']
    idle_hand=Matrix.Translation(idle_wrist)@Quaternion((0,0,1),math.radians(25)).to_matrix().to_4x4()@Matrix.Translation(-idle_wrist)@hand.matrix
    anchor=idle_wrist+Vector((-.03,0,.03))
    axes={}
    for side,prefix,material in (('R','KnightLance','DarkSaddleLeather'),('L','KnightSunShield','WornLeather')):
        weapon=bpy.data.objects[f'{prefix}_LOD{a.lod}'];materials={m.name for m in weapon.data.materials if m.name.split('.')[0]==material}
        _,axes[side],_,_,_=g.weapon_region(weapon,materials)
    for clip,action in tracks.items():
        original=capture(rig,action,samples_per_frame=4);desired={}
        for frame,row in original.items():
            restore(rig,row);desired[frame]={}
            for side,angle in (('R',110),('L',25)):
                hand=rig.pose.bones['Hand_'+side];fore=rig.pose.bones['Forearm_'+side]
                pivot=(fore.matrix@fore.bone.matrix_local.inverted())@WRISTS[side]
                if side=='L' and clip=='Death':
                    upper=rig.pose.bones['UpperArm_L'];shoulder=upper.head.copy();old_elbow=fore.head.copy();source_hand=hand.matrix.copy()
                    upper_q=upper.matrix.to_quaternion();fore_q=fore.matrix.to_quaternion();t=g.smooth((frame-1)/8)
                    target=anchor.lerp(pivot+Vector((-.10,0,.08)),t);pole=(old_elbow-shoulder).normalized()
                    elbow,endpoint=map(Vector,solve_two_bone(tuple(shoulder),tuple(target),tuple(pole),(old_elbow-shoulder).length,(pivot-old_elbow).length))
                    uq=(old_elbow-shoulder).normalized().rotation_difference((elbow-shoulder).normalized())@upper_q
                    fq=(pivot-old_elbow).normalized().rotation_difference((endpoint-elbow).normalized())@fore_q
                    upper.matrix=Matrix.LocRotScale(shoulder,uq,Vector((1,1,1)));bpy.context.view_layer.update()
                    fore.matrix=Matrix.LocRotScale(elbow,fq,Vector((1,1,1)));bpy.context.view_layer.update()
                    q0=idle_hand.to_quaternion();q1=source_hand.to_quaternion();q0.make_compatible(q1);q=q0.slerp(q1,t)
                    local_cuff=source_hand.inverted()@pivot;matrix=Matrix.LocRotScale(Vector(),q,source_hand.to_scale());matrix.translation=endpoint-(matrix@local_cuff)
                    hand.matrix=matrix;bpy.context.view_layer.update()
                    for bone in (upper,fore):desired[frame][bone.name]=(bone.location.copy(),bone.rotation_quaternion.copy())
                else:
                    axis=(g.skin_matrices(rig)['Hand_'+side].to_3x3()@axes[side]).normalized() if side=='R' else Vector((0,0,1))
                    rotation=Quaternion(axis,math.radians(angle)).to_matrix().to_4x4()
                    hand.matrix=Matrix.Translation(pivot)@rotation@Matrix.Translation(-pivot)@hand.matrix
                    bpy.context.view_layer.update()
                desired[frame][hand.name]=(hand.location.copy(),hand.rotation_quaternion.copy())
        write_keys(rig,action,desired)
    for name,fingerprint in meshes.items():assert mesh_fingerprint(bpy.data.objects[name])==fingerprint,('Unrelated geometry changed',name)
    for obj in bpy.data.objects:
        if obj.animation_data:
            obj.animation_data.action=None
            for track in obj.animation_data.nla_tracks:track.mute=track.name!='Idle'
    bpy.context.scene.frame_set(1);bpy.context.view_layer.update();bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(run/f'raw/knight-lod{a.lod}.blend'))
    for obj in bpy.data.objects:
        if obj.animation_data:
            obj.animation_data.action=None
            for track in obj.animation_data.nla_tracks:track.mute=False
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.data.objects:
        if obj.type in ('MESH','ARMATURE'):obj.select_set(True)
    bpy.context.view_layer.objects.active=rig
    bpy.ops.export_scene.gltf(filepath=str(run/'candidate'/('knight.glb' if a.lod==0 else 'knight-lod1.glb')),export_format='GLB',use_selection=True,export_yup=True,export_normals=True,export_texcoords=True,export_materials='EXPORT',export_extras=True,export_skins=True,export_def_bones=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_anim_slide_to_zero=True,export_image_format='JPEG',export_jpeg_quality=90)
    report={'source':str(a.source),'lod':a.lod,'lance_roll_degrees':110,'shield_nondeath_fixed_Z_degrees':25,'shield_death_anatomical_IK':{'carry_offset':[-.03,0,.03],'fall_offset':[-.10,0,.08],'transition_frames':[1,9]},'unchanged_mesh_fingerprints':meshes,'clips':list(tracks),'runtime_publish_allowed':False,'artistic_quality_proven':False}
    (run/f'qa/equipment-build-lod{a.lod}.json').write_text(json.dumps(report,indent=2)+'\n')

if __name__=='__main__':main()
