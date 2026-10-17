import bpy,sys,json
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath=sys.argv[sys.argv.index('--')+1])
rig=bpy.data.objects['crossbowRig20']
print('BONES',json.dumps([{ 'name':b.name,'head':list(b.head_local),'tail':list(b.tail_local),'parent':b.parent.name if b.parent else None} for b in rig.data.bones]))
print('MESHES',json.dumps([{'name':o.name,'triangles':sum(len(p.vertices)-2 for p in o.data.polygons),'groups':[g.name for g in o.vertex_groups]} for o in bpy.data.objects if o.type=='MESH']))
print('POSE',rig.matrix_world,rig.animation_data.action.name if rig.animation_data and rig.animation_data.action else None)
