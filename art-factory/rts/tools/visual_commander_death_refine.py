"""Settle sword and shield outside the body with fixed hand-bone pivots."""
import argparse,json,math,sys
from pathlib import Path
import bpy
from mathutils import Matrix
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from visual_priest_staff_refine import capture,restore,write_keys
from visual_hand_rework import mesh_fingerprint

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--run',type=Path,required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve()
    for part in ('raw','candidate','qa'):(run/part).mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    assert all(abs(rig.matrix_world[i][j]-float(i==j))<1e-6 for i in range(4) for j in range(4)),'Expected the source identity armature frame'
    objects=[o for o in bpy.data.objects if o.type=='MESH'];unchanged={o.name:mesh_fingerprint(o) for o in objects}
    original=capture(rig,'Death');desired={};rows=[]
    for frame,row in original.items():
        restore(rig,row);angles={'L':-5.5*g.smooth((frame-38)/2),'R':-30*max(0,min(1,(frame-40)/2))}
        desired[frame]={}
        for side,angle in angles.items():
            hand=rig.pose.bones['Hand_'+side];old=hand.matrix.copy()
            result=Matrix.Rotation(math.radians(angle),4,'X' if side=='L' else 'Z')@old;result.translation=old.translation
            hand.matrix=result;bpy.context.view_layer.update()
            assert (hand.matrix.translation-old.translation).length<1e-6
            desired[frame][hand.name]=(hand.location.copy(),hand.rotation_quaternion.copy())
        rows.append({'frame':frame,'hand_left_world_x_degrees':angles['L'],'hand_right_world_z_degrees':angles['R']})
    write_keys(rig,'Death',desired)
    for o in objects:assert mesh_fingerprint(o)==unchanged[o.name]
    g.set_action(rig,'Idle');bpy.context.scene.frame_set(0);bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(run/'raw/commander-assembly.blend'))
    for lod in (0,1):g.export_lod(run/'candidate'/('commander.glb' if lod==0 else 'commander-lod1.glb'),rig,[o for o in objects if o.name.endswith(f'_LOD{lod}')])
    (run/'qa/commander-death-build.json').write_text(json.dumps({'source':str(a.source),'frames':rows,'rotation_pivot':'unchanged Hand bone head in armature/world identity frame','unchanged_mesh_fingerprints':unchanged,'runtime_publish_allowed':False},indent=2)+'\n')

if __name__=='__main__':main()
