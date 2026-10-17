import bpy, json, sys
from mathutils import Vector

def report(path):
    bpy.ops.wm.open_mainfile(filepath=path)
    bpy.context.view_layer.update()
    result={"file":path,"fps":bpy.context.scene.render.fps,"objects":[],"actions":[a.name for a in bpy.data.actions]}
    for obj in bpy.context.scene.objects:
        if obj.type not in {"MESH","ARMATURE"}: continue
        pts=[obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        item={"name":obj.name,"type":obj.type,"location":[round(v,4) for v in obj.location],"bounds":[[round(min(p[i] for p in pts),4) for i in range(3)],[round(max(p[i] for p in pts),4) for i in range(3)]]}
        if obj.type=="MESH":
            item["verts"]=len(obj.data.vertices); item["faces"]=len(obj.data.polygons); item["groups"]=[g.name for g in obj.vertex_groups]
        else:
            item["bones"]={b.name:[[round(v,4) for v in b.head_local],[round(v,4) for v in b.tail_local]] for b in obj.data.bones}
        result["objects"].append(item)
    print("ASSEMBLY_INSPECT="+json.dumps(result))
paths=sys.argv[sys.argv.index("--")+1:]
for p in paths: report(p)
