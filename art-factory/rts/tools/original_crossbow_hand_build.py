"""Merge the original articulated left hand into the complete original archer.

This candidate reauthors left-arm/finger motion only. Mechanical string loading,
final glove material and commercial art acceptance remain separate gates.
"""
import bpy,json,hashlib,math,sys
from pathlib import Path
from mathutils import Matrix,Vector,Quaternion
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_hand_merge_math import frame_map
from original_crossbow_attack_probe import activate
from original_crossbow_carry_solve import arm_matrices,protract_shoulders
from original_crossbow_carry_build import put_keys

ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-crossbow-articulated-hand/2026-10-07-v1'
BODY=ROOT/'art-factory/rts/runs/original-crossbow-attack/2026-10-06-v1/candidate/original-crossbow-grip.blend'
HAND=ROOT/'art-factory/rts/runs/original-glove-power-grip/2026-10-07-v1/candidate/natural-hand.blend'
GRIP=ROOT/'art-factory/rts/runs/original-glove-weapon-fit/2026-10-07-v1'
assert hashlib.sha256(BODY.read_bytes()).hexdigest()=='5ab95a9b070d33a83ccc871ce092414ad513804152fc38e73f70b02556117c37'
assert hashlib.sha256(HAND.read_bytes()).hexdigest()=='63bbe419750aa77048c80fb2acd68a8b338e8c96c52b61356b8ece6a5ef56060'
target=json.loads((GRIP/'raw/grip-target.json').read_text());weapon=json.loads((GRIP/'raw/weapon.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(BODY));rig=bpy.data.objects['crossbowRig20'];actions=list(bpy.data.actions)
high_weapon=bpy.data.objects['CrossbowWeapon_LOD0'];low_weapon=bpy.data.objects['CrossbowWeapon_LOD1']
assert [g.name for g in high_weapon.vertex_groups]==[g.name for g in low_weapon.vertex_groups]
low_weapon.data=high_weapon.data.copy()
low_weapon['original_weapon_parts']=high_weapon['original_weapon_parts']
activate(rig,'Idle',0);neutral={p.name:p.matrix.copy() for p in rig.pose.bones}
relative=neutral['Hand_R'].inverted()@neutral['Hand_L']
with bpy.data.libraries.load(str(HAND),link=False) as (src,dst):dst.objects=['OriginalJointGlove_L_LOD0','OriginalHandRig_L']
hand,source_rig=dst.objects
for obj in (hand,source_rig):bpy.context.scene.collection.objects.link(obj)
source_bones={b.name:{'matrix':b.matrix_local.copy(),'length':b.length,'parent':b.parent.name if b.parent else None,'axis':list(b.get('original_flexion_axis',[]))} for b in source_rig.data.bones}
anchor=source_bones['Hand_L']['matrix']
rest_map=Matrix(frame_map(anchor,rig.data.bones['Hand_L'].matrix_local).tolist())
hand.parent=None;hand.matrix_world=Matrix.Identity(4)
for vertex in hand.data.vertices:vertex.co=rest_map@vertex.co
hand.data.update();hand.name='OriginalCrossbowArticulatedHand_L'
hand.vertex_groups['Hand_L'].name='HandPalm_L'
for modifier in list(hand.modifiers):hand.modifiers.remove(modifier)
hand.parent=rig;hand.matrix_parent_inverse=Matrix.Identity(4)
modifier=hand.modifiers.new('OriginalArticulatedLeftSkin','ARMATURE');modifier.object=rig
bpy.data.objects.remove(bpy.data.objects['OriginalCrossbowClosedGrip_L'],do_unlink=True)
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.object.mode_set(mode='EDIT')
bone=rig.data.edit_bones.new('HandPalm_L');bone.head=(rest_map@anchor).translation
bone.tail=rest_map@(anchor@Vector((0,source_bones['Hand_L']['length'],0)))
bone.matrix=rest_map@anchor;bone.parent=rig.data.edit_bones['Hand_L'];bone.use_connect=False
for name,data in source_bones.items():
    if name=='Hand_L':continue
    # A newly created edit bone has zero length. Give it a real segment before
    # assigning its frame, otherwise Blender loses the intended orientation.
    bone=rig.data.edit_bones.new(name);bone.head=(rest_map@data['matrix']).translation
    bone.tail=rest_map@(data['matrix']@Vector((0,data['length'],0)))
    bone.matrix=rest_map@data['matrix'];bone.parent=rig.data.edit_bones['HandPalm_L' if data['parent']=='Hand_L' else data['parent']];bone.use_connect=False
bpy.ops.object.mode_set(mode='OBJECT')
assert max(abs((rest_map@d['matrix'])[i][j]-rig.data.bones['HandPalm_L' if n=='Hand_L' else n].matrix_local[i][j]) for n,d in source_bones.items() for i in range(4) for j in range(4))<1e-5,'Actual merged bind frames differ from the original source frames'
for name,data in source_bones.items():
    if name!='Hand_L':rig.data.bones[name]['original_source_flexion_axis']=data['axis']
bpy.data.objects.remove(source_rig,do_unlink=True)
for action in list(bpy.data.actions):
    if action not in actions:bpy.data.actions.remove(action)

# Original weapon bind space -> standalone hand space. The inverse transports
# the verified local contact pose onto the real animated complete crossbow.
rotation=Matrix(target['support_rotation_hand_rows'])@Matrix(weapon['rotation_rows'])
weapon_to_hand=rotation.to_4x4();weapon_to_hand.translation=Vector(target['support_center_hand_m'])-rotation@Vector(weapon['support_center_source'])
hand_to_weapon=weapon_to_hand.inverted()
support_center=Vector(weapon['support_center_source'])
support_turn=Matrix.Translation(support_center)@Quaternion(Vector(weapon['support_axis_source']),math.radians(45)).to_matrix().to_4x4()@Matrix.Translation(-support_center)
hand_to_weapon=support_turn@hand_to_weapon
palm_axis=(sum((source_bones[n+'1_L']['matrix'].translation for n in ['Index','Middle','Ring','Little']),Vector())/4-anchor.translation).normalized()

def smooth(t):
    t=max(0.,min(1.,t));return t*t*(3-2*t)

def held_amount(clip,frame):
    if clip!='Attack' or frame<=20 or frame>=36:return 1.
    if frame<24:return 1-smooth((frame-20)/4)
    if frame<=32:return 0.
    return smooth((frame-32)/4)

def source_pose(amount):
    result={'Hand_L':anchor.copy()}
    for name,angles in target['angles_degrees'].items():
        first=source_bones[name+'1_L'];head=first['matrix'].translation.copy();rotation=Quaternion()
        swing=target.get('root_swings',{}).get(name)
        if swing:
            opening=target.get('opening_root_swings',{}).get(name,{'degrees':0})
            rotation=Quaternion(Vector(swing['axis']),math.radians(swing['degrees']*amount+opening['degrees']*(1-amount)))
        curl=amount if name!='Thumb' else target.get('opening_thumb_curl_multiplier',0)*(1-amount)+amount
        for index,angle in enumerate(angles,1):
            bone=source_bones[f'{name}{index}_L'];rotation=rotation@Quaternion(Vector(bone['axis']),math.radians(angle)*curl)
            q=rotation@bone['matrix'].to_quaternion();result[f'{name}{index}_L']=Matrix.LocRotScale(head,q,Vector((1,1,1)));head+=q@Vector((0,bone['length'],0))
    return result

edited={'Shoulder_L','UpperArm_L','Forearm_L','Hand_L','HandPalm_L'}|{n for n in source_bones if n!='Hand_L'}
attack_settle={}
for frame in [20,40]:
    activate(rig,'Attack',frame);attack_settle[frame]={p.name:p.matrix_basis.copy() for p in rig.pose.bones}
def settled_attack(frame):
    t=0 if frame<=36 else smooth((frame-36)/4);result={}
    for p in rig.pose.bones:
        a=attack_settle[20][p.name];b=attack_settle[40][p.name]
        basis=Matrix.LocRotScale(a.translation.lerp(b.translation,t),a.to_quaternion().slerp(b.to_quaternion(),t),Vector((1,1,1)))
        result[p.name]=p.bone.convert_local_to_pose(basis,p.bone.matrix_local,parent_matrix=result[p.parent.name],parent_matrix_local=p.parent.bone.matrix_local) if p.parent else p.bone.convert_local_to_pose(basis,p.bone.matrix_local)
    return result
captured_all={};unreachable=[];samples=[]
for clip in ['Idle','Walk','Attack','Hurt','Death']:
    action=activate(rig,clip,0);end=round(action.frame_range[1]);captured={}
    for sample in range(end*8+1):
        frame=sample/8;activate(rig,clip,frame);original={p.name:p.matrix.copy() for p in rig.pose.bones}
        if clip=='Attack' and frame>20:original=settled_attack(frame)
        skin=original['Hand_R']@rig.data.bones['Hand_R'].matrix_local.inverted()
        # Re-author a stationary release/regrip. The inherited lift crossed
        # the weapon; mechanical string loading is still a separate task.
        deviation=Matrix.Identity(4) if clip=='Attack' else original['Hand_L']@(original['Hand_R']@relative).inverted()
        amount=held_amount(clip,frame);pose_map=deviation@skin@hand_to_weapon
        offset=Vector(target.get('opening_hand_offset_m',[0,0,0]))*(1-amount)
        pose_map.translation+=pose_map.to_3x3()@offset
        wrist=pose_map@anchor
        # Rotate the existing clavicle forward; retain its length and the
        # original upper/forearm lengths instead of stretching to the new grip.
        shoulder=protract_shoulders(rig,original,15)
        base={**original,**{n:shoulder[n] for n in ['Shoulder_L','UpperArm_L','Forearm_L']}}
        chest=original['SpineUpper']@neutral['SpineUpper'].inverted()
        pole=chest@Vector((-.3,.12,.98))
        try:left=arm_matrices(rig,base,'L',wrist,pole)
        except ValueError as error:
            unreachable.append({'clip':clip,'frame':frame,'error':str(error),'wrist':list(wrist.translation)});continue
        palm_direction=pose_map.to_3x3()@palm_axis
        def bend(solution):return (wrist.translation-solution['Forearm_L'].translation).angle(palm_direction)
        if bend(left)>math.radians(70):
            anatomical_pole=base['UpperArm_L'].translation-palm_direction
            alternative=arm_matrices(rig,base,'L',wrist,anatomical_pole)
            if bend(alternative)<math.radians(70):
                low,high=0.,1.
                for _ in range(20):
                    mid=(low+high)/2;trial=arm_matrices(rig,base,'L',wrist,pole.lerp(anatomical_pole,mid))
                    if bend(trial)>math.radians(70):low=mid
                    else:high=mid
                left=arm_matrices(rig,base,'L',wrist,pole.lerp(anatomical_pole,high))
            else:left=alternative
        cuff=left['Forearm_L']@neutral['Forearm_L'].inverted()@neutral['Hand_L']
        assert (cuff.translation-wrist.translation).length<1e-5
        left['Hand_L']=cuff
        matrices={**base,**left,**{('HandPalm_L' if n=='Hand_L' else n):pose_map@m for n,m in source_pose(amount).items()}}
        captured[frame]=matrices
        if sample%8==0:samples.append({'clip':clip,'frame':frame,'held_amount':amount,'wrist_shift_m':(wrist.translation-original['Hand_L'].translation).length,'wrist':list(wrist.translation),'hand_rotation_change_degrees':math.degrees(wrist.to_quaternion().rotation_difference(original['Hand_L'].to_quaternion()).angle)})
    captured_all[clip]=captured
preflight={'unreachable':unreachable,'samples':samples,'rest_map':[list(r) for r in rest_map],'weapon_to_hand':[list(r) for r in weapon_to_hand],'source_bones':{n:{'matrix':[list(r) for r in d['matrix']],'length':d['length'],'parent':d['parent'],'axis':d['axis']} for n,d in source_bones.items()},'runtime_publish_allowed':False}
(RUN/'qa/attachment-preflight.json').write_text(json.dumps(preflight,indent=2)+'\n')
assert not unreachable,unreachable[:3]
for clip,captured in captured_all.items():
    action=activate(rig,clip,0);put_keys(rig,action,captured,set(rig.pose.bones.keys()) if clip=='Attack' else edited)
activate(rig,'Idle',0)
output=RUN/'candidate/articulated-crossbow.blend';bpy.ops.wm.save_as_mainfile(filepath=str(output))
report={'status':'candidate','body_sha256':hashlib.sha256(BODY.read_bytes()).hexdigest(),'hand_sha256':hashlib.sha256(HAND.read_bytes()).hexdigest(),'candidate_sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'rest_map':[list(r) for r in rest_map],'weapon_to_hand':[list(r) for r in weapon_to_hand],'added_bones':['HandPalm_L']+sorted(n for n in source_bones if n!='Hand_L'),'edited_existing_bones':['Shoulder_L','UpperArm_L','Forearm_L','Hand_L'],'clips':list(captured_all),'bone_count':len(rig.data.bones),'hand_triangles':sum(len(p.vertices)-2 for p in hand.data.polygons),'authoring_step_frames':.125,'mechanical_reload_complete':False,'runtime_publish_allowed':False}
report.update(support_rotation_degrees=45,final_hand_to_weapon=[list(r) for r in hand_to_weapon],attack_recovery='Source frame20 held through36; original local-basis slerp to source40. Mechanical loading absent.',edited_existing_bones_by_clip={clip:(sorted(n for n in rig.data.bones.keys() if n not in source_bones and n!='HandPalm_L')+['Hand_L'] if clip=='Attack' else ['Shoulder_L','UpperArm_L','Forearm_L','Hand_L']) for clip in captured_all})
(RUN/'qa/assembly-authoring.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
