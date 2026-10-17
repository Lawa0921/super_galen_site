"""Read frozen original action and actual weapon rail in authored Blender space."""
import bpy,hashlib,json,math,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-crossbow-attack/2026-10-06-v1'
SOURCE=ROOT/'art-factory/rts/runs/original-crossbow-drape/2026-10-06-v1/candidate/original-crossbow-grip.blend'
EXPECTED='b71117a218a8eba1a45b52309fcb816a6749a5d88abd5d1d5d966bde958b9181'
RIGHT=Vector((.4737280011,.0082399929,1.0032651424))
LEFT=Vector((.4756326973,.1482384652,1.0090498924))
RAIL_REAR=Vector((.4756327,.036,1.139));RAIL_FRONT=Vector((.4756327,.54,1.13))

def activate(rig,name,frame=0):
    action=bpy.data.actions[name];rig.animation_data_create();rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
    for track in rig.animation_data.nla_tracks:track.mute=True
    bpy.context.scene.frame_set(int(frame),subframe=frame%1);bpy.context.view_layer.update()
    return action

def skin(rig,name='Hand_R'):return rig.matrix_world@rig.pose.bones[name].matrix@rig.data.bones[name].matrix_local.inverted()
def values(v):return [round(x,7) for x in v]

def main():
    candidate='--candidate' in sys.argv;source=RUN/'candidate/original-crossbow-grip.blend' if candidate else SOURCE
    if not candidate:assert hashlib.sha256(source.read_bytes()).hexdigest()==EXPECTED
    (RUN/'qa').mkdir(parents=True,exist_ok=True);bpy.ops.wm.open_mainfile(filepath=str(source));rig=bpy.data.objects['crossbowRig20'];rig.data.pose_position='POSE';rows=[]
    activate(rig,'Idle',0);neutral={b.name:b.matrix.copy() for b in rig.pose.bones};left_local=neutral['Hand_L'].inverted()@skin(rig)@LEFT
    for clip in ['Idle','Attack','Walk']:
        action=activate(rig,clip);end=round(action.frame_range[1])
        for frame in range(end+1):
            activate(rig,clip,frame);matrix=skin(rig);rear=matrix@RAIL_REAR;front=matrix@RAIL_FRONT;direction=(front-rear).normalized()
            rows.append({'clip':clip,'frame':frame,'trigger':values(matrix@RIGHT),'support':values(matrix@LEFT),'rail_rear':values(rear),'rail_front':values(front),'rail_forward_angle_deg':math.degrees(direction.angle(Vector((0,1,0)))),'grasp_drift_m':(rig.pose.bones['Hand_L'].matrix@left_local-matrix@LEFT).length,'idle_arm_matrix_error':max(abs(rig.pose.bones[n].matrix[i][j]-neutral[n][i][j]) for n in neutral if n.startswith(('Shoulder','UpperArm','Forearm','Hand')) for i in range(4) for j in range(4)),'bones':{n:values(rig.pose.bones[n].matrix.translation) for n in ['Root','Head','SpineUpper','Shoulder_R','Shoulder_L','UpperArm_R','UpperArm_L','Forearm_R','Forearm_L','Hand_R','Hand_L']}})
    report={'source':str(source.relative_to(ROOT)).replace('\\','/'),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'fps':bpy.context.scene.render.fps/bpy.context.scene.render.fps_base,'bones':[{ 'name':b.name,'head':values(b.head_local),'tail':values(b.tail_local),'length':b.length,'parent':b.parent.name if b.parent else None} for b in rig.data.bones], 'actions':{n:list(bpy.data.actions[n].frame_range) for n in ['Idle','Walk','Attack','Hurt','Death']},'rows':rows,'runtime_publish_allowed':False}
    prefix='candidate' if candidate else 'baseline';(RUN/f'qa/{prefix}-motion.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print('ATTACK_PROBE',json.dumps({'fps':report['fps'],'bones':len(report['bones']),'actions':report['actions'],'sample':[r for r in rows if r['clip']=='Attack' and r['frame'] in (0,10,16,20,28,40)]}))
if __name__=='__main__':main()
