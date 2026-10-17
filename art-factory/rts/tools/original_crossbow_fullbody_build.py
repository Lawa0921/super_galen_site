"""Full-body, original 72-frame attack with planted feet and visible equipment."""
import bpy, json, math, hashlib, sys
from pathlib import Path
from mathutils import Matrix, Vector, Quaternion
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_attack_probe import activate
from original_crossbow_attack_layout import shoulder_base
from original_crossbow_carry_solve import arm_matrices
from original_crossbow_carry_build import put_keys
from original_crossbow_fullbody_math import joint_position,constrained_joint,smooth,stages
from original_crossbow_complete_build import blend,sample
from original_crossbow_fullbody_props import add_equipment,pose_controls,linkage,LATCH,FREE,RAIL,QUIVER_BOLT,DOWN

ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-crossbow-complete/2026-10-07-v2'
if '--run' in sys.argv:
    RUN=ROOT/sys.argv[sys.argv.index('--run')+1]
SOURCE=RUN.parent/'2026-10-07-v1/candidate/complete-crossbow.blend'
ANCHOR_PATH=ROOT/'art-factory/rts/runs/original-crossbow-articulated-hand/2026-10-07-v1/qa/attachment-preflight.json'
CONTACT=Vector((.01,.01176710678749817,.11397716200789676))

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def scalar(keys,f):
    a=max(k for k in keys if k<=f);b=min(k for k in keys if k>=f)
    return keys[a]+(keys[b]-keys[a])*smooth((f-a)/(b-a)) if b!=a else keys[a]
def vec(keys,f):return Vector(tuple(scalar({k:v[i] for k,v in keys.items()},f) for i in range(3)))
def contact(point,q,source_point=CONTACT):
    m=q.to_matrix().to_4x4();m.translation=point-q@source_point;return m
def local_turn(pose,name,q,rig):
    old=pose[name];new=Matrix.LocRotScale(old.translation,q@old.to_quaternion(),Vector((1,1,1)))
    delta=new@old.inverted();pose[name]=new
    for child in rig.data.bones[name].children_recursive:pose[child.name]=delta@pose[child.name]
def translate_chain(pose,name,delta,rig):
    pose[name]=delta@pose[name]
    for child in rig.data.bones[name].children_recursive:pose[child.name]=delta@pose[child.name]

def body_pose(rig,neutral,f):
    m={n:v.copy() for n,v in neutral.items()}
    pelvis=vec({0:(0,0,0),6:(.01,.015,-.035),12:(.01,.015,-.035),15:(.01,.005,-.041),
        20:(0,0,-.025),26:(.02,-.012,-.048),32:(.02,-.015,-.050),40:(.038,-.027,-.060),
        44:(.025,-.015,-.045),50:(-.015,-.008,-.032),56:(-.015,0,-.032),62:(.005,.010,-.030),68:(.01,.015,-.035),72:(0,0,0)},f)
    translate_chain(m,'Pelvis',Matrix.Translation(pelvis),rig)
    yaw=scalar({0:0,6:-8,12:-8,20:0,26:6,32:8,40:13,44:8,50:-7,56:-7,62:0,68:-4,72:0},f)
    local_turn(m,'Pelvis',Quaternion((0,0,1),math.radians(yaw)),rig)
    lean=scalar({0:0,6:-2,12:-2,15:1,20:0,26:-4,32:-5,40:-8,44:-4,50:-4,56:-4,62:-2,68:0,72:0},f)
    counter=scalar({0:0,6:12,12:12,20:0,26:-8,32:-12,40:-19,44:-10,50:2,56:2,62:0,68:4,72:0},f)
    local_turn(m,'SpineLower',Quaternion((1,0,0),math.radians(lean*.55)),rig)
    local_turn(m,'SpineUpper',Quaternion((0,0,1),math.radians(counter))@Quaternion((1,0,0),math.radians(lean*.45)),rig)
    look=scalar({0:0,6:-3,12:-3,18:0,24:-10,40:-13,46:-10,50:-16,56:-13,62:-8,68:0,72:0},f)
    local_turn(m,'Neck',Quaternion((0,0,1),math.radians(-(yaw+counter)*.65))@Quaternion((1,0,0),math.radians(look*.55)),rig)
    local_turn(m,'Head',Quaternion((1,0,0),math.radians(look*.45)),rig)
    step=smooth(f/6)*(1-smooth((f-68)/4))
    lift=.026*math.sin(math.pi*min(1,f/6)) if f<6 else .026*math.sin(math.pi*max(0,(f-68)/4)) if f>68 else 0
    for side,sign in [('L',-1),('R',1)]:
        names=[part+'_'+side for part in ('Thigh','Shin','Foot')]
        foot=neutral[names[2]].copy();foot.translation+=Vector((sign*.016, .065 if side=='L' else -.035,0))*step
        foot.translation.z+=lift
        # Keep the boot's sole flat; both anchors are invariant from frame 6 to 68.
        hip=m[names[0]].translation;ankle=foot.translation
        knee=Vector(joint_position(hip,ankle,rig.data.bones[names[0]].length,rig.data.bones[names[1]].length,hip+Vector((sign*.06,1,0))))
        for name,start,end in [(names[0],hip,knee),(names[1],knee,ankle)]:
            old=neutral[name].to_quaternion();q=(old@Vector((0,1,0))).rotation_difference((end-start).normalized())@old
            m[name]=Matrix.LocRotScale(start,q,Vector((1,1,1)))
        m[names[2]]=foot
    return m

