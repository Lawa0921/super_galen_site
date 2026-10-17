import bpy, json, sys
from mathutils import Vector
blend=sys.argv[sys.argv.index('--')+1]
bpy.ops.wm.open_mainfile(filepath=blend)
out=[]
for obj in bpy.data.objects:
    if obj.type!='MESH':continue
    coords=[obj.matrix_world@v.co for v in obj.data.vertices]
    mins=[min(v[i] for v in coords) for i in range(3)] if coords else [0,0,0]
    maxs=[max(v[i] for v in coords) for i in range(3)] if coords else [0,0,0]
    out.append({'name':obj.name,'parent':obj.parent.name if obj.parent else None,'verts':len(obj.data.vertices),
      'tris':sum(len(p.vertices)-2 for p in obj.data.polygons),'matrix':[[round(float(c),6) for c in row] for row in obj.matrix_world],
      'bounds':[mins,maxs],'groups':[g.name for g in obj.vertex_groups],'materials':[m.name if m else None for m in obj.data.materials]})
print(json.dumps(out,indent=2))
