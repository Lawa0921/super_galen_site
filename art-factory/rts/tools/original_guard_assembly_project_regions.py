"""Project screen-space artifact ROIs into evaluated body polygons at Attack f16."""
import bpy, json, sys
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_assembly_build import setup_camera

args=sys.argv[sys.argv.index("--")+1:]
blend_path=Path(args[0])
out_path=Path(args[1])
bpy.ops.wm.open_mainfile(filepath=str(blend_path))
scene=bpy.context.scene
rig=bpy.data.objects["GuardRig20"]
body=bpy.data.objects["GuardBody_LOD0"]
rig.animation_data.action=bpy.data.actions["Attack"]
scene.frame_set(16)
setup_camera("side", Vector((0.0,0.0,0.92)), out_path.parent)
scene.view_layers.update()
deps=bpy.context.evaluated_depsgraph_get()
ev=body.evaluated_get(deps)
mesh=ev.to_mesh()
W,H=scene.render.resolution_x,scene.render.resolution_y
def pix(co):
    ndc=world_to_camera_view(scene, scene.camera, ev.matrix_world @ co)
    return (ndc.x*W,(1.0-ndc.y)*H)
def point_seg_dist(p,a,b):
    vx=b[0]-a[0]; vy=b[1]-a[1]
    den=vx*vx+vy*vy
    t=0 if den==0 else max(0,min(1,((p[0]-a[0])*vx+(p[1]-a[1])*vy)/den))
    q=(a[0]+t*vx,a[1]+t*vy)
    return ((p[0]-q[0])**2+(p[1]-q[1])**2)**0.5
segments={"knee_spike":{"a":[416,505],"b":[430,460],"radius_px":8},
          "old_palm":{"a":[292,403],"b":[292,403],"radius_px":18}}
group_name={g.index:g.name for g in body.vertex_groups}
def weights(i):
    out=[]
    for item in body.data.vertices[i].groups:
        if item.weight>0.02: out.append([group_name.get(item.group,str(item.group)),round(item.weight,3)])
    return sorted(out,key=lambda x:-x[1])
results={"resolution":[W,H],"segments":{}}
for name,spec in segments.items():
    a=spec["a"]; b=spec["b"]; rows=[]
    for poly in mesh.polygons:
        pts=[pix(mesh.vertices[i].co) for i in poly.vertices]
        center=(sum(p[0] for p in pts)/len(pts),sum(p[1] for p in pts)/len(pts))
        d=point_seg_dist(center,a,b)
        if d<=spec["radius_px"] or any(point_seg_dist(p,a,b)<=spec["radius_px"] for p in pts):
            ids=list(poly.vertices)
            rows.append({"poly":poly.index,"center_px":[round(center[0],2),round(center[1],2)],
              "distance_px":round(d,2),"center_local":[round(v,5) for v in poly.center],
              "vertices":[{"index":i,"local":[round(v,5) for v in body.data.vertices[i].co],
                "eval_world":[round(v,5) for v in ev.matrix_world @ mesh.vertices[i].co],
                "pixel":[round(v,2) for v in pix(mesh.vertices[i].co)],"weights":weights(i)} for i in ids]})
    rows.sort(key=lambda r:r["distance_px"])
    results["segments"][name]=rows[:80]
ev.to_mesh_clear()
out_path.parent.mkdir(parents=True,exist_ok=True)
out_path.write_text(json.dumps(results,indent=2))
print("PROJECT_REGION_REPORT="+str(out_path))
for name,rows in results["segments"].items():
    print("PROJECT_REGION="+name+" count="+str(len(rows)))
    for row in rows[:18]: print(json.dumps(row,separators=(",",":")))
