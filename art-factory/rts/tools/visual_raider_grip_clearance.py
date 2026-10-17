"""Clear the axe after restoring an unsheared generated raider fist."""
import argparse,json,math,sys
from pathlib import Path
import bpy
from mathutils import Vector,Quaternion,Matrix
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from original_crossbow_grip_math import solve_two_bone
from visual_priest_staff_refine import capture,restore,write_keys
from visual_hand_rework import mesh_fingerprint


def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--run',type=Path,required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve()
    for part in ('raw','candidate','qa'):(run/part).mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    objects=[o for o in bpy.data.objects if o.type=='MESH'];unchanged={o.name:mesh_fingerprint(o) for o in objects}
    original=capture(rig,'Death');desired={};rows=[]
    for frame,row in original.items():
        restore(rig,row);upper=rig.pose.bones['UpperArm_R'];fore=rig.pose.bones['Forearm_R']
        roll=6*g.smooth((frame-39)/3)*(1-g.smooth((frame-44)/4))
        dy=-.03*g.smooth((frame-43)/2)
        if roll:
            axis=(fore.tail-fore.head).normalized();base=fore.matrix.copy()
            fore.matrix=Matrix.LocRotScale(base.translation,Quaternion(axis,math.radians(roll))@base.to_quaternion(),Vector((1,1,1)))
            bpy.context.view_layer.update()
        if dy:
            target=fore.tail+Vector((0,dy,0));shoulder=upper.head.copy();pole=(fore.head-shoulder).normalized()
            bases={b.name:b.matrix.to_quaternion().copy() for b in (upper,fore)}
            elbow,endpoint=map(Vector,solve_two_bone(tuple(shoulder),tuple(target),tuple(pole),upper.bone.length,fore.bone.length))
            for bone,start,end in ((upper,shoulder,elbow),(fore,elbow,endpoint)):
                q=bases[bone.name];q=(q@Vector((0,1,0))).rotation_difference((end-start).normalized())@q
                bone.matrix=Matrix.LocRotScale(start,q,Vector((1,1,1)));bpy.context.view_layer.update()
        desired[frame]={b.name:(b.location.copy(),b.rotation_quaternion.copy()) for b in (upper,fore)}
        rows.append({'frame':frame,'forearm_roll_degrees':roll,'wrist_y_offset_m':dy})
    write_keys(rig,'Death',desired)
    for o in objects:assert mesh_fingerprint(o)==unchanged[o.name],('Source mesh changed',o.name)
    g.set_action(rig,'Idle');bpy.context.scene.frame_set(0);bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(run/'raw/neutral-raider-assembly.blend'))
    for lod in (0,1):g.export_lod(run/'candidate'/('neutral-raider.glb' if lod==0 else 'neutral-raider-lod1.glb'),rig,[o for o in objects if o.name.endswith(f'_LOD{lod}')])
    (run/'qa/neutral-raider-grip-clearance-build.json').write_text(json.dumps({'source':str(a.source),'frames':rows,'unchanged_mesh_fingerprints':unchanged,'runtime_publish_allowed':False},indent=2)+'\n')


if __name__=='__main__':main()
