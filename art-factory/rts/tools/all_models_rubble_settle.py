"""Settle each original fragment onto the actual already-supported surface."""
import bpy,sys,json,math,hashlib
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
import all_models_rubble as base
from all_models_rubble_physics import bounds,select
from rubble_contact_geometry import segment_distance
ROOT=base.ROOT;RUN=base.RUN

def tree(obj):
 obj.data.calc_loop_triangles()
 return BVHTree.FromPolygons(base.vertices(obj),[list(t.vertices)for t in obj.data.loop_triangles],all_triangles=True)

def contact(obj,others):
 vertices=base.vertices(obj);bottom=min(v.z for v in vertices);best=abs(bottom);owner='ground';own_tree=tree(obj)
 for other in others:
  other_tree=tree(other)
  other_vertices=base.vertices(other)
  gap=min(min(other_tree.find_nearest(v)[3]for v in vertices),min(own_tree.find_nearest(v)[3]for v in other_vertices))
  if other_tree.overlap(own_tree):gap=0.
  if gap>.002:
   for edge in obj.data.edges:
    a,b=[vertices[i]for i in edge.vertices]
    for second in other.data.edges:
     c,d=[other_vertices[i]for i in second.vertices]
     lower=sum(max(0,min(a[k],b[k])-max(c[k],d[k]),min(c[k],d[k])-max(a[k],b[k]))**2 for k in range(3))
     if lower<gap*gap:gap=min(gap,segment_distance(a,b,c,d))
  if gap<best:best=gap;owner=other.name
 return {'object':obj.name,'supported_by':owner,'gap_m':best,'bottom_m':bottom}

