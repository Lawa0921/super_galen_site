"""Rejected six-bone carry experiment; fail before export on unreachable hands."""
import ast
import bpy
import hashlib
import json
import os
from pathlib import Path
import sys
from mathutils import Matrix, Vector

run=Path(sys.argv[sys.argv.index('--')+1]).resolve()
source=run/'geometry-candidate/original-crossbow-grip.blend'
assert hashlib.sha256(source.read_bytes()).hexdigest()=='eda11af6d0be24b6169e6e853640a09e2adb9d048dc3e82e634ad86528fd9d85'
bpy.ops.wm.open_mainfile(filepath=str(source));rig=bpy.data.objects['crossbowRig20']
report=json.loads((run/'geometry-candidate/weapon-candidate-report.json').read_text())
old=json.loads((run.parent.parent/'original-crossbow-waist/2026-10-06-v1/candidate/grip-candidate-report.json').read_text())
channel={s:Vector(old['fitted_grips'][s]['channel_local_bone']) for s in ('R','L')}
rig.animation_data.action=bpy.data.actions['Idle'];rig.animation_data.action_slot=bpy.data.actions['Idle'].slots[0]
bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
flat_rotation=rig.pose.bones['Hand_R'].matrix.to_quaternion()
relative=rig.pose.bones['Hand_R'].matrix.inverted()@rig.pose.bones['Hand_L'].matrix
weapons=[bpy.data.objects[f'CrossbowWeapon_LOD{lod}'] for lod in (0,1)]
points=[v.co.copy() for w in weapons for v in w.data.vertices]
constraints={};targets={};poles={}
for side in ('R','L'):
    for mapping,prefix in [(targets,'OriginalClearCarryTarget'),(poles,'OriginalClearCarryPole')]:
        obj=bpy.data.objects.new(prefix+side,None);bpy.context.scene.collection.objects.link(obj);mapping[side]=obj
    c=rig.pose.bones['Hand_'+side].constraints.new('IK');c.name='OriginalClearCarryIK'
    c.target=targets[side];c.pole_target=poles[side];c.chain_count=3;c.use_stretch=False;c.use_rotation=True;c.orient_weight=1;c.mute=True
    constraints[side]=c
names={part+'_'+side for part in ('UpperArm','Forearm','Hand') for side in ('R','L')}
all_captured={};rows=[]
for clip in ('Idle','Walk','Attack','Hurt','Death'):
    action=bpy.data.actions[clip];rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
    captured={}
    for frame in range(round(action.frame_range[1])+1):
        for c in constraints.values():c.mute=True
        bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
        original={pb.name:pb.matrix.copy() for pb in rig.pose.bones}
        t=max(0,min(1,(frame-12)/22)) if clip=='Death' else 0;blend=t*t*(3-2*t)
        rotation=original['Hand_R'].to_quaternion().slerp(flat_rotation,blend)
        chest=original['SpineUpper']@rig.data.bones['SpineUpper'].matrix_local.inverted()
        shift=(chest.to_quaternion()@Vector((0,.22,0))).lerp(Vector((.22,.38,.02)),blend)
        centre=original['Hand_R']@channel['R']+shift
        desired=Matrix.LocRotScale(centre-rotation@channel['R'],rotation,Vector((1,1,1)))
        skin=desired@rig.data.bones['Hand_R'].matrix_local.inverted();low=min((skin@p).z for p in points)
        lift=max(0,.015-low);desired.translation.z+=lift
        for side,sign in [('R',1),('L',-1)]:poles[side].location=chest@Vector((sign*.46,.10,1.20))
        desired_right=desired.copy()
        for side in ('R','L'):
            if side=='L':desired=rig.pose.bones['Hand_R'].matrix@relative
            targets[side].location=desired@Vector((0,rig.data.bones['Hand_'+side].length,0))
            targets[side].rotation_mode='QUATERNION';targets[side].rotation_quaternion=desired.to_quaternion()
            constraints[side].mute=False;bpy.context.view_layer.update()
        captured[frame]={pb.name:pb.matrix.copy() for pb in rig.pose.bones}
        rows.append({'clip':clip,'frame':frame,'blend':blend,'shift':list(shift),'lift_m':lift,
                     'right_target_error_m':((rig.pose.bones['Hand_R'].matrix@channel['R'])-(desired_right@channel['R'])).length,
                     'left_target_error_m':((rig.pose.bones['Hand_L'].matrix@channel['L'])-(desired@channel['L'])).length})
    all_captured[clip]=captured
errors={side:max(row[side+'_target_error_m'] for row in rows) for side in ('right','left')}
if max(errors.values())>.005:
    (run/'qa/unreachable-carry.json').write_text(json.dumps({'pass':False,'errors_m':errors,'rows':rows,'reason':'Fixed wrist target outside the unstretched arm workspace; no new candidate saved.'},indent=2)+'\n')
    raise RuntimeError('Original carry is unreachable; do not export: '+json.dumps(errors))
for side,c in constraints.items():rig.pose.bones['Hand_'+side].constraints.remove(c)
for obj in [*targets.values(),*poles.values()]:bpy.data.objects.remove(obj,do_unlink=True)
for clip,captured in all_captured.items():
    action=bpy.data.actions[clip];rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0];previous={}
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
report['carry_revision']={'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'bones':sorted(names),'rows':rows,
                        'reason':'Original ready channel is inside breastplate; author forward carry and an outward death path, preserving non-arm motion.'}
report['files']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (run/'candidate').iterdir() if p.suffix in ('.blend','.glb')}
(run/'candidate/weapon-candidate-report.json').write_text(json.dumps(report,indent=2)+'\n')
print('ORIGINAL_CARRY',json.dumps({'max_target_errors_m':{s:max(r[s+'_target_error_m'] for r in rows) for s in ('left','right')},'files':report['files']}))
