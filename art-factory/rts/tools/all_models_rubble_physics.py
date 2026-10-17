"""Rejected simultaneous-debris physics prototype; diagnostic use only.

Approved candidates use all_models_rubble_settle.py and independent visual QA.
"""
import bpy,json,sys,hashlib,math
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
import all_models_rubble as base
ROOT=base.ROOT;RUN=base.RUN

def bounds(obj,matrix=None):
 m=matrix if matrix is not None else obj.matrix_world;v=[m@p.co for p in obj.data.vertices]
 return Vector(tuple(min(p[k]for p in v)for k in range(3))),Vector(tuple(max(p[k]for p in v)for k in range(3)))
def select(obj):
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj

def main(name):
 source=ROOT/f'art-factory/rts/runs/building-rubble/2026-10-09-v1/raw/{name}.blend';bpy.ops.wm.open_mainfile(filepath=str(source));parts=base.components(next(o for o in bpy.data.objects if o.type=='MESH'));scene=bpy.context.scene;scene.render.fps=60;scene.frame_set(1);proxies=[];active=[];signature={}
 for part in parts:
  signature[part.name]={'faces':[list(p.vertices)for p in part.data.polygons],'uv':[(float(u.uv.x),float(u.uv.y))for u in part.data.uv_layers.active.data]}
  select(part);bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY',center='BOUNDS');bpy.context.view_layer.update();lo,hi=bounds(part)
  anchor=(len(part.data.polygons)>100 and any(m.name.startswith('Courtyard')for m in part.data.materials if m))or(hi.z-lo.z>.65 and lo.z<.005)
  proxy=part.copy();proxy.data=part.data.copy();proxy.animation_data_clear();proxy.name='Physics_'+part.name;scene.collection.objects.link(proxy);select(proxy);bpy.ops.rigidbody.object_add();scene.rigidbody_world.enabled=False;rb=proxy.rigid_body;rb.type='PASSIVE'if anchor else 'ACTIVE';rb.collision_shape='CONVEX_HULL';rb.use_margin=True;rb.collision_margin=.0015;rb.friction=.9;rb.restitution=0
  proxies.append((part,proxy))
  if not anchor:
   rb.mass=max(.05,(hi.x-lo.x)*(hi.y-lo.y)*(hi.z-lo.z)*100);rb.linear_damping=.8;rb.angular_damping=.95;rb.use_deactivation=True;rb.deactivate_linear_velocity=.005;rb.deactivate_angular_velocity=.01;rb.kinematic=True
   active.append((part,proxy,lo,hi))
 # Closed floor box prevents open one-sided planes losing fast contacts.
 bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,-.2));floor=bpy.context.object;floor.scale=(6,6,.4);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);bpy.ops.rigidbody.object_add();floor.rigid_body.type='PASSIVE';floor.rigid_body.collision_shape='BOX';floor.rigid_body.use_margin=True;floor.rigid_body.collision_margin=.001
 world=scene.rigidbody_world;world.substeps_per_frame=8;world.solver_iterations=40
 # Heavy/broad fragments establish the base; roof slates land last.
 active.sort(key=lambda row:-(row[3].x-row[2].x)*(row[3].y-row[2].y)*(row[3].z-row[2].z))
 cursor=4.0;release_interval=48;last_release=20+(len(active)-1)*release_interval;end=last_release+2400;world.point_cache.frame_end=end;scene.frame_end=end
 for i,(part,proxy,lo,hi)in enumerate(active):
  release=20+i*release_interval;base_low=lo.z-part.location.z
  proxy.location.z=cursor-base_low;cursor+=(hi.z-lo.z)+.10
  proxy.rigid_body.kinematic=True;proxy.keyframe_insert('location',frame=1);proxy.rigid_body.keyframe_insert('kinematic',frame=1)
  # Pre-plan each low drop. Holding still prevents a teleport velocity at release.
  # Every previously settled fragment must remain below the 1.6 m asset ceiling.
  # Starting above it avoids a kinematic incoming proxy intersecting the pile.
  proxy.location.z=1.65-base_low
  proxy.keyframe_insert('location',frame=release-4);proxy.keyframe_insert('location',frame=release-1)
  proxy.rigid_body.keyframe_insert('kinematic',frame=release-1);proxy.rigid_body.kinematic=False;proxy.rigid_body.keyframe_insert('kinematic',frame=release)
 for proxy in [p for _,p,_,_ in active]:
  action=proxy.animation_data.action
  for layer in action.layers:
   for strip in layer.strips:
    for slot in action.slots:
     bag=strip.channelbag(slot)
     if bag:
      for curve in bag.fcurves:
       for point in curve.keyframe_points:point.interpolation='CONSTANT'
 stability={};world.enabled=True;scene.frame_set(0);scene.frame_set(1)
 # No scene mutations or key insertion after the physics cache begins advancing.
 for f in range(1,end+1):
  scene.frame_set(f);bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
  if f in (end-120,end):stability[f]={p.name:p.evaluated_get(deps).matrix_world.copy()for _,p,_,_ in active}
 deps=bpy.context.evaluated_depsgraph_get();matrices={part.name:proxy.evaluated_get(deps).matrix_world.copy()for part,proxy in proxies}
 motion=max((stability[end][k].translation-stability[end-120][k].translation).length for k in stability[end]);rotation=max(stability[end][k].to_quaternion().rotation_difference(stability[end-120][k].to_quaternion()).angle for k in stability[end])
 for _,proxy in proxies:bpy.data.objects.remove(proxy,do_unlink=True)
 bpy.data.objects.remove(floor,do_unlink=True);scene.frame_set(1)
 for part in parts:
  part.matrix_world=matrices[part.name];assert signature[part.name]['faces']==[list(p.vertices)for p in part.data.polygons];assert signature[part.name]['uv']==[(float(u.uv.x),float(u.uv.y))for u in part.data.uv_layers.active.data]
 bpy.context.view_layer.update();allpoints=[p for o in parts for p in base.vertices(o)];lo=Vector(tuple(min(p[k]for p in allpoints)for k in range(3)));hi=Vector(tuple(max(p[k]for p in allpoints)for k in range(3)))
 unscaled_bounds=[list(lo),list(hi)];uniform_scale=min(1.,4.20/max(hi.x-lo.x,hi.y-lo.y))
 # One uniform assembly transform retains every settled contact and UV, while
 # keeping the runtime footprint within its existing collision/art contract.
 for part in parts:part.matrix_world=Matrix.Scale(uniform_scale,4)@part.matrix_world
 bpy.context.view_layer.update();lo*=uniform_scale;hi*=uniform_scale
 support=base.support(parts)
 report={'id':name,'method':'Original fragments with closed convex collision proxies; nonoverlapping staging, preplanned hold and 48-frame incremental release above the 1.6m pile ceiling; natural settling without side boundaries, then uniform whole-assembly footprint normalization','simulation_frames':end,'fps':60,'unscaled_bounds':unscaled_bounds,'uniform_scale':uniform_scale,'bounds':[list(lo),list(hi)],'dimensions':list(hi-lo),'final_120_frame_translation_m':motion,'final_120_frame_rotation_deg':math.degrees(rotation),'topology_uv_unchanged':True,'support':support,'maximum_surface_gap_m':max(r['gap_m']for r in support)}
 print(json.dumps(report));(RUN/f'qa/{name}-physics.json').write_bytes((json.dumps(report,indent=2)+'\n').encode())
 assert hi.z<1.6 and hi.x-lo.x<4.24 and hi.y-lo.y<4.24 and lo.z>=-.041,(name,'invalid bounds',report)
 assert motion<.003 and rotation<math.radians(.5),(name,'not settled')
 assert report['maximum_surface_gap_m']<.018,(name,'unsupported rendered fragment')
 select(parts[0])
 for part in parts:part.select_set(True)
 bpy.ops.object.join();obj=bpy.context.object;obj.name=name;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 raw=RUN/f'raw/{name}-settled.blend';bpy.ops.wm.save_as_mainfile(filepath=str(raw));out=RUN/f'candidate/{name}.glb';bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_texcoords=True,export_normals=True,export_materials='EXPORT');base.original.relink_images(out)
 report.update(source_sha256=hashlib.sha256(raw.read_bytes()).hexdigest(),candidate_sha256=hashlib.sha256(out.read_bytes()).hexdigest());(RUN/f'qa/{name}-physics.json').write_bytes((json.dumps(report,indent=2)+'\n').encode())
if __name__=='__main__':main(sys.argv[sys.argv.index('--')+1])
