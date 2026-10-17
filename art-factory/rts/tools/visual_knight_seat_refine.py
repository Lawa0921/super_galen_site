"""Use the same reachable seated leg targets for both mounted rider LODs."""
import argparse,json,math,sys
from pathlib import Path
import bpy
from mathutils import Vector,Matrix,Quaternion
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_grip_math import solve_two_bone
from visual_knight_seat_test import select_clip
from visual_hand_rework import mesh_fingerprint

def soften_seated_hip(body):
    """Blend the two weights straddling the decimated right hip seam."""
    if not body.name.endswith('LOD1'):return None
    vertices=[body.data.vertices[i] for i in (378,380)]
    weights=[{body.vertex_groups[w.group].name:w.weight for w in v.groups} for v in vertices]
    expected={'Pelvis','SpineLower','Thigh_L','Thigh_R'}
    assert all(set(w)==expected for w in weights),'Rider hip topology changed'
    assert all(.09<v.co.x<.12 and .59<v.co.z<.62 for v in vertices)
    mean={name:sum(w[name] for w in weights)/2 for name in expected}
    for v,old in zip(vertices,weights):
        for name,value in old.items():body.vertex_groups[name].add([v.index],.9*value+.1*mean[name],'REPLACE')
    return {'vertices':[378,380],'mean_blend':.1,'original_weights':weights}

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--run',type=Path,required=True);p.add_argument('--lod',type=int,required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve()
    for name in ('raw','qa'):(run/name).mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));rig=bpy.data.objects['MountedKnightRig'];unchanged={o.name:mesh_fingerprint(o) for o in bpy.data.objects if o.type=='MESH'}
    select_clip('Idle');bpy.context.scene.frame_set(1);idle_root=rig.pose.bones['Root'].matrix.copy();inverse=rig.matrix_world.inverted()
    horse=bpy.data.objects['WarhorseRig'];idle_saddle=horse.matrix_world@horse.pose.bones['HorseBody'].matrix
    targets={s:inverse@Vector((-.42 if s=='L' else .42,.10,.99)) for s in 'LR'}
    tracks={t.name:t.strips[0].action.name for t in rig.animation_data.nla_tracks};rows=[]
    for clip,name in tracks.items():
        select_clip(clip);action=bpy.data.actions[name];roots={}
        for frame in range(int(action.frame_range[0]),int(action.frame_range[1])+1):
            bpy.context.scene.frame_set(frame)
            roots[frame]=rig.pose.bones['Root'].matrix@idle_root.inverted() if clip=='Death' else inverse@(horse.matrix_world@horse.pose.bones['HorseBody'].matrix)@idle_saddle.inverted()@rig.matrix_world
        # Edit the rider action directly after capturing its Root motion.
        for t in rig.animation_data.nla_tracks:t.mute=True
        rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0];previous={};maximum_error=0
        for frame,delta in roots.items():
            bpy.context.scene.frame_set(frame)
            for side in 'LR':
                thigh=rig.pose.bones['Thigh_'+side];shin=rig.pose.bones['Shin_'+side];foot=rig.pose.bones['Foot_'+side]
                hip=thigh.head.copy();target=delta@targets[side];pole=delta.to_3x3()@Vector((-1 if side=='L' else 1,.5,0))
                knee,ankle=solve_two_bone(tuple(hip),tuple(target),tuple(pole),thigh.bone.length,shin.bone.length)
                for bone,start,finish in ((thigh,hip,Vector(knee)),(shin,Vector(knee),Vector(ankle))):
                    base=delta.to_quaternion()@bone.bone.matrix_local.to_quaternion()
                    q=(base@Vector((0,1,0))).rotation_difference((finish-start).normalized())@base
                    bone.matrix=Matrix.LocRotScale(start,q,Vector((1,1,1)));bpy.context.view_layer.update()
                q=delta.to_quaternion()@Quaternion((0,0,1),math.radians(-20 if side=='L' else 5))@foot.bone.matrix_local.to_quaternion()
                foot.matrix=Matrix.LocRotScale(Vector(ankle),q,Vector((1,1,1)));bpy.context.view_layer.update()
                maximum_error=max(maximum_error,(rig.matrix_world.to_3x3()@(Vector(ankle)-target)).length)
                for bone in (thigh,shin,foot):
                    if bone.name in previous:bone.rotation_quaternion.make_compatible(previous[bone.name])
                    previous[bone.name]=bone.rotation_quaternion.copy()
                    for channel in ('location','rotation_quaternion'):bone.keyframe_insert(channel,frame=frame)
        for layer in action.layers:
            for strip in layer.strips:
                for slot in action.slots:
                    bag=strip.channelbag(slot)
                    if bag:
                        for curve in bag.fcurves:
                            if any('"'+part+'_'+s+'"' in curve.data_path for s in 'LR' for part in ('Thigh','Shin','Foot')):
                                for key in curve.keyframe_points:key.interpolation='LINEAR'
        rows.append({'clip':clip,'maximum_reach_residual_m':maximum_error,'frames':len(roots)})
    patch=soften_seated_hip(next(o for o in bpy.data.objects if o.name.startswith('MountedKnightBody_')))
    select_clip('Idle');bpy.context.scene.frame_set(1)
    for name,digest in unchanged.items():assert mesh_fingerprint(bpy.data.objects[name])==digest,('Source geometry changed',name)
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(run/f'raw/knight-lod{a.lod}.blend'))
    (run/f'qa/seat-build-lod{a.lod}.json').write_text(json.dumps({'source':str(a.source),'idle_ankle_targets_world':{'L':[-.42,.10,.99],'R':[.42,.10,.99]},'clips':rows,'hip_weight_patch':patch,'runtime_publish_allowed':False},indent=2)+'\n')

if __name__=='__main__':main()
