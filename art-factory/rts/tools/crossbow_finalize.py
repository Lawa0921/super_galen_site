"""Complete carry animation, ground contact and distance mesh on the approved source geometry."""
import sys,os,json,hashlib,math
from pathlib import Path
import bpy
from mathutils import Quaternion,Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from crossbow_rig_rebuild_blender import CLIPS,set_action,select_lod,evaluated_points
from crossbow_death import author_death
BASE=Path('art-factory/rts/runs/all-models/2026-10-14-crossbow')
SOURCE=BASE/'qa/probes/carry-refine-v1/crossbow-assembly.blend'
RUN=BASE/'final'
def tris(obj):
 obj.data.calc_loop_triangles();return len(obj.data.loop_triangles)
def budget(objects):
 low=[o for o in objects if o.name.endswith('LOD1')];total=sum(map(tris,low))
 body=bpy.data.objects['crossbowOriginalBody_LOD1'];before=tris(body)
 if total<=9900:return {'before':total,'after':total}
 fixed=[];eligible=[]
 for v in body.data.vertices:
  protect=any(w.weight>.01 and body.vertex_groups[w.group].name.startswith(('Hand_','Forearm_','UpperArm_','Foot_'))for w in v.groups)
  (fixed if protect else eligible).append(v.index)
 protected={tuple(round(float(x),6)for x in body.data.vertices[i].co)for i in fixed}
 group=body.vertex_groups.new(name='DistanceBodyReduction');group.add(eligible,1,'REPLACE')
 modifier=body.modifiers.new('DistanceBodyBudget','DECIMATE');modifier.ratio=(before-(total-9900))/before
 modifier.vertex_group=group.name;modifier.vertex_group_factor=1;modifier.use_collapse_triangulate=True
 body.modifiers.move(len(body.modifiers)-1,0);bpy.context.view_layer.objects.active=body;bpy.ops.object.modifier_apply(modifier=modifier.name)
 body.vertex_groups.remove(body.vertex_groups['DistanceBodyReduction'])
 remaining={tuple(round(float(x),6)for x in v.co)for v in body.data.vertices}
 assert protected<=remaining,'Protected arm/hand/foot coordinate lost'
 final=sum(map(tris,low));assert final<=10000
 return {'before':total,'after':final,'body_before':before,'body_after':tris(body),'protected_coordinates':len(protected)}
def main():
 bpy.ops.wm.open_mainfile(filepath=str(SOURCE.resolve()))
 rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');objects=[o for o in bpy.data.objects if o.type=='MESH']
 reduction=budget(objects);death=author_death(rig);scene=bpy.context.scene;floor=[];bounds={o.name:[Vector((1e6,1e6,1e6)),Vector((-1e6,-1e6,-1e6))]for o in objects}
 for clip in CLIPS:
  set_action(rig,clip);action=bpy.data.actions[clip];start,end=map(int,action.frame_range)
  for frame in range(start,end+1):
   scene.frame_set(frame);bpy.context.view_layer.update();root=rig.pose.bones['Root']
   if clip=='Attack':
    t=(frame-start)/(end-start);raise_aim=math.sin(math.pi*min(1,max(0,t/.7)))**2 if t<.7 else 0
    recoil=math.exp(-((t-.4)/.07)**2)
    spine=rig.pose.bones['SpineUpper'];spine.rotation_quaternion=spine.rotation_quaternion@Quaternion((1,0,0),math.radians(8*raise_aim-3*recoil));spine.keyframe_insert('rotation_quaternion',frame=frame)
   bpy.context.view_layer.update()
   minimum=min(float(evaluated_points(o)[:,2].min())for o in objects)
   matrix=root.matrix.copy();matrix.translation+=rig.matrix_world.inverted().to_3x3()@Vector((0,0,.003-minimum));root.matrix=matrix
   root.keyframe_insert('location',frame=frame);bpy.context.view_layer.update()
   values={o.name:evaluated_points(o)for o in objects};actual=min(float(v[:,2].min())for v in values.values())
   floor.append({'clip':clip,'frame':frame,'before':minimum,'after':actual})
   for name,points in values.items():
    for k in range(3):bounds[name][0][k]=min(bounds[name][0][k],float(points[:,k].min()));bounds[name][1][k]=max(bounds[name][1][k],float(points[:,k].max()))
  for layer in action.layers:
   for strip in layer.strips:
    for slot in action.slots:
     bag=strip.channelbag(slot)
     if bag:
      for curve in bag.fcurves:
       for key in curve.keyframe_points:key.interpolation='LINEAR'
 for obj in objects:
  lo,hi=bounds[obj.name];center=(lo+hi)*.5
  obj['rtsConservativeBounds']={'sphere_center_y_up_m':[center.x,center.z,-center.y],'sphere_radius_m':(hi-lo).length*.5+.03,'sampling_margin_m':.03}
 set_action(rig,'Idle');scene.frame_set(0);RUN.mkdir(parents=True,exist_ok=True)
 out=RUN/'raw/crossbow-assembly.blend';out.parent.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(out.resolve()))
 outputs=[]
 for lod in (0,1):
  select_lod(rig,lod);bpy.context.view_layer.objects.active=rig;path=RUN/f'raw/crossbow-edited-lod{lod}.glb'
  bpy.ops.export_scene.gltf(filepath=str(path.resolve()),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_nla_strips=False,export_force_sampling=True,export_optimize_animation_size=False,export_skins=True,export_extras=True,export_yup=True,export_tangents=True)
  outputs.append({'lod':lod,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'triangles':sum(tris(o)for o in objects if o.name.endswith(f'LOD{lod}'))})
 report={'source':str(SOURCE),'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'repaired_source':str(out),'source_sha256_final':hashlib.sha256(out.read_bytes()).hexdigest(),'distance_budget':reduction,'floor':floor,'death':death,'outputs':outputs,'animation':'Two-hand carry; authored torso/legs; aim/recoil; backward grounded fall with support release and side-settled crossbow'}
 qa=RUN/'qa';qa.mkdir(exist_ok=True);(qa/'crossbow-finalize.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps({k:v for k,v in report.items()if k!='floor'}))
if __name__=='__main__':main()
