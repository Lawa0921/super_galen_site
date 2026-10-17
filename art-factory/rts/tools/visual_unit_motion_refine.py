"""Ground the walk and author a supported jointed fall on existing skeletons."""
import argparse,json,math,sys
from pathlib import Path
import bpy
from mathutils import Quaternion,Vector,Matrix
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from visual_knight_motion_test import positions
from original_crossbow_grip_math import solve_two_bone

def world_turn(bone,axis,degrees):
    return Quaternion(bone.bone.matrix_local.to_3x3().inverted()@Vector(axis),math.radians(degrees))


def continuous_rotation_keys(rig):
    """Keep equivalent quaternion signs continuous through exported frames."""
    rows=[]
    for action in bpy.data.actions:
        g.set_action(rig,action.name);frames=range(int(action.frame_range[0]),int(action.frame_range[1])+1);captured={}
        for frame in frames:
            bpy.context.scene.frame_set(frame);captured[frame]={b.name:b.rotation_quaternion.copy() for b in rig.pose.bones}
        previous={};flips=0
        for frame,bones in captured.items():
            for name,q in bones.items():
                if name in previous:
                    if q.dot(previous[name])<0:flips+=1
                    q.make_compatible(previous[name])
                previous[name]=q.copy();bone=rig.pose.bones[name];bone.rotation_quaternion=q;bone.keyframe_insert('rotation_quaternion',frame=frame)
        for layer in action.layers:
            for strip in layer.strips:
                for slot in action.slots:
                    bag=strip.channelbag(slot)
                    if bag:
                        for curve in bag.fcurves:
                            if curve.data_path.endswith('rotation_quaternion'):
                                for key in curve.keyframe_points:key.interpolation='LINEAR'
        rows.append({'clip':action.name,'equivalent_signs_corrected':flips})
    return rows

def settle_arm(rig,side,target,blend,frame):
    upper=rig.pose.bones['UpperArm_'+side];fore=rig.pose.bones['Forearm_'+side]
    shoulder=upper.head.copy();oldwrist=fore.tail.copy();wrist=oldwrist.lerp(target,blend)
    elbow,end=solve_two_bone(tuple(shoulder),tuple(wrist),(1 if side=='R' else -1,0,.2),upper.bone.length,fore.bone.length)
    for bone,start,finish in ((upper,shoulder,Vector(elbow)),(fore,Vector(elbow),Vector(end))):
        old=bone.matrix.to_quaternion();rotation=(old@Vector((0,1,0))).rotation_difference((finish-start).normalized())@old
        bone.matrix=Matrix.LocRotScale(start,rotation,Vector((1,1,1)));bpy.context.view_layer.update()
        for channel in ('location','rotation_quaternion'):bone.keyframe_insert(channel,frame=frame)


def settle_foot(rig,bodies,side,blend,frame):
    if blend<=0:return
    upper=rig.pose.bones['Thigh_'+side];lower=rig.pose.bones['Shin_'+side];foot=rig.pose.bones['Foot_'+side]
    points=[]
    for body in bodies:
        height=max(v.co.z for v in body.data.vertices)
        ids=[v.index for v in body.data.vertices if v.co.z<height*.10 and (v.co.x<0 if side=='L' else v.co.x>0)]
        points.extend(positions(body)[ids,2])
    minimum=min(points);hip=upper.head.copy();old=foot.matrix.copy()
    target=Vector((hip.x+(-.025 if side=='L' else .025),hip.y+(upper.length+lower.length)*(.88 if side=='L' else .94),foot.head.z+.004-minimum))
    target=foot.head.lerp(target,blend)
    knee,end=solve_two_bone(tuple(hip),tuple(target),(0,0,1),upper.bone.length,lower.bone.length)
    for bone,start,finish in ((upper,hip,Vector(knee)),(lower,Vector(knee),Vector(end))):
        q=bone.matrix.to_quaternion();q=(q@Vector((0,1,0))).rotation_difference((finish-start).normalized())@q
        bone.matrix=Matrix.LocRotScale(start,q,Vector((1,1,1)));bpy.context.view_layer.update()
        for channel in ('location','rotation_quaternion'):bone.keyframe_insert(channel,frame=frame)
    old.translation=Vector(end);foot.matrix=old;bpy.context.view_layer.update()
    for channel in ('location','rotation_quaternion'):foot.keyframe_insert(channel,frame=frame)