def main(name):
 source=ROOT/f'art-factory/rts/runs/building-rubble/2026-10-09-v1/raw/{name}.blend';bpy.ops.wm.open_mainfile(filepath=str(source));parts=base.components(next(o for o in bpy.data.objects if o.type=='MESH'));scene=bpy.context.scene;scene.render.fps=60
 anchors=[];moving=[];proxies=[];settled=[];contacts=[];signature={}
 for part in parts:
  signature[part.name]=([list(p.vertices)for p in part.data.polygons],[(float(u.uv.x),float(u.uv.y))for u in part.data.uv_layers.active.data])
  select(part);bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY',center='BOUNDS');bpy.context.view_layer.update();lo,hi=bounds(part)
  anchor=(len(part.data.polygons)>100 and any(m.name.startswith('Courtyard')for m in part.data.materials if m))or(hi.z-lo.z>.65 and lo.z<.005)
  (anchors if anchor else moving).append(part)
 def proxy_for(part,active=False):
  proxy=part.copy();proxy.data=part.data.copy();proxy.animation_data_clear();proxy.name='Collision_'+part.name;scene.collection.objects.link(proxy);select(proxy);bpy.ops.rigidbody.object_add();rb=proxy.rigid_body;rb.type='ACTIVE'if active else'PASSIVE';rb.collision_shape='CONVEX_HULL'if active else'MESH';rb.use_margin=True;rb.collision_margin=.001;rb.friction=1;rb.restitution=0
  if active:rb.mass=1;rb.linear_damping=.65;rb.angular_damping=.85
  proxies.append(proxy);return proxy
 for part in anchors:proxy_for(part);settled.append(part)
 bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,-.2));floor=bpy.context.object;floor.scale=(12,12,.4);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);bpy.ops.rigidbody.object_add();floor.rigid_body.type='PASSIVE';floor.rigid_body.collision_shape='BOX';floor.rigid_body.friction=1
 world=scene.rigidbody_world;world.substeps_per_frame=12;world.solver_iterations=80;world.point_cache.frame_end=3601;scene.frame_end=3601
 def placement_order(part):
  volume=math.prod(bounds(part)[1]-bounds(part)[0])
  materials={part.data.materials[face.material_index].name for face in part.data.polygons}
  # Stone rubble uses masonry as its foundation; heavy blocks must not finish
  # perched above fragile roofing sheets on a narrow timber bridge.
  rank=0 if any(n.startswith(('IvoryLimestone','LightCutStone'))for n in materials)else 1 if any(n.startswith('DarkTimber')for n in materials)else 2
  return (rank if name=='rubble-a'else 0,-volume)
 moving.sort(key=placement_order)
 for index,part in enumerate(moving):
  world.enabled=False;scene.frame_set(1)
  # Land on the fragment's broad authored face instead of balancing long slates
  # on their narrow broken rim. This is only a rigid placement, never a reshape.
  broad=max(part.data.polygons,key=lambda face:face.area);normal=part.matrix_world.to_3x3()@broad.normal
  if normal.z<0:normal=-normal
  rotation=normal.rotation_difference(Vector((0,0,1))).to_matrix().to_4x4();position=part.matrix_world.translation.copy()
  part.matrix_world=Matrix.Translation(position)@rotation@Matrix.Translation(-position)@part.matrix_world;bpy.context.view_layer.update()
  lo,hi=bounds(part);base_low=lo.z-part.location.z;initial=part.matrix_world.copy()
  radial=Vector((initial.translation.x,initial.translation.y,0))
  if radial.length<.1:radial=Vector((math.cos(index),math.sin(index),0))
  radial.normalize();tangent=Vector((-radial.y,radial.x,0))
  # A narrow rim can rock indefinitely on an uneven stone. Try nearby genuine
  # resting places; never freeze a pose that failed the same motion contract.
  for placement_attempt,offset in enumerate((Vector(),radial*.18,radial*.32+tangent*.12)):
   world.enabled=False;scene.frame_set(1);part.matrix_world=initial.copy();part.location+=offset
   peak=max(bounds(p)[1].z for p in settled);part.location.z=max(1.65,peak+.15)-base_low;bpy.context.view_layer.update();proxy=proxy_for(part,True)
   world.enabled=True;scene.frame_set(0);scene.frame_set(1);old=None;motion=rotation=math.inf;matrix=None
   for f in range(1,3602):
    scene.frame_set(f);bpy.context.view_layer.update();matrix=proxy.evaluated_get(bpy.context.evaluated_depsgraph_get()).matrix_world.copy()
    if f%120==1:
     if old is not None:
      motion=(matrix.translation-old.translation).length;rotation=matrix.to_quaternion().rotation_difference(old.to_quaternion()).angle
      if f>=361 and motion<.001 and rotation<math.radians(.25):break
     old=matrix.copy()
   if motion<.003 and rotation<math.radians(.5):break
   world.enabled=False;proxies.remove(proxy);bpy.data.objects.remove(proxy,do_unlink=True)
  assert motion<.003 and rotation<math.radians(.5),(part.name,'not settled',motion,math.degrees(rotation))
  world.enabled=False;part.matrix_world=matrix;proxy.rigid_body.type='PASSIVE';proxy.rigid_body.collision_shape='MESH';proxy.matrix_world=matrix;scene.frame_set(1);bpy.context.view_layer.update()
  record=contact(part,settled);record.update(frames=f,placement_attempt=placement_attempt,last_120_translation_m=motion,last_120_rotation_deg=math.degrees(rotation));contacts.append(record);settled.append(part)
  print(json.dumps({'index':index,'count':len(moving),**record}),flush=True)
 # Preserve the entire contact graph under one uniform placement transform.
 points=[v for p in parts for v in base.vertices(p)];lo=Vector(tuple(min(v[k]for v in points)for k in range(3)));hi=Vector(tuple(max(v[k]for v in points)for k in range(3)))
 uniform=min(1.,4.2/max(hi.x-lo.x,hi.y-lo.y))
 if hi.z*uniform>=1.6:uniform=min(uniform,1.55/hi.z)
 centre=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,0));placement=Matrix.Scale(uniform,4)@Matrix.Translation(-centre)
 for part in parts:
  part.matrix_world=placement@part.matrix_world
  assert signature[part.name]==([list(p.vertices)for p in part.data.polygons],[(float(u.uv.x),float(u.uv.y))for u in part.data.uv_layers.active.data])
 for proxy in proxies:bpy.data.objects.remove(proxy,do_unlink=True)
 bpy.data.objects.remove(floor,do_unlink=True);bpy.context.view_layer.update()
 lo=(lo-centre)*uniform;hi=(hi-centre)*uniform
 report={'id':name,'method':'Sequential stable placement of original rigid fragments onto the exact previously supported triangle surfaces; source topology/UV preserved; whole-assembly uniform footprint and height normalization','uniform_scale':uniform,'bounds':[list(lo),list(hi)],'dimensions':list(hi-lo),'support_graph':contacts,'maximum_gap_m':max(r['gap_m']for r in contacts)*uniform,'topology_uv_unchanged':True,'units':{'support_graph':'source-space metres and degrees before uniform assembly placement','maximum_gap_m':'final asset metres after uniform scale','bounds':'final Blender Z-up metres'}}
 (RUN/f'qa/{name}-settle.json').write_bytes((json.dumps(report,indent=2)+'\n').encode());print(json.dumps({k:v for k,v in report.items()if k!='support_graph'}))
 assert hi.z<1.6 and lo.z>=-.041 and hi.x-lo.x<=4.201 and hi.y-lo.y<=4.201
 assert report['maximum_gap_m']<.018,'Unsupported rendered fragment'
 select(parts[0])
 for part in parts:part.select_set(True)
 bpy.ops.object.join();obj=bpy.context.object;obj.name=name;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 raw=RUN/f'raw/{name}-settled.blend';bpy.ops.wm.save_as_mainfile(filepath=str(raw));out=RUN/f'candidate/{name}.glb';bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_texcoords=True,export_normals=True,export_materials='EXPORT');base.original.relink_images(out)
 report.update(source_sha256=hashlib.sha256(raw.read_bytes()).hexdigest(),candidate_sha256=hashlib.sha256(out.read_bytes()).hexdigest());(RUN/f'qa/{name}-settle.json').write_bytes((json.dumps(report,indent=2)+'\n').encode())

if __name__=='__main__':main(sys.argv[sys.argv.index('--')+1])