def capture(rig):
    result={}
    for clip in ('Idle','Walk','Attack','Hurt','Death'):
        end=round(activate(rig,clip).frame_range[1]);result[clip]={}
        for k in range(end*8+1):
            f=k/8;activate(rig,clip,f);result[clip][f]={b.name:b.matrix.copy() for b in rig.pose.bones}
    return result

def author_motion(rig,original,handle_roll=30,bolt_roll=120,dry_run=False,bolt_tilt=40,fold_roll=60):
    neutral=original['Idle'][0.];meta=json.loads(ANCHOR_PATH.read_text())
    anchor=Matrix(meta['source_bones']['Hand_L']['matrix']);hr=rig.data.bones['Hand_R'].matrix_local
    idle_weapon=neutral['Hand_R']@hr.inverted()
    H=idle_weapon.inverted()@neutral['HandPalm_L']@anchor.inverted()
    closed={n:neutral['HandPalm_L'].inverted()@neutral[n] for n in meta['source_bones'] if n!='Hand_L'}
    opened={n:original['Attack'][22.]['HandPalm_L'].inverted()@original['Attack'][22.][n] for n in closed}
    pinch=json.loads((RUN/'raw/pinch-layout.json').read_text())
    pinch_point=Vector(pinch['contact_source']);pinched={n:v.copy() for n,v in closed.items()}
    for name,params in pinch['fingers'].items():
        head=Vector([row[3] for row in meta['source_bones'][name+'1_L']['matrix'][:3]])
        rotation=Quaternion((0,0,1),math.radians(params['swing_z_degrees']))
        for i,angle in enumerate(params['angles_degrees'],1):
            n=f'{name}{i}_L';b=meta['source_bones'][n]
            rotation=rotation@Quaternion(Vector(b['axis']),math.radians(angle))
            q=rotation@Matrix(b['matrix']).to_quaternion()
            pinched[n]=anchor.inverted()@Matrix.LocRotScale(head,q,Vector((1,1,1)))
            head+=q@Vector((0,b['length'],0))
    heading=sum((closed[n+'1_L'].translation for n in ('Index','Middle','Ring','Little')),Vector())
    heading.normalize()
    aim=original['Attack'][8.]['Hand_R'].copy();aim.translation+=Vector((.005,-.012,-.035))
    ready=neutral['Hand_R'].copy();reload=ready.copy();reload.translation=Vector((.015,.23,1.13))
    load=Matrix.LocRotScale(Vector((.02,.08,1.13)),Quaternion((0,0,1),math.radians(15))@hr.to_quaternion(),Vector((1,1,1)))
    # Maintain an unobstructed rail, held just in front of the lower ribs.
    right_keys={0.:ready,8.:aim,12.:aim,14.:aim.copy(),20.:ready,26.:reload,46.:reload,50.:load,62.:load,68.:ready,72.:ready}
    right_keys[14.].translation+=Vector((0,-.019,.008))
    protracted=shoulder_base(rig,neutral,.145)
    captures={};rows=[];bad=[];wrist=[];previous=neutral
    for index in range(577):
        f=index/8;state=stages(f);m=body_pose(rig,neutral,f)
        chest=m['SpineUpper']@neutral['SpineUpper'].inverted()
        amount=smooth(f/8)*(1-smooth((f-12)/8))
        for side in ('L','R'):
            clavicle_amount=max(amount,smooth((f-50)/4)*(1-smooth((f-62)/2))) if side=='L' else max(amount,.25*smooth((f-20)/6)*(1-smooth((f-46)/4)))
            for part in ('Shoulder','UpperArm','Forearm','Hand'):
                name=part+'_'+side;m[name]=chest@blend(neutral[name],protracted[name],clavicle_amount)
        right=sample(right_keys,f)
        # Follow the body's small shifts while preserving an absolute forward aim.
        right.translation+=m['Pelvis'].translation-neutral['Pelvis'].translation
        weapon=right@hr.inverted();support=weapon@H
        prop=pose_controls(rig,weapon,state['draw'],state['deploy']);m.update(prop)
        quiver=m['Pelvis']@rig.data.bones['Pelvis'].matrix_local.inverted()
        m['QuiverRoot']=quiver@rig.data.bones['QuiverRoot'].matrix_local
        swivel=handle_roll+(fold_roll-handle_roll)*smooth((f-42)/4)
        handle_grasp=contact(Vector(),Quaternion((0,1,0),math.radians(swivel))@H.to_quaternion())
        held=prop['LeverHandle']@handle_grasp
        bolt_quiver=quiver@Matrix.LocRotScale(QUIVER_BOLT+Vector((0,0,pinch.get('quiver_bolt_raise_m',0))),DOWN@Quaternion((0,1,0),math.pi),Vector((1,1,1)))
        bolt_grasp=contact(Vector((0,pinch.get('bolt_contact_y',-.17),0)),Quaternion((0,1,0),math.radians(bolt_roll))@Quaternion((1,0,0),math.radians(bolt_tilt)),pinch_point)
        grab=bolt_quiver@bolt_grasp
        withdrawn_bolt=bolt_quiver.copy();withdrawn_bolt.translation+=Vector((-.025,.035,.38))
        load_bolt=weapon@Matrix.Translation(RAIL)
        above_bolt=load_bolt.copy();above_bolt.translation.z+=.065
        dock=load_bolt@bolt_grasp
        withdrawn_hand=withdrawn_bolt@bolt_grasp
        carry_hand=blend(withdrawn_hand,dock,.7);carry_hand.translation=chest@Vector((-.08,.25,1.48))
        # Move the whole held arrow inward before turning the palm toward the
        # rail. The hand and arrow share one rigid grasp throughout the path.
        left_path=sample({50.:grab,54.:withdrawn_hand,58.:carry_hand,60.:above_bolt@bolt_grasp,62.:dock},max(50.,min(62.,f)))
        bolt_path=left_path@bolt_grasp.inverted()
        leave=support.copy();leave.translation+=Vector((-.045,0,.05))
        if f<=20:left=support
        elif f<26:left=sample({20.:support,23.:leave,26.:held},f)
        elif f<=46:left=held
        elif f<=50:
            outside=blend(held,grab,.25);outside.translation=chest@Vector((-.11,.16,1.42))
            release=blend(held,grab,.5);release.translation=chest@Vector((-.37,.16,1.35))
            left=sample({46.:held,47.:outside,48.:release,50.:grab},f)
        elif f<=62:left=left_path
        else:left=sample({62.:dock,64.:leave,68.:support,72.:support},f)
        palm=left@anchor
        for side,target,pole in [('R',right,chest@Vector((.49,-.03,1.18))),('L',palm,chest@Vector((-.45,.08,1.18)))]:
            try:
                arm=arm_matrices(rig,m,side,target,pole)
                if side=='L':
                    direction=(palm.to_3x3()@heading).normalized()
                    def bend(solved):return math.degrees((target.translation-solved['Forearm_L'].translation).normalized().angle(direction))
                    shoulder=m['UpperArm_L'].translation
                    recover=smooth((f-64)/8)
                    preference=previous['Forearm_L'].translation.lerp(chest@neutral['Forearm_L'].translation,recover)
                    elbow=Vector(constrained_joint(shoulder,target.translation,rig.data.bones['UpperArm_L'].length,
                                 rig.data.bones['Forearm_L'].length,direction,preference))
                    for name,start,end in [('UpperArm_L',shoulder,elbow),('Forearm_L',elbow,target.translation)]:
                        # Parallel transport the upper arm. The forearm's roll
                        # follows the actual palm so the cuff cannot wind up.
                        q=previous[name].to_quaternion().slerp(chest.to_quaternion()@neutral[name].to_quaternion(),recover) if name=='UpperArm_L' else palm.to_quaternion()@neutral['HandPalm_L'].to_quaternion().inverted()@neutral[name].to_quaternion()
                        q=(q@Vector((0,1,0))).rotation_difference((end-start).normalized())@q
                        arm[name]=Matrix.LocRotScale(start,q,Vector((1,1,1)))
                    wrist.append({'frame':f,'bend_degrees':bend(arm),'upper':list(m['UpperArm_L'].translation),
                                  'palm':list(target.translation),'direction':list(direction),'elbow':list(arm['Forearm_L'].translation)})
                m.update(arm)
                rows.append({'frame':f,'side':side,'distance':(target.translation-m['UpperArm_'+side].translation).length})
            except ValueError as error:bad.append({'frame':f,'side':side,'target':list(target.translation),'upper':list(m['UpperArm_'+side].translation),'direction':list((palm.to_3x3()@heading).normalized()) if side=='L' else None,'error':str(error)})
        m['HandPalm_L']=palm
        m['LeftInteraction']=palm.copy()
        m['Hand_L']=m['Forearm_L']@neutral['Forearm_L'].inverted()@neutral['Hand_L']
        opening=scalar({0:0,20:0,23:.7,26:0,44:0,47:.7,50:.25,60:.25,62:.25,64:.8,68:0,72:0},f)
        pinch_amount=smooth((f-47)/3)*(1-smooth((f-62)/3))
        for n in closed:m[n]=palm@blend(blend(closed[n],opened[n],opening),pinched[n],pinch_amount)
        string=weapon@rig.data.bones['BowString'].matrix_local;string.translation=weapon@FREE.lerp(LATCH,state['draw']);m['BowString']=string
        bolt=load_bolt.copy()
        if state['bolt']=='quiver':bolt=bolt_quiver
        elif state['bolt']=='hand':
            # One constant six-degree-of-freedom grasp drives both objects.
            bolt=bolt_path
        elif state['bolt']=='hidden':bolt=Matrix.LocRotScale(load_bolt.translation,load_bolt.to_quaternion(),Vector((.0001,)*3))
        m['LoadedBolt']=bolt;captures[f]=m;previous=m
    report={'unreachable':bad,'reach':rows,'wrist':wrist,'max_wrist_bend':max(r['bend_degrees'] for r in wrist),
            'grasp':{'handle_roll':handle_roll,'fold_roll':fold_roll,'bolt_roll':bolt_roll,'bolt_tilt':bolt_tilt},'fps':24,'frames':72,'release_frame':12,'runtime_publish_allowed':False}
    if dry_run:return report
    (RUN/'qa/motion-preflight.json').write_text(json.dumps(report,indent=2)+'\n',newline='\n')
    assert not bad,bad[:6]
    # Build a fresh action: no residual v1 upper-body keys or 40-frame range.
    old=bpy.data.actions['Attack'];old.name='RejectedAttackV1';old.use_fake_user=False
    action=bpy.data.actions.new('Attack');rig.animation_data.action=action
    bpy.data.actions.remove(old)
    put_keys(rig,action,captures,set(rig.pose.bones.keys()))
    action.use_fake_user=True
    for clip,frames in original.items():
        if clip=='Attack':continue
        control_frames={}
        for f,source in frames.items():
            m={n:v.copy() for n,v in source.items()};weapon=m['Hand_R']@hr.inverted()
            m.update(pose_controls(rig,weapon,1,0))
            m['QuiverRoot']=m['Pelvis']@rig.data.bones['Pelvis'].matrix_local.inverted()@rig.data.bones['QuiverRoot'].matrix_local
            m['LeftInteraction']=m['HandPalm_L'].copy()
            control_frames[f]=m
        activate(rig,clip);action=bpy.data.actions[clip]
        names={'LeverUpper','LeverLink','LeverHandle','QuiverRoot','LeftInteraction','HandPalm_L','LoadedBolt'}
        # The original hand uses eighth-frame keys. Remove all old local
        # samples before changing its parent; otherwise stale in-between
        # values from the old hierarchy survive the rebake.
        for layer in action.layers:
            for strip in layer.strips:
                for slot in action.slots:
                    bag=strip.channelbag(slot)
                    if bag:
                        for fc in list(bag.fcurves):
                            if any('"'+n+'"' in fc.data_path for n in names):bag.fcurves.remove(fc)
        put_keys(rig,action,control_frames,names)
    return report

