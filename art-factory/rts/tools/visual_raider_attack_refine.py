"""Lift the source axe with the shoulder, then retain its forward strike."""
import argparse,json,sys
from pathlib import Path
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from visual_unit_motion_refine import world_turn
from visual_priest_staff_refine import capture,restore,write_keys
from visual_hand_rework import mesh_fingerprint

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--run',type=Path,required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve()
    for part in ('raw','candidate','qa'):(run/part).mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    meshes=[o for o in bpy.data.objects if o.type=='MESH'];fingerprints={o.name:mesh_fingerprint(o) for o in meshes}
    g.set_action(rig,'Idle');bpy.context.scene.frame_set(0)
    fore=rig.pose.bones['Forearm_R'];hand=rig.pose.bones['Hand_R'];neutral=fore.matrix.to_quaternion().inverted()@hand.matrix.to_quaternion()
    records=json.loads(Path('art-factory/rts/runs/all-models/2026-10-14-v1/qa/neutral-raider-build.json').read_bytes())['hands']
    wrist=Vector(next(r for r in records if r['lod']==0)['cut']['wrist'])
    original=capture(rig,'Attack');names=('Shoulder_R','UpperArm_R','Forearm_R');anchors=[0,6,13,25,40]
    targets={f:{n:original[f][n][1].copy() for n in names} for f in anchors}
    for name,axis,angle in (('Shoulder_R',(0,1,0),-15),('UpperArm_R',(1,0,0),130),('Forearm_R',(1,0,0),-110)):
        targets[6][name]=world_turn(rig.pose.bones[name],axis,angle)
    desired={}
    for frame,row in original.items():
        restore(rig,row)
        lo=max(f for f in anchors if f<=frame);hi=min(f for f in anchors if f>=frame);t=g.smooth((frame-lo)/(hi-lo)) if hi>lo else 0
        for name in names:rig.pose.bones[name].rotation_quaternion=targets[lo][name].slerp(targets[hi][name],t)
        bpy.context.view_layer.update()
        q=fore.matrix.to_quaternion()@neutral;matrix=q.to_matrix().to_4x4();target=(fore.matrix@fore.bone.matrix_local.inverted())@wrist
        matrix.translation=target-matrix.to_3x3()@(hand.bone.matrix_local.inverted()@wrist);hand.matrix=matrix;bpy.context.view_layer.update()
        desired[frame]={n:(rig.pose.bones[n].location.copy(),rig.pose.bones[n].rotation_quaternion.copy()) for n in (*names,'Hand_R')}
    write_keys(rig,'Attack',desired)
    for obj in meshes:assert mesh_fingerprint(obj)==fingerprints[obj.name],('Generated source geometry changed',obj.name)
    g.set_action(rig,'Idle');bpy.context.scene.frame_set(0);bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(run/'raw/neutral-raider-assembly.blend'))
    for lod in (0,1):g.export_lod(run/'candidate'/('neutral-raider.glb' if lod==0 else 'neutral-raider-lod1.glb'),rig,[o for o in meshes if o.name.endswith(f'_LOD{lod}')])
    report={'source':str(a.source),'anchors':anchors,'windup_frame':6,'windup_world_turns_degrees':{'Shoulder_R_Y':-15,'UpperArm_R_X':130,'Forearm_R_X':-110},'unchanged_mesh_fingerprints':fingerprints,'runtime_publish_allowed':False,'artistic_quality_proven':False}
    (run/'qa/raider-attack-build.json').write_text(json.dumps(report,indent=2)+'\n')

if __name__=='__main__':main()