def axe_attack(rig):
    # The old Y-axis wind-up lifted the arm sideways with a supinated tray
    # silhouette. Swing forward around X, flexing the elbow for a real wind-up.
    g.set_action(rig,'Attack');action=bpy.data.actions['Attack'];start,end=map(int,action.frame_range)
    names=('UpperArm_R','Forearm_R');original={}
    for frame in range(start,end+1):
        bpy.context.scene.frame_set(frame);original[frame]={n:rig.pose.bones[n].rotation_quaternion.copy() for n in names}
    keys=[(start,None),(6,(55,100)),(13,(75,5)),(25,None),(end,None)]
    for frame in range(start,end+1):
        bpy.context.scene.frame_set(frame)
        i=next((i for i in range(len(keys)-1) if keys[i][0]<=frame<=keys[i+1][0]),len(keys)-2)
        left,right=keys[i],keys[i+1];t=g.smooth((frame-left[0])/max(1,right[0]-left[0]))
        for j,name in enumerate(names):
            bone=rig.pose.bones[name]
            q0=original[left[0]][name] if left[1] is None else world_turn(bone,(1,0,0),left[1][j])
            q1=original[right[0]][name] if right[1] is None else world_turn(bone,(1,0,0),right[1][j])
            bone.rotation_quaternion=q0.slerp(q1,t);bone.keyframe_insert('rotation_quaternion',frame=frame)