def main():
    assert sha(SOURCE)=='c512ee46ee9cc1ad3f0d9b56bd9c6083ae36ef0bea5c133e6970eac8eb2e5fb2'
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['crossbowRig20']
    original=capture(rig);activate(rig,'Idle',0)
    pinch=json.loads((RUN/'raw/pinch-layout.json').read_text())
    props=add_equipment(rig,quiver_raise=pinch.get('quiver_bolt_raise_m',0))
    # New controls must be present in every parent-matrix capture.
    for frames in original.values():
        for matrices in frames.values():
            for name in ('LeverUpper','LeverLink','LeverHandle','QuiverRoot','LeftInteraction'):matrices[name]=rig.data.bones[name].matrix_local.copy()
    motion=author_motion(rig,original,bolt_roll=pinch.get('bolt_roll_degrees',120));activate(rig,'Idle',0)
    output=RUN/'candidate/complete-crossbow.blend';bpy.ops.wm.save_as_mainfile(filepath=str(output))
    report={'source_sha256':sha(SOURCE),'candidate_sha256':sha(output),'equipment':props,'motion':{k:v for k,v in motion.items() if k not in ('reach','wrist')},'status':'candidate' if motion['max_wrist_bend']<=78 else 'qa_failed','runtime_publish_allowed':False}
    (RUN/'qa/authoring.json').write_text(json.dumps(report,indent=2)+'\n',newline='\n')
    print('FULLBODY_BUILD',json.dumps(report))

if __name__=='__main__':main()
