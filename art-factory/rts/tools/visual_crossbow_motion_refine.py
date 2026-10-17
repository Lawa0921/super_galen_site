"""Restore visible aiming/recoil while keeping both hands on the real bow."""
import argparse,json,math,sys
from pathlib import Path
import bpy
from mathutils import Vector,Matrix,Quaternion
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from visual_knight_motion_test import positions
from visual_unit_motion_refine import settle_foot,settle_arm,rest_tool,continuous_rotation_keys
from original_crossbow_grip_math import solve_two_bone


def set_hand_target(rig,side,target,original,frame,bend_degrees=0):
    upper=rig.pose.bones['UpperArm_'+side];fore=rig.pose.bones['Forearm_'+side];hand=rig.pose.bones['Hand_'+side]
    shoulder=upper.head.copy();pole=(original[fore.name].translation-shoulder).normalized()
    pole=Quaternion((target.translation-shoulder).normalized(),math.radians(bend_degrees))@pole
    elbow,end=solve_two_bone(tuple(shoulder),tuple(target.translation),tuple(pole),upper.bone.length,fore.bone.length)
    for bone,start,finish in ((upper,shoulder,Vector(elbow)),(fore,Vector(elbow),Vector(end))):
        q=original[bone.name].to_quaternion();q=(q@Vector((0,1,0))).rotation_difference((finish-start).normalized())@q
        bone.matrix=Matrix.LocRotScale(start,q,Vector((1,1,1)));bpy.context.view_layer.update()
        for channel in ('location','rotation_quaternion'):bone.keyframe_insert(channel,frame=frame)
    # The two hands share exactly the same rigid aiming transform, so the
    # support grip cannot slide along or away from the stock during recoil.
    hand.matrix=target;bpy.context.view_layer.update()
    for channel in ('location','rotation_quaternion'):hand.keyframe_insert(channel,frame=frame)


def soften_shoulder_seam(bodies):
    rows=[]
    for body in bodies:
        ids=(1111,1112) if body.name.endswith('LOD0') else (472,473)
        vertices=[body.data.vertices[i] for i in ids]
        weights=[{body.vertex_groups[w.group].name:w.weight for w in v.groups} for v in vertices]
        assert all(set(w)=={'UpperArm_R','Shoulder_R','SpineUpper'} for w in weights),'Shoulder patch topology changed'
        mean={name:sum(w[name] for w in weights)/2 for name in weights[0]}
        for v,old in zip(vertices,weights):
            for name,w in old.items():body.vertex_groups[name].add([v.index],.9*w+.1*mean[name],'REPLACE')
        rows.append({'body':body.name,'vertices':list(ids),'mean_blend':.1,'original_weights':weights})
    return rows


def continue_death_elbow(rig,tool):
    g.set_action(rig,'Death');end=int(bpy.data.actions['Death'].frame_range[1]);upper=rig.pose.bones['UpperArm_R'];fore=rig.pose.bones['Forearm_R'];original={}
    for frame in range(28,end+1):
        bpy.context.scene.frame_set(frame);original[frame]={'target':fore.tail.copy(),'upperq':upper.matrix.to_quaternion().copy(),'foreq':fore.matrix.to_quaternion().copy()}
    def solve(target,pole,basis):
        shoulder=upper.head.copy();elbow,endpoint=solve_two_bone(tuple(shoulder),tuple(target),tuple(pole),upper.bone.length,fore.bone.length)
        for bone,start,finish,key in ((upper,shoulder,Vector(elbow),'upperq'),(fore,Vector(elbow),Vector(endpoint),'foreq')):
            q=basis[key].copy();q=(q@Vector((0,1,0))).rotation_difference((finish-start).normalized())@q
            bone.matrix=Matrix.LocRotScale(start,q,Vector((1,1,1)));bpy.context.view_layer.update()
        return Vector(elbow)
    bpy.context.scene.frame_set(27);pole=(fore.head-upper.head).normalized();rows=[]
    for frame,basis in original.items():
        bpy.context.scene.frame_set(frame);target=basis['target'].copy();elbow=solve(target,pole,basis)
        for _ in range(10):
            minimum=float(positions(tool)[:,2].min())
            if minimum>=.004:break
            target.z+=max(0,(.008-minimum)*.45);elbow=solve(target,pole,basis)
        for bone in (upper,fore):
            for channel in ('location','rotation_quaternion'):bone.keyframe_insert(channel,frame=frame)
        pole=(elbow-upper.head).normalized();rows.append({'frame':frame,'wrist_raise_m':target.z-basis['target'].z})
    return rows