def rest_tool(rig,weapon,side='R'):
    """Turn the forearm, then lower the actual held geometry beside the body."""
    g.set_action(rig,'Death');action=bpy.data.actions['Death'];start,end=map(int,action.frame_range)
    bpy.context.scene.frame_set(end);fore=rig.pose.bones['Forearm_'+side];base=fore.matrix.copy();axis=(fore.tail-fore.head).normalized()
    choices=[]
    for degrees in range(-150,151,5):
        matrix=base.copy();matrix=Matrix.LocRotScale(base.translation,Quaternion(axis,math.radians(degrees))@base.to_quaternion(),Vector((1,1,1)))
        fore.matrix=matrix;bpy.context.view_layer.update();points=positions(weapon)
        # Minimize thickness above a horizontal resting plane. Do not use a
        # nominal cylinder or move the tool independently of its closed fist.
        choices.append((float(points[:,2].max()-points[:,2].min())+.00008*abs(degrees),degrees))
    degrees=min(choices)[1];fore.matrix=base;bpy.context.view_layer.update()
    originals={}
    for frame in range(start,end+1):
        bpy.context.scene.frame_set(frame);originals[frame]=fore.matrix.copy()
    for frame in range(start,end+1):
        bpy.context.scene.frame_set(frame);blend=g.smooth(((frame-start)/max(1,end-start)-.55)/.4)
        if blend<=0:continue
        base=originals[frame];axis=(fore.tail-fore.head).normalized()
        fore.matrix=Matrix.LocRotScale(base.translation,Quaternion(axis,math.radians(degrees)*blend)@base.to_quaternion(),Vector((1,1,1)));bpy.context.view_layer.update()
        minimum=float(positions(weapon)[:,2].min());target=fore.tail.copy();target.z-=(minimum-.008)*blend
        settle_arm(rig,side,target,1,frame)
        # Solving the two-link arm also changes the tool pitch. Re-evaluate
        # that geometry, rather than treating a wrist shift as a rigid tool
        # translation and inadvertently driving the blade through the floor.
        for _ in range(10):
            minimum=float(positions(weapon)[:,2].min())
            if minimum>=.004 and (blend<.999 or minimum<=.013):break
            target=fore.tail.copy();target.z=max(.035,min(.35,target.z+(.008-minimum)*.45))
            settle_arm(rig,side,target,1,frame)
    return {'forearm_roll_degrees':degrees,'final_tool_min_z':float(positions(weapon)[:,2].min())}

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--run',type=Path,required=True);p.add_argument('--unit',required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve()
    for f in ('raw','candidate','qa'):(run/f).mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    bodies=[o for o in bpy.data.objects if o.type=='MESH' and ('OriginalBody' in o.name or 'GuardBody' in o.name)];objects=[o for o in bpy.data.objects if o.type=='MESH']
    root=rig.pose.bones['Root'];localup=root.bone.matrix_local.to_3x3().inverted()@Vector((0,0,1));rows=[]
    for clip in [a.name for a in bpy.data.actions]:
        g.set_action(rig,clip);action=bpy.data.actions[clip];start,end=map(int,action.frame_range)
        original={}
        for frame in range(start,end+1):
            bpy.context.scene.frame_set(frame);original[frame]={b.name:(b.rotation_quaternion.copy(),b.location.copy()) for b in rig.pose.bones}
        for frame in range(start,end+1):
            bpy.context.scene.frame_set(frame)
            for b in rig.pose.bones:b.rotation_quaternion,b.location=original[frame][b.name]
            if clip=='Death':
                blend=g.smooth(((frame-start)/max(1,end-start)-.12)/.72)
                final=world_turn(root,(1,0,0),90)@world_turn(root,(0,0,1),-15)
                root.rotation_quaternion=original[start]['Root'][0].slerp(final,blend)
                # The original guard fall lives on Pelvis. Let Root own
                # this new fall instead of adding both rotations together.
                pelvis=rig.pose.bones['Pelvis'];pelvis.rotation_quaternion=original[start]['Pelvis'][0]
                pelvis.keyframe_insert('rotation_quaternion',frame=frame)
                for name,angle in [('SpineLower',-8),('SpineUpper',8),('Neck',12),('Thigh_L',22),('Shin_L',-35),('Foot_L',15),('Thigh_R',6),('Shin_R',-10),('Foot_R',5)]:
                    bone=rig.pose.bones[name];bone.rotation_quaternion=original[frame][name][0].slerp(world_turn(bone,(1,0,0),angle),blend)
                    bone.keyframe_insert('rotation_quaternion',frame=frame)
                # Let the arms settle along the torso instead of holding the
                # full body aloft on an outstretched hand after the side roll.
                for name,angle in [('UpperArm_L',-24),('Forearm_L',-18),('UpperArm_R',24),('Forearm_R',18)]:
                    bone=rig.pose.bones[name];bone.rotation_quaternion=original[frame][name][0].slerp(world_turn(bone,(0,1,0),angle),blend)
                    bone.keyframe_insert('rotation_quaternion',frame=frame)
                root.keyframe_insert('rotation_quaternion',frame=frame)
            bpy.context.view_layer.update()
            if clip=='Death':
                support=[]
                for body in bodies:
                    trunk={v.index for v in body.vertex_groups if v.name in ('Pelvis','SpineLower','SpineUpper','Neck','Head')}
                    ids=[v.index for v in body.data.vertices if sum(w.weight for w in v.groups if w.group in trunk)>.6]
                    support.extend(positions(body)[ids,2])
                fullfloor=min(float(positions(o)[:,2].min()) for o in bodies)
                near_flat=g.smooth(((frame-start)/max(1,end-start)-.60)/.30)
                bodyfloor=fullfloor*(1-near_flat)+float(min(support))*near_flat
            else:bodyfloor=min(float(positions(o)[:,2].min()) for o in bodies)
            # Body supports the weight. Equipment is checked separately and
            # cannot lift the whole character into a floating plank.
            shift=.004-bodyfloor;root.location+=localup*shift;root.keyframe_insert('location',frame=frame)
            bpy.context.view_layer.update()
            if clip=='Death':
                # Solve an actual resting wrist target beside the torso;
                # fixed arm Euler angles can bury the tool in the abdomen.
                settle=g.smooth(((frame-start)/max(1,end-start)-.44)/.48)
                shoulder=rig.pose.bones['UpperArm_R'].head.copy()
                if a.unit in ('guard','commander'):
                    # Move sword and shield outside their own shoulders
                    # before the torso rolls down through their swept area.
                    # World X constants put the offset guard's shield over
                    # his abdomen rather than beside his left shoulder.
                    arm_settle=g.smooth(((frame-start)/max(1,end-start)-.24)/.52)
                    settle_arm(rig,'R',Vector((shoulder.x+.40,shoulder.y+.24,max(.12,shoulder.z-.16))),arm_settle,frame)
                    shoulder=rig.pose.bones['UpperArm_L'].head.copy()
                    settle_arm(rig,'L',Vector((shoulder.x-.40,shoulder.y+.24,max(.14,shoulder.z-.16))),arm_settle,frame)
                else:settle_arm(rig,'R',Vector((.40,shoulder.y+.24,.12)),settle,frame)
                for side in 'LR':settle_foot(rig,bodies,side,settle,frame)
                # After the limb solve, no body part may pass through the
                # floor while transitioning between foot and back support.
                minimum=min(float(positions(o)[:,2].min()) for o in bodies)
                if minimum<.004:
                    root.location+=localup*(.004-minimum);root.keyframe_insert('location',frame=frame);bpy.context.view_layer.update()
            rows.append({'clip':clip,'frame':frame,'root_z_shift':shift,'minimum_body_z':min(float(positions(o)[:,2].min()) for o in bodies),'minimum_all_z':min(float(positions(o)[:,2].min()) for o in objects)})
    tool_rest=None
    if a.unit in ('worker','neutral-raider'):
        axe_attack(rig)
        tool=next(o for o in objects if 'Axe_LOD0' in o.name);tool_rest=rest_tool(rig,tool)
    elif a.unit in ('guard','commander','priest'):
        name={'guard':'KingdomSteelSword_LOD0','commander':'CommanderLongsword_LOD0','priest':'PriestDawnStaff_LOD0'}[a.unit]
        tool_rest={'R':rest_tool(rig,bpy.data.objects[name])}
        if a.unit in ('guard','commander'):
            name='KingdomSunShield_LOD0' if a.unit=='guard' else 'CommanderDawnShield_LOD0'
            tool_rest['L']=rest_tool(rig,bpy.data.objects[name],'L')
    g.set_action(rig,'Death');action=bpy.data.actions['Death']
    for frame in range(int(action.frame_range[0]),int(action.frame_range[1])+1):
        bpy.context.scene.frame_set(frame)
        minimum=min(float(positions(o)[:,2].min()) for o in objects)
        if minimum<.003:
            root.location+=localup*(.003-minimum);root.keyframe_insert('location',frame=frame)
            bpy.context.view_layer.update()
        if a.unit=='guard':
            settle=g.smooth(((frame-action.frame_range[0])/max(1,action.frame_range[1]-action.frame_range[0])-.70)/.30)
            for _ in range(2):
                for side in 'LR':settle_foot(rig,bodies,side,settle,frame)
            minimum=min(float(positions(o)[:,2].min()) for o in objects)
            if minimum<.003:root.location+=localup*(.003-minimum);root.keyframe_insert('location',frame=frame)
    g.set_action(rig,'Idle');bpy.context.scene.frame_set(0);bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(run/f'raw/{a.unit}-assembly.blend'))
    for lod in (0,1):g.export_lod(run/'candidate'/(f'{a.unit}.glb' if lod==0 else f'{a.unit}-lod1.glb'),rig,[o for o in objects if o.name.endswith(f'_LOD{lod}')])
    (run/f'qa/{a.unit}-motion-build.json').write_bytes((json.dumps({'source':str(a.source),'frames_before_tool_settle':rows,'tool_rest':tool_rest,'runtime_publish_allowed':False,'artistic_quality_proven':False},indent=2)+'\n').encode())

if __name__=='__main__':main()
