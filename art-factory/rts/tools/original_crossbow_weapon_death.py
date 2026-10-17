"""Author original death arm poses to keep the new bow above the ground.

Only six arm bones in Death change. Keep the original torso/legs/head fall,
all other clips, every bind bone and every mesh. No external motion inputs.
"""
import ast
import bpy
import hashlib
import json
import math
import os
from pathlib import Path
import sys
from mathutils import Matrix, Vector

run=Path(sys.argv[sys.argv.index('--')+1]).resolve()
source=run/'geometry-candidate/original-crossbow-grip.blend'
assert hashlib.sha256(source.read_bytes()).hexdigest()=='eda11af6d0be24b6169e6e853640a09e2adb9d048dc3e82e634ad86528fd9d85'
bpy.ops.wm.open_mainfile(filepath=str(source));rig=bpy.data.objects['crossbowRig20']
report=json.loads((run/'candidate/weapon-candidate-report.json').read_text())
old=json.loads((run.parent.parent/'original-crossbow-waist/2026-10-06-v1/candidate/grip-candidate-report.json').read_text())
channel={s:Vector(old['fitted_grips'][s]['channel_local_bone']) for s in ('R','L')}
rest_center=Vector(report['grip_channel_bind_space']['R']['center'])
weapons=[bpy.data.objects[f'CrossbowWeapon_LOD{lod}'] for lod in (0,1)]
points=[v.co.copy() for w in weapons for v in w.data.vertices]
action=bpy.data.actions['Death'];rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
flat_rotation=rig.pose.bones['Hand_R'].matrix.to_quaternion()
relative=rig.pose.bones['Hand_R'].matrix.inverted()@rig.pose.bones['Hand_L'].matrix
constraints={};targets={};poles={}
for side in ('R','L'):
    for mapping,prefix in [(targets,'OriginalDeathTarget'),(poles,'OriginalDeathPole')]:
        obj=bpy.data.objects.new(prefix+side,None);bpy.context.scene.collection.objects.link(obj);mapping[side]=obj
    c=rig.pose.bones['Hand_'+side].constraints.new('IK');c.name='OriginalDeathGroundedIK'
    c.target=targets[side];c.pole_target=poles[side];c.chain_count=3;c.use_stretch=False;c.use_rotation=True;c.orient_weight=1
    c.mute=True;constraints[side]=c
captured={};rows=[]
for frame in range(51):
    for c in constraints.values():c.mute=True
    bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
    original={pb.name:pb.matrix.copy() for pb in rig.pose.bones}
    t=max(0,min(1,(frame-12)/22));blend=t*t*(3-2*t)
    right_rotation=original['Hand_R'].to_quaternion().slerp(flat_rotation,blend)
    centre=original['Hand_R']@channel['R']
    desired=Matrix.LocRotScale(centre-right_rotation@channel['R'],right_rotation,Vector((1,1,1)))
    skin=desired@rig.data.bones['Hand_R'].matrix_local.inverted()
    min_z=min((skin@p).z for p in points)
    lift=max(0,.015-min_z)
    desired.translation.z+=lift
    chest=original['SpineUpper']@rig.data.bones['SpineUpper'].matrix_local.inverted()
    for side,sign in [('R',1),('L',-1)]:poles[side].location=chest@Vector((sign*.46,.10,1.20))
    for side in ('R','L'):
        if side=='L':desired=rig.pose.bones['Hand_R'].matrix@relative
        targets[side].location=desired@Vector((0,rig.data.bones['Hand_'+side].length,0))
        targets[side].rotation_mode='QUATERNION';targets[side].rotation_quaternion=desired.to_quaternion()
        constraints[side].mute=False;bpy.context.view_layer.update()
    captured[frame]={pb.name:pb.matrix.copy() for pb in rig.pose.bones}
    rskin=rig.pose.bones['Hand_R'].matrix@rig.data.bones['Hand_R'].matrix_local.inverted()
    rows.append({'frame':frame,'flatten_blend':blend,'target_lift_m':lift,'weapon_min_z_m':min((rskin@p).z for p in points),
                 'left_pose_target_max_error':max(abs(rig.pose.bones['Hand_L'].matrix[i][j]-desired[i][j]) for i in range(4) for j in range(4))})
for side,c in constraints.items():rig.pose.bones['Hand_'+side].constraints.remove(c)
for obj in [*targets.values(),*poles.values()]:bpy.data.objects.remove(obj,do_unlink=True)
names={part+'_'+side for part in ('UpperArm','Forearm','Hand') for side in ('R','L')}
previous={}
for frame,matrices in captured.items():
    for name in names:
        pb=rig.pose.bones[name]
        local=pb.bone.convert_local_to_pose(matrices[name],pb.bone.matrix_local,invert=True,
          parent_matrix=matrices[pb.parent.name],parent_matrix_local=pb.parent.bone.matrix_local)
        loc,rot,scale=local.decompose()
        if name in previous:rot.make_compatible(previous[name])
        previous[name]=rot.copy();pb.rotation_mode='QUATERNION';pb.location=loc;pb.rotation_quaternion=rot;pb.scale=scale
        for key in ('location','rotation_quaternion','scale'):pb.keyframe_insert(data_path=key,frame=frame,group=name)
for layer in action.layers:
    for strip in layer.strips:
        for slot in action.slots:
            bag=strip.channelbag(slot)
            if bag:
                for curve in bag.fcurves:
                    if any('"'+name+'"' in curve.data_path for name in names):
                        for key in curve.keyframe_points:key.interpolation='LINEAR'
rig.animation_data.action=bpy.data.actions['Idle'];rig.animation_data.action_slot=bpy.data.actions['Idle'].slots[0]
bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(run/'candidate/original-crossbow-grip.blend'))
exporter=Path(__file__).with_name('original_crossbow_grip_build.py');tree=ast.parse(exporter.read_text(encoding='utf-8'))
fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='export_lod');ns={'bpy':bpy,'os':os}
exec(compile(ast.Module(body=[fn],type_ignores=[]),str(exporter),'exec'),ns)
bodies=[bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'] for lod in (0,1)]
hands=[bpy.data.objects['OriginalCrossbowClosedGrip_'+s] for s in ('R','L')]
for lod in (0,1):ns['export_lod'](rig,bodies,weapons,[],hands,str(run/f'candidate/original-crossbow-grip-lod{lod}.glb'),bodies[lod].name,weapons[lod].name)
report['death_revision']={'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'bones':sorted(names),'rows':rows,
                        'reason':'Existing original Death carries the bow with the falling torso and passes it through the ground; retain body fall and reauthor only arms.'}
report['files']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (run/'candidate').iterdir() if p.suffix in ('.blend','.glb')}
(run/'candidate/weapon-candidate-report.json').write_text(json.dumps(report,indent=2)+'\n')
print('ORIGINAL_DEATH',json.dumps({'weapon_min_z_m':min(r['weapon_min_z_m'] for r in rows),'left_pose_target_max_error':max(r['left_pose_target_max_error'] for r in rows),'files':report['files']}))
