"""Retain a solved two-hand carry shape while preserving authored torso/leg motion."""
import sys, os, json, hashlib, math
from pathlib import Path
import bpy
from mathutils import Matrix, Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from crossbow_rig_rebuild_blender import ARM_BONES, CLIPS, set_action, clear_arm_curves, evaluated_with_materials, exact_pairs, select_lod, elbow_circle

BASE=Path('art-factory/rts/runs/all-models/2026-10-14-crossbow')
SOURCE=BASE/'qa/probes/clearance-final-v1/raw/repaired/crossbow-assembly.blend'
RUN=BASE/'qa/probes/carry-refine-v1'

def crossings(body, weapon):
    bp,bf,_,bt=evaluated_with_materials(body)
    wp,wf,_,wt=evaluated_with_materials(weapon)
    return len(exact_pairs(bp[bf],wp[wf],bt.overlap(wt)))

def main():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE.resolve()))
    rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    scene=bpy.context.scene
    set_action(rig,'Attack');scene.frame_set(0);bpy.context.view_layer.update()
    # Hold the palm contact fixed and solve the elbow against ALL weapon parts.
    hand=rig.pose.bones['Hand_L'];upper=rig.pose.bones['UpperArm_L'];fore=rig.pose.bones['Forearm_L']
    target=bpy.data.objects.new('CarryContact',None);scene.collection.objects.link(target)
    pole=bpy.data.objects.new('CarryElbow',None);scene.collection.objects.link(pole)
    reference_hand=rig.matrix_world@hand.matrix
    grip_anchor=Vector((-0.00246333,-0.03064327,0.01332485))
    contact=reference_hand@grip_anchor
    target.matrix_world=reference_hand@Matrix.Translation((0,hand.length,0))
    original_elbow=rig.matrix_world@fore.head;shoulder=rig.matrix_world@upper.head;wrist=rig.matrix_world@hand.head
    ik=hand.constraints.new('IK');ik.target=target;ik.pole_target=pole;ik.chain_count=3;ik.use_rotation=True;ik.use_stretch=False;ik.iterations=800;ik.pole_angle=math.pi
    choices=[]
    for axis,angle in [('Y',0),*[(axis,angle)for axis in ('X','Y','Z')for angle in (-.6,-.3,.3,.6)]]:
      target_hand=reference_hand@Matrix.Rotation(angle,4,axis)
      target_hand.translation=contact-target_hand.to_3x3()@grip_anchor
      target.matrix_world=target_hand@Matrix.Translation((0,hand.length,0))
      for index,point in enumerate(elbow_circle(shoulder,target_hand.translation,original_elbow,upper.length,fore.length,24)):
        pole.location=point;bpy.context.view_layer.update()
        count=sum(crossings(bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'],bpy.data.objects[f'ProceduralCrossbow_LOD{lod}'])for lod in (0,1))
        choices.append({'axis':axis,'angle':angle,'target':target.matrix_world.copy(),'index':index,'point':point.copy(),'crossings':count,'distance':(rig.matrix_world@fore.head-original_elbow).length})
    best=min(choices,key=lambda r:(r['crossings'],r['distance']+abs(r['angle'])*.02))
    target.matrix_world=best['target'];pole.location=best['point'];bpy.context.view_layer.update()
    solved={name:rig.pose.bones[name].matrix.copy()for name in ARM_BONES}
    hand.constraints.remove(ik);bpy.data.objects.remove(target,do_unlink=True);bpy.data.objects.remove(pole,do_unlink=True)
    for name in ARM_BONES:
        rig.pose.bones[name].matrix=solved[name];bpy.context.view_layer.update()
    anchor=rig.pose.bones['SpineUpper']
    carry={name:anchor.matrix.inverted()@rig.pose.bones[name].matrix for name in ARM_BONES}
    metadata={'source':str(SOURCE),'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
              'anchor':'SpineUpper','reference_clip':'Attack','reference_frame':0,
              'elbow_search':[{'axis':r['axis'],'angle':r['angle'],'index':r['index'],'crossings':r['crossings'],'distance':r['distance']}for r in choices],
              'selected_elbow':{k:best[k]for k in ('axis','angle','index','crossings','distance')},
              'inherit_rotation':{b.name:b.use_inherit_rotation for b in rig.data.bones}}
    apply=os.environ.get('CROSSBOW_APPLY_CARRY','0')=='1'
    rows=[]
    for clip in CLIPS:
        set_action(rig,clip);action=bpy.data.actions[clip]
        start,end=(int(v) for v in action.frame_range)
        if apply:
            clear_arm_curves(action)
            for frame in range(start,end+1):
                scene.frame_set(frame);bpy.context.view_layer.update()
                spine=rig.pose.bones['SpineUpper'].matrix.copy()
                for name in ARM_BONES:
                    bone=rig.pose.bones[name];bone.matrix=spine@carry[name]
                    bpy.context.view_layer.update()
                    for channel in ('location','rotation_quaternion','scale'):
                        bone.keyframe_insert(channel,frame=frame)
        samples=int(os.environ.get('CROSSBOW_CARRY_SAMPLES','11'))
        for step in range(samples):
            frame=start+(end-start)*step/(samples-1)
            scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update()
            for lod in (0,1):
                body=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}']
                weapon=bpy.data.objects[f'ProceduralCrossbow_LOD{lod}']
                rows.append({'clip':clip,'frame':frame,'lod':lod,'crossings':crossings(body,weapon)})
    RUN.mkdir(parents=True,exist_ok=True)
    report={**metadata,'applied':apply,'rows':rows,'max_crossings':max(r['crossings']for r in rows),
            'failures':[r for r in rows if r['crossings']]}
    (RUN/('carry-green.json'if apply else'carry-red.json')).write_text(json.dumps(report,indent=2),encoding='utf8')
    print(json.dumps({k:v for k,v in report.items()if k not in ('rows','inherit_rotation')},indent=2))
    if apply:
        set_action(rig,'Idle');scene.frame_set(0)
        bpy.ops.wm.save_as_mainfile(filepath=str((RUN/'crossbow-assembly.blend').resolve()))
        if os.environ.get('CROSSBOW_CARRY_EXPORT','0')=='1':
            for lod in (0,1):
                select_lod(rig,lod);bpy.context.view_layer.objects.active=rig
                bpy.ops.export_scene.gltf(filepath=str((RUN/f'crossbow-edited-lod{lod}.glb').resolve()),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_nla_strips=False,export_force_sampling=True,export_optimize_animation_size=False,export_skins=True,export_extras=True,export_yup=True,export_tangents=True)
    assert not report['failures'],'Body intersects crossbow in an authored clip'

if __name__=='__main__':main()
