"""Keep the held staff clear of the head, hips and shin through each clip."""
import argparse,json,math,sys
from pathlib import Path
import bpy
from mathutils import Vector,Quaternion,Matrix
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from original_crossbow_grip_math import solve_two_bone

def capture(rig,clip,samples_per_frame=1):
    g.set_action(rig,clip);action=bpy.data.actions[clip];rows={}
    start,end=map(int,action.frame_range)
    for step in range((end-start)*samples_per_frame+1):
        frame=start+step/samples_per_frame
        bpy.context.scene.frame_set(int(frame),subframe=frame%1)
        rows[frame]={b.name:(b.location.copy(),b.rotation_quaternion.copy(),b.scale.copy()) for b in rig.pose.bones}
    action.use_fake_user=True;rig.animation_data.action=None
    return rows

def restore(rig,row):
    for name,channels in row.items():
        b=rig.pose.bones[name];b.location,b.rotation_quaternion,b.scale=(v.copy() for v in channels)
    bpy.context.view_layer.update()

def write_keys(rig,clip,rows):
    names=next(iter(rows.values())).keys();paths={f'pose.bones["{name}"].{channel}' for name in names for channel in ('location','rotation_quaternion')}
    action=bpy.data.actions[clip]
    for layer in action.layers:
        for strip in layer.strips:
            for slot in action.slots:
                bag=strip.channelbag(slot)
                if bag:
                    for curve in list(bag.fcurves):
                        if curve.data_path in paths:bag.fcurves.remove(curve)
    g.set_action(rig,clip);previous={}
    for frame,row in rows.items():
        for name,(location,q) in row.items():
            bone=rig.pose.bones[name]
            if name in previous:q.make_compatible(previous[name])
            previous[name]=q.copy();bone.location=location;bone.rotation_quaternion=q
            for channel in ('location','rotation_quaternion'):bone.keyframe_insert(channel,frame=frame)
    for layer in action.layers:
        for strip in layer.strips:
            for slot in action.slots:
                bag=strip.channelbag(slot)
                if bag:
                    for curve in bag.fcurves:
                        if curve.data_path in paths:
                            for key in curve.keyframe_points:key.interpolation='LINEAR'

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--run',type=Path,required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve()
    for part in ('raw','candidate','qa'):(run/part).mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    original=capture(rig,'Attack');desired={}
    for frame,row in original.items():
        restore(rig,row);hand=rig.pose.bones['Hand_R']
        gain=max(0,min(1,(frame-14)/2,(21-frame)/2));gain=g.smooth(gain)
        if gain:
            pivot=hand.head.copy();hand.matrix=Matrix.Translation(pivot)@Quaternion((1,0,0),math.radians(-8*gain)).to_matrix().to_4x4()@Matrix.Translation(-pivot)@hand.matrix
            bpy.context.view_layer.update()
        desired[frame]={'Hand_R':(hand.location.copy(),hand.rotation_quaternion.copy())}
    write_keys(rig,'Attack',desired)
    original=capture(rig,'Death');desired={};offsets={38:-.005,39:-.015,40:-.020,41:-.020,42:-.0125,43:-.005,44:-.0025,45:-.005,46:-.0075,47:-.0075}
    for frame,row in original.items():
        restore(rig,row);upper=rig.pose.bones['UpperArm_R'];fore=rig.pose.bones['Forearm_R'];dz=offsets.get(frame,0)
        if dz:
            target=fore.tail.copy();target.z+=dz;shoulder=upper.head.copy();pole=(fore.head-shoulder).normalized()
            bases={upper.name:upper.matrix.to_quaternion().copy(),fore.name:fore.matrix.to_quaternion().copy()}
            elbow,endpoint=map(Vector,solve_two_bone(tuple(shoulder),tuple(target),tuple(pole),upper.bone.length,fore.bone.length))
            for bone,start,end in ((upper,shoulder,elbow),(fore,elbow,endpoint)):
                q=bases[bone.name];q=(q@Vector((0,1,0))).rotation_difference((end-start).normalized())@q
                bone.matrix=Matrix.LocRotScale(start,q,Vector((1,1,1)));bpy.context.view_layer.update()
        roll=40*g.smooth((frame-24)/6)+10*g.smooth((frame-43)/5)
        if roll:
            axis=(fore.tail-fore.head).normalized();base=fore.matrix.copy()
            fore.matrix=Matrix.LocRotScale(base.translation,Quaternion(axis,math.radians(roll))@base.to_quaternion(),Vector((1,1,1)));bpy.context.view_layer.update()
        desired[frame]={b.name:(b.location.copy(),b.rotation_quaternion.copy()) for b in (upper,fore)}
    write_keys(rig,'Death',desired)
    g.set_action(rig,'Idle');bpy.context.scene.frame_set(0);bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(run/'raw/priest-assembly.blend'));objects=[o for o in bpy.data.objects if o.type=='MESH']
    for lod in (0,1):g.export_lod(run/'candidate'/('priest.glb' if lod==0 else 'priest-lod1.glb'),rig,[o for o in objects if o.name.endswith(f'_LOD{lod}')])
    (run/'qa/priest-staff-build.json').write_text(json.dumps({'source':str(a.source),'attack_hand_pitch_degrees':-8,'death_roll_stages':[[24,30,40],[43,48,10]],'wrist_height_offsets_m':offsets,'runtime_publish_allowed':False},indent=2)+'\n')

if __name__=='__main__':main()
