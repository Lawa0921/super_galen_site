import bpy,json,sys
from pathlib import Path
R=Path(__file__).resolve().parents[3]
bpy.ops.wm.open_mainfile(filepath=str(R/'art-factory/rts/runs/original-guard-assembly/revision-20261006/backup/original-guard-assembly.blend'))
rig=bpy.data.objects['GuardRig20']
print('RIG',json.dumps({b.name:{'head':list(b.head_local),'tail':list(b.tail_local),'parent':b.parent.name if b.parent else None} for b in rig.data.bones}))
for o in bpy.data.objects:
 if o.type=='MESH' and o.name.endswith('LOD0'):
  print('MESH',o.name,len(o.data.vertices),[g.name for g in o.vertex_groups],list(o.matrix_world.translation))
print('POSE', {n:list(rig.pose.bones[n].matrix.translation) for n in ('Hand_R','Hand_L','Sword','Shield') if n in rig.pose.bones})