def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--run',type=Path,required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve()
    for f in ('raw','candidate','qa'):(run/f).mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');objects=[o for o in bpy.data.objects if o.type=='MESH'];bodies=[o for o in objects if 'OriginalBody' in o.name]
    names=[part+'_'+side for side in 'RL' for part in ('UpperArm','Forearm','Hand')]
    g.set_action(rig,'Attack');action=bpy.data.actions['Attack'];start,end=map(int,action.frame_range);original={}
    for frame in range(start,end+1):
        bpy.context.scene.frame_set(frame);original[frame]={name:rig.pose.bones[name].matrix.copy() for name in names}
    for frame in range(start,end+1):
        bpy.context.scene.frame_set(frame)
        aim=g.smooth((frame-start)/8)*(1-g.smooth((frame-20)/12))
        recoil=max(0,1-abs(frame-16)/3)
        if aim<=0:continue
        # Raising a carried bow must not pull the stock into the throat.
        # Keep its forward position and open the firing elbow during aiming.
        delta=Vector((0,-.035*recoil,.14*aim))
        rotation=Quaternion((1,0,0),math.radians(2.5*recoil));pivot=original[frame]['Hand_R'].translation
        transform=Matrix.Translation(delta+pivot)@rotation.to_matrix().to_4x4()@Matrix.Translation(-pivot)
        targets={s:transform@original[frame]['Hand_'+s] for s in 'RL'}
        for side in 'RL':set_hand_target(rig,side,targets[side],original[frame],frame,20*aim if side=='R' else 0)
    # Keep the established support-hand release and back-fall, but settle
    # both heels. The previous whole-body minimum hid suspended boots.
    g.set_action(rig,'Death');action=bpy.data.actions['Death'];start,end=map(int,action.frame_range)
    for frame in range(start,end+1):
        bpy.context.scene.frame_set(frame);blend=g.smooth(((frame-start)/max(1,end-start)-.50)/.42)
        for side in 'LR':settle_foot(rig,bodies,side,blend,frame)
    tool=rest_tool(rig,bpy.data.objects['ProceduralCrossbow_LOD0'])
    # The broad bow cannot share the narrow axe/sword resting lane: place
    # the firing wrist outside the right thigh while retaining its rigid grip.
    for frame in range(start,end+1):
        bpy.context.scene.frame_set(frame);blend=g.smooth((frame-28)/8)
        if blend>0:
            target=rig.pose.bones['Forearm_R'].tail.lerp(Vector((.66,-1.16,.10)),blend)
            settle_arm(rig,'R',target,1,frame)
    shoulder_patch=soften_shoulder_seam(bodies)
    elbow_continuity=continue_death_elbow(rig,bpy.data.objects['ProceduralCrossbow_LOD0'])
    rotations=continuous_rotation_keys(rig)
    g.set_action(rig,'Idle');bpy.context.scene.frame_set(0);bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(run/'raw/crossbow-assembly.blend'))
    for lod in (0,1):g.export_lod(run/'candidate'/('crossbow.glb' if lod==0 else 'crossbow-lod1.glb'),rig,[o for o in objects if o.name.endswith(f'_LOD{lod}')])
    report={'source':str(a.source),'aim_lift_m':.14,'recoil_m':.035,'aim_firing_elbow_open_degrees':20,'death_wrist_target':[.66,-1.16,.10],'tool_rest':tool,'shoulder_seam_patch':shoulder_patch,'elbow_continuity':elbow_continuity,'quaternion_continuity':rotations,'runtime_publish_allowed':False,'artistic_quality_proven':False}
    (run/'qa/crossbow-motion-build.json').write_bytes((json.dumps(report,indent=2)+'\n').encode())


if __name__=='__main__':main()
