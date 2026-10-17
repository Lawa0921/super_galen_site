"""Identify evaluated body polygons at the Walk f6 front-view skirt/knee gaps."""
import bpy, json, sys
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
sys.path.insert(0,str(Path(__file__).resolve().parent))
from original_guard_assembly_build import setup_camera
args=sys.argv[sys.argv.index("--")+1:]
blend=Path(args[0]); out=Path(args[1])
bpy.ops.wm.open_mainfile(filepath=str(blend))
scene=bpy.context.scene; rig=bpy.data.objects["GuardRig20"]; body=bpy.data.objects["GuardBody_LOD0"]
rig.animation_data.action=bpy.data.actions["Walk"];scene.frame_set(6)
setup_camera("front",Vector((0,0,.92)),out.parent)
deps=bpy.context.evaluated_depsgraph_get();ev=body.evaluated_get(deps);mesh=ev.to_mesh()
W,H=scene.render.resolution_x,scene.render.resolution_y
def pix(co):
 n=world_to_camera_view(scene,scene.camera,ev.matrix_world@co);return(n.x*W,(1-n.y)*H)
def weights(i):
 names={g.index:g.name for g in body.vertex_groups}
 return sorted([[names.get(v.group,str(v.group)),round(v.weight,3)] for v in body.data.vertices[i].groups if v.weight>.02],key=lambda x:-x[1])
targets={"fauld_inner_gap":[282,437],"raised_thigh_top":[254,468],"knee_open_edge":[256,500]}
results={"target_centers":{}}
for key,c in targets.items():
 rows=[]
 for poly in mesh.polygons:
  pts=[pix(mesh.vertices[i].co) for i in poly.vertices]
  center=(sum(p[0] for p in pts)/len(pts),sum(p[1] for p in pts)/len(pts))
  d=((center[0]-c[0])**2+(center[1]-c[1])**2)**.5
  if d<30:
   rows.append({"poly":poly.index,"d_px":round(d,2),"center_px":[round(center[0],1),round(center[1],1)],
    "center_local":[round(v,5) for v in poly.center],
    "vertices":[{"id":i,"local":[round(v,5) for v in body.data.vertices[i].co],
     "eval_world":[round(v,5) for v in ev.matrix_world@mesh.vertices[i].co],
     "px":[round(v,1) for v in pix(mesh.vertices[i].co)],"weights":weights(i)} for i in poly.vertices]})
 rows.sort(key=lambda x:x["d_px"]);results["target_centers"][key]=rows[:35]
ev.to_mesh_clear();out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(results,indent=2))
for key,rows in results["target_centers"].items():
 print("WALK_TARGET",key,"faces",len(rows))
 for row in rows[:12]:print(json.dumps(row,separators=(",",":")))
print("WALK_PROJECT_REPORT="+str(out))
