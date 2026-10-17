"""Apply root weights and source-knuckle flexion without changing rest geometry."""
import bpy,json,hashlib,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-glove-joints/2026-10-07-v2';SOURCE=RUN.parent/'2026-10-07-v1/candidate/joint-rig.blend'
data=json.loads((RUN/'raw/root-weights.json').read_text());assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==data['source_sha256']
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));obj=bpy.data.objects['OriginalJointGlove_L_LOD0'];rig=bpy.data.objects['OriginalHandRig_L']
for group in obj.vertex_groups:group.remove(list(range(len(obj.data.vertices))))
for i,weights in enumerate(data['weights']):
 for name,value in weights.items():obj.vertex_groups[name].add([i],value,'REPLACE')
bpy.context.view_layer.objects.active=rig
bone=rig.data.bones['Middle1_L'];long=(bone.tail_local-bone.head_local).normalized()
row=rig.data.bones['Index1_L'].head_local-rig.data.bones['Ring1_L'].head_local
local=(row-long*row.dot(long)).normalized();original_axis=long.cross(__import__('mathutils').Vector((0,-1,0))).normalized()
# Midpoint of the collision-free .375..75 interval measured on this original
# connected surface with the unchanged 0..62-degree root excursion.
axis=original_axis.lerp(local,.5625).normalized();bone['original_flexion_axis']=list(axis)
rig.animation_data_clear()
for action in list(bpy.data.actions):bpy.data.actions.remove(action)
sys.path.insert(0,str(Path(__file__).parent))
import original_glove_joint_rig as original
original.motion.pose_matrices=original.pose_matrices
original.motion.animate(rig,'L')
bpy.ops.wm.save_as_mainfile(filepath=str(RUN/'candidate/joint-rig.blend'))
print(json.dumps({'source_sha256':data['source_sha256'],'candidate_sha256':hashlib.sha256((RUN/'candidate/joint-rig.blend').read_bytes()).hexdigest()}))
