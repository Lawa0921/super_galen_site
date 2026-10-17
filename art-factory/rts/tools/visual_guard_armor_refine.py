"""Keep generated elbow plates rigid and remove the fall's forearm twist."""
import argparse,json,sys
from pathlib import Path
import bpy
from mathutils import Vector,Matrix
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from visual_priest_staff_refine import capture,restore,write_keys
from visual_guard_armor_test import armor_core,WRISTS
from visual_hand_rework import mesh_fingerprint

def feather(body,rig,side):
    name='UpperArm_'+side;fore='Forearm_'+side;shoulder='Shoulder_'+side
    elbow=rig.data.bones[fore].head_local;axis=(rig.data.bones[name].head_local-elbow).normalized()
    core=set(armor_core(body,rig,side));count=0;limited=0
    for vertex in body.data.vertices:
        old={body.vertex_groups[w.group].name:w.weight for w in vertex.groups};dominant=max(old,key=old.get)
        d=vertex.co-elbow;t=d.dot(axis);r=(d-axis*t).length
        if vertex.index in core:updated={name:1.0}
        else:
            if old.get(name,0)+old.get(fore,0)<.15 or dominant not in (name,fore,shoulder):continue
            a=g.smooth((t+.05)/.08)*(1-g.smooth((t-.16)/.08))*(1-g.smooth((r-.12)/.08))
            if a<=0:continue
            updated={n:w*(1-a) for n,w in old.items()};updated[name]=updated.get(name,0)+a
        updated={n:w for n,w in updated.items() if w>1e-8}
        if len(updated)>4:updated=dict(sorted(updated.items(),key=lambda x:-x[1])[:4]);limited+=1
        total=sum(updated.values())
        for group in body.vertex_groups:group.remove([vertex.index])
        for n,w in updated.items():body.vertex_groups[n].add([vertex.index],w/total,'REPLACE')
        count+=1
    return {'mesh':body.name,'side':side,'core_vertices':len(core),'affected_vertices':count,'limited_to_four_influences':limited}

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--run',type=Path,required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve()
    for part in ('raw','candidate','qa'):(run/part).mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    objects=[o for o in bpy.data.objects if o.type=='MESH'];unchanged={o.name:mesh_fingerprint(o) for o in objects}
    weights=[feather(o,rig,s) for o in objects if o.name.startswith('GuardBody_') for s in 'LR']
    original=capture(rig,'Death',samples_per_frame=4);desired={};maximum_hand_matrix_error=0;maximum_wrist_error=0
    for frame,row in original.items():
        restore(rig,row);desired[frame]={}
        for side in 'LR':
            upper=rig.pose.bones['UpperArm_'+side];fore=rig.pose.bones['Forearm_'+side];hand=rig.pose.bones['Hand_'+side]
            hand_world=hand.matrix.copy();elbow=fore.bone.head_local;wrist=WRISTS[side]
            old_skin=fore.matrix@fore.bone.matrix_local.inverted();posed_elbow=old_skin@elbow;posed_wrist=old_skin@wrist
            upper_skin=(upper.matrix@upper.bone.matrix_local.inverted()).to_quaternion()
            q=(upper_skin@(wrist-elbow)).rotation_difference(posed_wrist-posed_elbow)@upper_skin
            target_skin=Matrix.LocRotScale(posed_elbow-q@elbow,q,Vector((1,1,1)))
            fore.matrix=target_skin@fore.bone.matrix_local
            bpy.context.view_layer.update();hand.matrix=hand_world;bpy.context.view_layer.update()
            maximum_wrist_error=max(maximum_wrist_error,((fore.matrix@fore.bone.matrix_local.inverted())@wrist-posed_wrist).length)
            maximum_hand_matrix_error=max(maximum_hand_matrix_error,max(abs(hand.matrix[i][j]-hand_world[i][j]) for i in range(4) for j in range(4)))
            for b in (fore,hand):desired[frame][b.name]=(b.location.copy(),b.rotation_quaternion.copy())
    assert maximum_hand_matrix_error<1e-6 and maximum_wrist_error<1e-6
    write_keys(rig,'Death',desired)
    for o in objects:assert mesh_fingerprint(o)==unchanged[o.name],('Original generated geometry changed',o.name)
    g.set_action(rig,'Idle');bpy.context.scene.frame_set(0);bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(run/'raw/guard-assembly.blend'))
    for lod in (0,1):g.export_lod(run/'candidate'/('guard.glb' if lod==0 else 'guard-lod1.glb'),rig,[o for o in objects if o.name.endswith(f'_LOD{lod}')])
    (run/'qa/guard-armor-build.json').write_text(json.dumps({'source':str(a.source),'weights':weights,'maximum_hand_matrix_error':maximum_hand_matrix_error,'maximum_anatomical_wrist_error_m':maximum_wrist_error,'unchanged_mesh_fingerprints':unchanged,'runtime_publish_allowed':False},indent=2)+'\n')

if __name__=='__main__':main()
