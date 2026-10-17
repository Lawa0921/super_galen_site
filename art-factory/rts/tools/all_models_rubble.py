"""Rejected vertical-only prototype and shared source-mesh helpers.

Approved rubble uses all_models_rubble_settle.py. The vertical ray-drop CLI
created implausible towers and is retained only as rejection evidence.
"""
import bpy,bmesh,json,sys,hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/all-models/2026-10-14-v1'
sys.path.insert(0,str(Path(__file__).parent))
import building_rubble_build as original

def components(obj):
 bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.separate(type='LOOSE');bpy.ops.object.mode_set(mode='OBJECT')
 return [o for o in bpy.context.scene.objects if o.type=='MESH']

def vertices(obj):return [obj.matrix_world@v.co for v in obj.data.vertices]
def support(objects):
 rows=[]
 for obj in objects:
  vs=vertices(obj);bottom=min(v.z for v in vs)
  if any(m.name.startswith('Courtyard')for m in obj.data.materials if m) and len(obj.data.polygons)>100:
   rows.append({'object':obj.name,'anchor':'earth','gap_m':0});continue
  if bottom<.003:rows.append({'object':obj.name,'anchor':'ground','gap_m':abs(bottom),'bottom_m':bottom});continue
  others=[o for o in objects if o!=obj];points=[];faces=[]
  for other in others:
   offset=len(points);points.extend(vertices(other));other.data.calc_loop_triangles();faces.extend([[offset+i for i in t.vertices]for t in other.data.loop_triangles])
  tree=BVHTree.FromPolygons(points,faces,all_triangles=True)
  closest=min((tree.find_nearest(v)[3]for v in vs),default=99)
  obj.data.calc_loop_triangles()
  centers=[sum((vs[i]for i in t.vertices),Vector())/3 for t in obj.data.loop_triangles]
  closest=min(closest,min(tree.find_nearest(v)[3]for v in centers))
  rows.append({'object':obj.name,'anchor':'debris','gap_m':closest,'bottom_m':bottom})
 return rows

def main(name,check=False):
 source=ROOT/f'art-factory/rts/runs/building-rubble/2026-10-09-v1/raw/{name}.blend';bpy.ops.wm.open_mainfile(filepath=str(source));obj=next(o for o in bpy.data.objects if o.type=='MESH');parts=components(obj);bpy.context.view_layer.update();before=support(parts)
 (RUN/f'qa/{name}-support-before.json').write_bytes((json.dumps(before,indent=2)+'\n').encode())
 if check:
  bad=[r for r in before if r['gap_m']>.018];print(json.dumps({'unit':name,'unsupported':bad}));assert not bad;return
 # Solve vertical placement against the actual accumulated mesh surface.
 # This avoids unstable open-mesh rigid-body collisions and retains authored
 # angles and materials. Dense samples include triangle interiors.
 anchors=[];moving=[];contacts=[]
 for part in parts:
  vs=vertices(part);is_mound=len(part.data.polygons)>100 and any(m.name.startswith('Courtyard')for m in part.data.materials if m)
  is_wall=max(v.z for v in vs)-min(v.z for v in vs)>.65 and min(v.z for v in vs)<.005
  (anchors if is_mound or is_wall else moving).append(part)
 for part in sorted(moving,key=lambda o:min(v.z for v in vertices(o))):
  points=[];faces=[]
  for other in anchors:
   offset=len(points);points.extend(vertices(other));other.data.calc_loop_triangles();faces.extend([[offset+i for i in t.vertices]for t in other.data.loop_triangles])
  tree=BVHTree.FromPolygons(points,faces,all_triangles=True);vs=vertices(part);part.data.calc_loop_triangles();samples=list(vs)
  for tri in part.data.loop_triangles:
   a,b,c=[vs[i]for i in tri.vertices]
   for i in range(1,7):
    for j in range(1,7-i):samples.append(a+(b-a)*(i/7)+(c-a)*(j/7))
  drop=-100;contact=None
  for sample in samples:
   hit=tree.ray_cast(Vector((sample.x,sample.y,8)),Vector((0,0,-1)),16)[0]
   floor=max(0,hit.z if hit is not None else 0);offset=floor-sample.z+.001
   if offset>drop:drop=offset;contact=(sample.copy(),floor)
  part.location.z+=drop;bpy.context.view_layer.update();anchors.append(part)
  contacts.append({'object':part.name,'translation_z':drop,'contact_point':list(contact[0]+Vector((0,0,drop))),'support_z':contact[1],'gap_m':.001})
 after=support(parts)
 for row in after:
  contact=next((c for c in contacts if c['object']==row['object']),None)
  if contact:
   points=[];faces=[]
   for other in parts:
    if other.name==row['object']:continue
    offset=len(points);points.extend(vertices(other));other.data.calc_loop_triangles();faces.extend([[offset+i for i in t.vertices]for t in other.data.loop_triangles])
   tree=BVHTree.FromPolygons(points,faces,all_triangles=True);point=Vector(contact['contact_point'])
   contact['measured_gap_m']=min(abs(point.z),tree.find_nearest(point)[3])
   row['gap_m']=min(row['gap_m'],contact['measured_gap_m']);row['surface_contact']=contact
 report={'id':name,'source':str(source.relative_to(ROOT)),'method':'Dense surface samples translated vertically onto the actual previously settled triangle surface; original angles, geometry and UVs retained','before':before,'after':after,'maximum_gap_m':max(r['gap_m']for r in after)}
 (RUN/f'qa/{name}-support.json').write_bytes((json.dumps(report,indent=2)+'\n').encode());print(json.dumps({'id':name,'before_max':max(r['gap_m']for r in before),'after_max':report['maximum_gap_m']}))
 bpy.ops.object.select_all(action='DESELECT')
 for o in parts:o.select_set(True)
 bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();obj=bpy.context.object;obj.name=name;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 bpy.ops.wm.save_as_mainfile(filepath=str(RUN/f'raw/{name}-settled.blend'))
 out=RUN/f'candidate/{name}.glb';bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_texcoords=True,export_normals=True,export_materials='EXPORT');original.relink_images(out)
 report['candidate_sha256']=hashlib.sha256(out.read_bytes()).hexdigest();report['source_sha256']=hashlib.sha256((RUN/f'raw/{name}-settled.blend').read_bytes()).hexdigest();(RUN/f'qa/{name}-support.json').write_bytes((json.dumps(report,indent=2)+'\n').encode());assert report['maximum_gap_m']<.018
if __name__=='__main__':
 args=sys.argv[sys.argv.index('--')+1:];main(args[0],'--check-baseline'in args)
