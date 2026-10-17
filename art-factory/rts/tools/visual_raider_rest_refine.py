"""Settle the existing raider fall without letting the axe lift his body."""
import argparse,json,math,sys
from pathlib import Path
import bpy
from mathutils import Vector,Quaternion,Matrix
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from original_crossbow_grip_math import solve_two_bone
from visual_knight_motion_test import positions

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--run',type=Path,required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve()
    for part in ('raw','candidate','qa'):(run/part).mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    objects=[o for o in bpy.data.objects if o.type=='MESH'];bodies=[o for o in objects if 'OriginalBody' in o.name]
    g.set_action(rig,'Death');action=bpy.data.actions['Death'];start,end=map(int,action.frame_range)
    original={}
    for frame in range(start,end+1):
        bpy.context.scene.frame_set(frame)
        original[frame]={b.name:(b.location.copy(),b.rotation_quaternion.copy(),b.scale.copy()) for b in rig.pose.bones}
    action.use_fake_user=True;rig.animation_data.action=None
    rows=[];desired={};root=rig.pose.bones['Root'];localup=root.bone.matrix_local.to_3x3().inverted()@Vector((0,0,1))
    for frame,bones in original.items():
        bpy.context.scene.frame_set(frame)
        for name,(location,q,scale) in bones.items():
            bone=rig.pose.bones[name];bone.location=location;bone.rotation_quaternion=q;bone.scale=scale
        bpy.context.view_layer.update()
        shift=.004-min(float(positions(o)[:,2].min()) for o in bodies)
        root.location+=localup*shift;bpy.context.view_layer.update()
        blend=g.smooth(((frame-start)/max(1,end-start)-.55)/.4)
        if blend>0:
            shoulder=rig.pose.bones['UpperArm_R'].head.copy()
            target=Vector((.70,shoulder.y+.24,.20+math.sin(math.pi*blend)))
            upper=rig.pose.bones['UpperArm_R'];fore=rig.pose.bones['Forearm_R']
            target=fore.tail.lerp(target,blend)
            elbow,endpoint=map(Vector,solve_two_bone(tuple(shoulder),tuple(target),(1,0,.2),upper.bone.length,fore.bone.length))
            for bone,point,end_point in ((upper,shoulder,elbow),(fore,elbow,endpoint)):
                q=bone.matrix.to_quaternion();q=(q@Vector((0,1,0))).rotation_difference((end_point-point).normalized())@q
                bone.matrix=Matrix.LocRotScale(point,q,Vector((1,1,1)));bpy.context.view_layer.update()
            axis=(fore.tail-fore.head).normalized();matrix=fore.matrix.copy()
            fore.matrix=Matrix.LocRotScale(matrix.translation,Quaternion(axis,math.radians(-5)*blend)@matrix.to_quaternion(),Vector((1,1,1)))
            bpy.context.view_layer.update()
        desired[frame]={name:(rig.pose.bones[name].location.copy(),rig.pose.bones[name].rotation_quaternion.copy()) for name in ('Root','UpperArm_R','Forearm_R')}
        rows.append({'frame':frame,'body_ground_shift_m':shift,'minimum_all_z':min(float(positions(o)[:,2].min()) for o in objects)})
    paths={f'pose.bones["{name}"].{channel}' for name in ('Root','UpperArm_R','Forearm_R') for channel in ('location','rotation_quaternion') if name!='Root' or channel=='location'}
    for layer in action.layers:
        for strip in layer.strips:
            for slot in action.slots:
                bag=strip.channelbag(slot)
                if bag:
                    for curve in list(bag.fcurves):
                        if curve.data_path in paths:bag.fcurves.remove(curve)
    g.set_action(rig,'Death');previous={}
    for frame,bones in desired.items():
        bpy.context.scene.frame_set(frame)
        for name,(location,q) in bones.items():
            bone=rig.pose.bones[name];bone.location=location;bone.keyframe_insert('location',frame=frame)
            if name!='Root':
                if name in previous:q.make_compatible(previous[name])
                previous[name]=q.copy();bone.rotation_quaternion=q;bone.keyframe_insert('rotation_quaternion',frame=frame)
    for layer in action.layers:
        for strip in layer.strips:
            for slot in action.slots:
                bag=strip.channelbag(slot)
                if bag:
                    for curve in bag.fcurves:
                        if curve.data_path in paths:
                            for key in curve.keyframe_points:key.interpolation='LINEAR'
    g.set_action(rig,'Idle');bpy.context.scene.frame_set(0);bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(run/'raw/neutral-raider-assembly.blend'))
    for lod in (0,1):g.export_lod(run/'candidate'/('neutral-raider.glb' if lod==0 else 'neutral-raider-lod1.glb'),rig,[o for o in objects if o.name.endswith(f'_LOD{lod}')])
    (run/'qa/neutral-raider-rest-build.json').write_text(json.dumps({'source':str(a.source),'frames':rows,'edited_paths':sorted(paths),'runtime_publish_allowed':False},indent=2)+'\n')

if __name__=='__main__':main()
