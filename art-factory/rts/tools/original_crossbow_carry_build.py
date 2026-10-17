"""Author reachable original eight-bone carry and a backward grounded fall."""
import ast,bpy,hashlib,json,math,os,shutil,sys
from pathlib import Path
from mathutils import Matrix,Vector
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_interface_probe import ready,evaluated,RUN,SOURCE
from original_crossbow_carry_solve import arm_matrices,protract_shoulders

NAMES={part+'_'+side for part in ('Shoulder','UpperArm','Forearm','Hand') for side in ('R','L')}

def smooth(value):
    value=max(0,min(1,value));return value*value*(3-2*value)

def set_action(rig,name):
    action=bpy.data.actions[name];rig.animation_data_create();rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
    return action

def put_keys(rig,action,captured,names):
    previous={}
    for frame,matrices in captured.items():
        for name in names:
            pb=rig.pose.bones[name]
            kwargs={'parent_matrix':matrices[pb.parent.name],'parent_matrix_local':pb.parent.bone.matrix_local} if pb.parent else {}
            local=pb.bone.convert_local_to_pose(matrices[name],pb.bone.matrix_local,invert=True,**kwargs)
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

def main():
    mother=RUN/('seam-candidate' if '--seam' in sys.argv else 'interface-candidate');mother.mkdir(exist_ok=True)
    for name in ('original-crossbow-grip.blend','cuff-rebuild-report.json'):
        if not (mother/name).exists():shutil.copy2(RUN/'candidate'/name,mother/name)
    bpy.ops.wm.open_mainfile(filepath=str(mother/'original-crossbow-grip.blend'));rig=bpy.data.objects['crossbowRig20']
    set_action(rig,'Idle');bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
    neutral={pb.name:pb.matrix.copy() for pb in rig.pose.bones}
    target_neutral,_=ready(rig)
    relative=neutral['Hand_R'].inverted()@neutral['Hand_L']
    captured_all={};rows=[]
    for clip in ('Idle','Walk','Attack','Hurt','Death'):
        action=set_action(rig,clip);captured={}
        for frame in range(round(action.frame_range[1])+1):
            bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
            original={pb.name:pb.matrix.copy() for pb in rig.pose.bones}
            if clip=='Death':
                root=original['Root'];delta=root.to_quaternion()@neutral['Root'].to_quaternion().inverted()
                backward=Matrix.LocRotScale(root.translation,delta.inverted()@neutral['Root'].to_quaternion(),Vector((1,1,1)))
                change=backward@root.inverted();original={name:change@matrix for name,matrix in original.items()}
            chest=original['SpineUpper']@neutral['SpineUpper'].inverted()
            # Reauthor all arm motion. The old IK-baked Attack/Hurt wrist
            # rotations contain branch changes and must not be transplanted.
            local_right=target_neutral['Hand_R'].copy()
            forward=(target_neutral['Hand_R']@rig.data.bones['Hand_R'].matrix_local.inverted()).to_3x3()@Vector((0,1,0))
            if clip=='Idle':local_right.translation.z+=.0025*math.sin(frame*math.tau/40)
            elif clip=='Walk':local_right.translation.z+=.0035*math.sin(frame*math.tau/20)
            elif clip=='Attack':
                pulse=smooth((frame-12)/4)*(1-smooth((frame-16)/12))
                local_right.translation-=forward*.022*pulse
                local_right.translation.z+=.003*pulse
            elif clip=='Hurt':local_right.translation-=forward*.012*math.sin(math.pi*frame/28)
            right=chest@local_right
            for name in NAMES:original[name]=chest@neutral[name]
            base=protract_shoulders(rig,original,20);matrices=base.copy()
            for side,target,sign in [('R',right,1),('L',right@relative,-1)]:
                matrices.update(arm_matrices(rig,base,side,target,chest@Vector((sign*.60,.08,1.22))))
                upper=matrices['UpperArm_'+side];fore=matrices['Forearm_'+side]
                rows.append({'clip':clip,'frame':frame,'side':side,'wrist_distance_m':(target.translation-upper.translation).length,
                    'upper_length_error_m':abs((fore.translation-upper.translation).length-rig.data.bones['UpperArm_'+side].length),
                    'forearm_length_error_m':abs((target.translation-fore.translation).length-rig.data.bones['Forearm_'+side].length)})
            captured[frame]=matrices
        captured_all[clip]=captured
    assert max(max(r['upper_length_error_m'],r['forearm_length_error_m']) for r in rows)<1e-5
    for clip,captured in captured_all.items():
        action=set_action(rig,clip);put_keys(rig,action,captured,NAMES|({'Root'} if clip=='Death' else set()))
    # Contact the floor with the actual deformed original body, rather than
    # estimating a shoulder height. Root-only lifting preserves both grips.
    action=set_action(rig,'Death');floor=[];grounded={}
    for frame in range(51):
        bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
        low=min(p.z for lod in (0,1) for p in evaluated(bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'])[0])
        lift=max(0,-.0005-low)+min(0,.004-low)*smooth((frame-18)/16)
        matrices={pb.name:pb.matrix.copy() for pb in rig.pose.bones};matrices['Root'].translation.z+=lift
        grounded[frame]=matrices;floor.append({'frame':frame,'original_body_min_z_m':low,'root_lift_m':lift})
    put_keys(rig,action,grounded,{'Root'})
    set_action(rig,'Idle');bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
    output=RUN/'candidate';bpy.ops.wm.save_as_mainfile(filepath=str(output/'original-crossbow-grip.blend'))
    exporter=Path(__file__).with_name('original_crossbow_grip_build.py');tree=ast.parse(exporter.read_text(encoding='utf-8'))
    fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='export_lod');ns={'bpy':bpy,'os':os}
    exec(compile(ast.Module(body=[fn],type_ignores=[]),str(exporter),'exec'),ns)
    bodies=[bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'] for lod in (0,1)]
    weapons=[bpy.data.objects[f'CrossbowWeapon_LOD{lod}'] for lod in (0,1)]
    hands=[bpy.data.objects['OriginalCrossbowClosedGrip_'+s] for s in ('R','L')]
    for lod in (0,1):ns['export_lod'](rig,bodies,weapons,[],hands,str(output/f'original-crossbow-grip-lod{lod}.glb'),bodies[lod].name,weapons[lod].name)
    report=json.loads((SOURCE.parent/'weapon-candidate-report.json').read_text())
    report['original_carry']={'source':str(mother/'original-crossbow-grip.blend'),'bones':sorted(NAMES),'death_root':'Original backward fall; original body motion retained relative to Root; actual surface floor correction','reach':rows,'floor':floor}
    report['files']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in output.iterdir() if p.suffix in ('.blend','.glb')}
    report['runtime_publish_allowed']=False
    (output/'weapon-candidate-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print('CARRY_BUILD',json.dumps({'max_length_error_m':max(max(r['upper_length_error_m'],r['forearm_length_error_m']) for r in rows),'max_floor_lift_m':max(r['root_lift_m'] for r in floor),'files':report['files']}))
if __name__=='__main__':main()
