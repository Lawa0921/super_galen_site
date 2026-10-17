import bpy,json,bmesh
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
src=ROOT/'art-factory/rts/runs/original-guard-assembly/revision-20261006/candidate/original-guard-assembly.blend'
bpy.ops.wm.open_mainfile(filepath=str(src))
rows=[]
for o in bpy.data.objects:
 if o.type!='MESH' or not o.name.endswith('LOD0'):continue
 bm=bmesh.new();bm.from_mesh(o.data)
 rows.append(dict(name=o.name,verts=len(o.data.vertices),tri=sum(len(p.vertices)-2 for p in o.data.polygons),bounds=[[round(min(v.co[a] for v in o.data.vertices),4),round(max(v.co[a] for v in o.data.vertices),4)] for a in range(3)],boundary=sum(e.is_boundary for e in bm.edges),materials=[m.name for m in o.data.materials],modifiers=[(m.name,m.type) for m in o.modifiers],groups=[g.name for g in o.vertex_groups]))
 bm.free()
rig=bpy.data.objects['GuardRig20']
print('INSPECTION',json.dumps({'objects':rows,'bones':{b.name:[list(b.head_local),list(b.tail_local)] for b in rig.data.bones},'extras':str(dict(bpy.context.scene.items()))}))
