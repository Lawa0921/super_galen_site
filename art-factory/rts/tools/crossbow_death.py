"""Release the supporting hand and lower the crossbow beside the falling body."""
import math,os
import bpy
from mathutils import Matrix,Vector
from crossbow_rig_rebuild_blender import set_action,ARM_BONES,elbow_circle,evaluated_with_materials,exact_pairs

def full_crossings(lod):
 bp,bf,_,bt=evaluated_with_materials(bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'])
 wp,wf,_,wt=evaluated_with_materials(bpy.data.objects[f'ProceduralCrossbow_LOD{lod}'])
 return len(exact_pairs(bp[bf],wp[wf],bt.overlap(wt)))

def author_death(rig):
 def smooth(value):
  value=max(0,min(1,value));return value*value*(3-2*value)
 scene=bpy.context.scene;set_action(rig,'Death');action=bpy.data.actions['Death'];start,end=map(int,action.frame_range)
 scene.frame_set(start);bpy.context.view_layer.update();root0=rig.matrix_world@rig.pose.bones['Root'].matrix
 reference={s:root0.inverted()@rig.matrix_world@rig.pose.bones['Hand_'+s].matrix for s in 'RL'}
 arm_reference={name:root0.inverted()@rig.matrix_world@rig.pose.bones[name].matrix for name in ARM_BONES}
 final={}
 for side in 'RL':
  world=Matrix.Rotation(math.radians(-90 if side=='R'else-45),4,'X')@root0@reference[side]
  world.translation=rig.matrix_world@Vector((.48 if side=='R'else-.48,.04,.99))
  final[side]=root0.inverted()@world
 for frame in range(start,end+1):
  scene.frame_set(frame);root=rig.pose.bones['Root'];q=root.rotation_quaternion.copy();q.x=-q.x;root.rotation_quaternion=q;root.keyframe_insert('rotation_quaternion',frame=frame)
 solved={};rows=[];previous={}
 def orient(bone,origin,direction,reference_world):
  old_direction=reference_world.to_3x3()@Vector((0,1,0))
  rotation=old_direction.rotation_difference(direction.normalized())@reference_world.to_quaternion()
  matrix=rotation.to_matrix().to_4x4();matrix.translation=origin;bone.matrix=rig.matrix_world.inverted()@matrix
  bpy.context.view_layer.update()
 for frame in range(start,end+1):
  print('death direct solve frame',frame,flush=True)
  scene.frame_set(frame);bpy.context.view_layer.update();root=rig.matrix_world@rig.pose.bones['Root'].matrix
  phase=(frame-start)/(end-start);blend=max(0,min(1,(phase-.18)/.5));blend=blend*blend*(3-2*blend)
  if blend==0:
   for name in ARM_BONES:
    rig.pose.bones[name].matrix=rig.matrix_world.inverted()@root@arm_reference[name];bpy.context.view_layer.update()
   solved[frame]={name:rig.pose.bones[name].matrix.copy()for name in ARM_BONES}
   rows.append({'frame':frame,'release_blend':blend,'crossings':[full_crossings(lod)for lod in (0,1)],'residual':{'R':0,'L':0}})
   continue
  for side in 'RL':
   hand=rig.pose.bones['Hand_'+side];upper=rig.pose.bones['UpperArm_'+side];fore=rig.pose.bones['Forearm_'+side]
   if side not in previous:previous[side]=root.inverted()@rig.matrix_world@fore.head
   move=smooth((phase-(.32 if side=='R'else.18))/.4)
   turn=move if side=='R'else smooth((phase-.28)/.36)
   if move==0:
    for part in ('UpperArm','Forearm','Hand'):
     name=part+'_'+side;rig.pose.bones[name].matrix=rig.matrix_world.inverted()@root@arm_reference[name];bpy.context.view_layer.update()
    previous[side]=root.inverted()@rig.matrix_world@fore.head
    continue
   local=reference[side].to_quaternion().slerp(final[side].to_quaternion(),turn).to_matrix().to_4x4()
   local.translation=reference[side].translation.lerp(final[side].translation,move)
   world=root@local
   shoulder=rig.matrix_world@upper.head
   elbow_reference=root@previous[side]
   candidates=[]
   def apply(point):
    orient(upper,shoulder,point-shoulder,root@arm_reference[upper.name])
    orient(fore,point,world.translation-point,root@arm_reference[fore.name])
    hand.matrix=rig.matrix_world.inverted()@world;bpy.context.view_layer.update()
   for point in elbow_circle(shoulder,world.translation,elbow_reference,upper.length,fore.length,24):
    apply(point)
    count=full_crossings(0)+full_crossings(1)
    candidates.append((count,(point-elbow_reference).length,point.copy()))
    if count==0:break
   selected=min(candidates,key=lambda r:(r[0],r[1]));apply(selected[2])
   previous[side]=root.inverted()@rig.matrix_world@fore.head
  solved[frame]={name:rig.pose.bones[name].matrix.copy()for name in ARM_BONES}
  rows.append({'frame':frame,'release_blend':blend,'crossings':[full_crossings(lod)for lod in (0,1)],'residual':{s:(rig.pose.bones['Forearm_'+s].tail-rig.pose.bones['Hand_'+s].head).length for s in 'RL'}})
 for frame,poses in solved.items():
  scene.frame_set(frame)
  for name in ARM_BONES:
   bone=rig.pose.bones[name];bone.matrix=poses[name];bpy.context.view_layer.update()
   for prop in ('location','rotation_quaternion','scale'):bone.keyframe_insert(prop,frame=frame)
 assert max(value for row in rows for value in row['residual'].values())<.025,'Death hand target is unreachable'
 failures=[(row['frame'],row['crossings'])for row in rows if any(row['crossings'])]
 print('Death source collisions:',failures,flush=True)
 assert not failures,'Death source body/weapon crossings remain'
 return rows
