"""Continue frozen original assembly; no runtime writes and no external art."""
import bpy,bmesh,json,sys,math,hashlib,struct,inspect,numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parent))
from original_guard_walk_refine import refine_walk,action_fcurves
from original_guard_walk_refine_math import solve_two_link
from original_guard_assembly_build import attach_mesh_to_rig,setup_camera,bake_knee_support_clip,bake_elbow_support_curves
from original_guard_walk_refine_build import export_lod
from original_guard_walk_refine_glb import transplant_walk
# Adapt the existing dense knee callback to Blender 5.2 layered Actions.
import original_guard_assembly_build as assembly
code=inspect.getsource(bake_knee_support_clip)
code=code.replace('for curve in list(action.fcurves):','for curve in list(action_fcurves(action)):')
code=code.replace('action.fcurves.remove(curve)','remove_curve(action, curve)')
code=code.replace('for curve in action.fcurves:', 'for curve in action_fcurves(action):')
def remove_curve(action, curve):
 for layer in action.layers:
  for strip in layer.strips:
   for bag in strip.channelbags:
    if any(fc==curve for fc in bag.fcurves):bag.fcurves.remove(curve);return
namespace=dict(vars(assembly),action_fcurves=action_fcurves,remove_curve=remove_curve)
exec(code,namespace);bake_knee_support_clip=namespace['bake_knee_support_clip']
def bake_supports(arm,scene,kind,clips):
 parts=('UpperArm','Forearm') if kind=='Elbow' else ('Thigh','Shin')
 for clip in clips:
  action=bpy.data.actions[clip];arm.animation_data.action=action
  for fc in list(action_fcurves(action)):
   if kind+'Support_' in fc.data_path:remove_curve(action,fc)
  hz=120 if kind=='Knee' and clip=='Walk' else 30;end=round(action.frame_range[1]);last={}
  for index in range(round(end*hz/30)+1):
   frame=index*30/hz;scene.frame_set(int(frame),subframe=frame%1)
   for side in ('L','R'):
    a,b=[arm.pose.bones[p+'_'+side] for p in parts];h=arm.pose.bones[kind+'Support_'+side]
    rest=a.bone.matrix_local.to_quaternion().slerp(b.bone.matrix_local.to_quaternion(),.5)
    posed=a.matrix.to_quaternion().slerp(b.matrix.to_quaternion(),.5)
    q=posed@rest.inverted()@h.bone.matrix_local.to_quaternion()
    pivot=((a.matrix@Vector((0,a.bone.length,0)))+b.head)*.5
    h.rotation_mode='QUATERNION';h.matrix=Matrix.LocRotScale(pivot,q,Vector((1,1,1)))
    if side in last and h.rotation_quaternion.dot(last[side])<0:h.rotation_quaternion.negate()
    last[side]=h.rotation_quaternion.copy()
    for prop in ('location','rotation_quaternion'):h.keyframe_insert(data_path=prop,frame=frame,group=h.name)
  for fc in action_fcurves(action):
   if kind+'Support_' in fc.data_path:
    for key in fc.keyframe_points:key.interpolation='LINEAR'
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-guard-assembly/revision-20261006'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
report={'status':'candidate','runtime_publish_allowed':False,'visual_approval':False,'changes':{},'limitations':[]}
source=RUN/'backup/original-guard-assembly.blend';library=RUN/'backup/original-guard-hands-library.blend'
report['sources']={str(p.relative_to(ROOT)):sha(p) for p in (source,library)}
bpy.ops.wm.open_mainfile(filepath=str(source));rig=bpy.data.objects['GuardRig20'];scene=bpy.context.scene
fits=json.loads((ROOT/'art-factory/rts/runs/original-guard-hands/2026-10-05/qa/hand-library.json').read_text())['fit_constraints']
for prefix,bone in (('KingdomSteelSword','Hand_R'),('KingdomSunShield','Forearm_L')):
 for lod in (0,1):
  obj=bpy.data.objects[f'{prefix}_LOD{lod}'];assert len(obj.vertex_groups)==1 and obj.vertex_groups[0].name==bone
  assert all(abs(obj.vertex_groups[0].weight(v.index)-1)<1e-5 for v in obj.data.vertices)
with bpy.data.libraries.load(str(library),link=False) as (src,dst):
 dst.objects=[f'GuardHandGrip_{s}_LOD{l}' for s in ('R','L') for l in (0,1)]
wrists={}
for side in ('R','L'):
 fit=fits[side]['lods']['LOD0'];center=Vector(fit['handle_center_world']);axis=Vector(fit['source_channel_axis_fit']).normalized();target=Vector(fit['target_handle_axis']).normalized()
 if axis.dot(target)<0:target=-target
 rotation=axis.rotation_difference(target)
 fore=Vector(fit['rest_forearm_axis']);cap=Vector(fit['required_wrist_world'])+fore*.015
 wrists[side]=center+rotation@(cap-center)-(rotation@fore)*.012
 report['changes'][side+'_grip']={'channel_axis_error_deg':math.degrees((rotation@axis).angle(target)),'arm_cuff_target':list(wrists[side]),'original_library_axis_error_deg':fit['channel_handle_axis_error_deg']}
 for obj in dst.objects:
  if f'_{side}_' not in obj.name:continue
  scene.collection.objects.link(obj)
  for v in obj.data.vertices:v.co=center+rotation@(v.co-center)
  attach_mesh_to_rig(obj,rig)
  obj.data.materials.clear();obj.data.materials.append(bpy.data.materials['GuardLeather_Surface'])
 # Shield must follow the same preserved transform as the left closed hand.
 if side=='L':
  for lod in (0,1):bpy.data.objects[f'KingdomSunShield_LOD{lod}'].vertex_groups['Forearm_L'].name='Hand_L'

# Capture all original poses before changing any arm curves. Keep original props' world motion.
plans={};reach=[]
for clip in ('Idle','Walk','Attack','Hurt','Death'):
 action=bpy.data.actions[clip];rig.animation_data.action=action;rows=[]
 for frame in range(round(action.frame_range[1])+1):
  scene.frame_set(frame);bpy.context.view_layer.update();row={}
  for side in ('R','L'):
   donor='Hand_R' if side=='R' else 'Forearm_L'
   skin=rig.pose.bones[donor].matrix@rig.data.bones[donor].matrix_local.inverted()
   endpoint=skin@wrists[side];upper=rig.pose.bones['UpperArm_'+side];fore=rig.pose.bones['Forearm_'+side]
   solved=solve_two_link(upper.head,endpoint,fore.head,rig.data.bones[upper.name].length,rig.data.bones[fore.name].length)
   elbow=Vector(solved['knee']);reach.append(solved['reach_margin'])
   for bone,head,tail in ((upper,upper.head.copy(),elbow),(fore,elbow,endpoint)):
    q=bone.matrix.to_3x3().col[1].normalized().rotation_difference((tail-head).normalized())@bone.matrix.to_quaternion()
    row[bone.name]=Matrix.LocRotScale(head,q,Vector((1,1,1)))
   row['Hand_'+side]=skin@rig.data.bones['Hand_'+side].matrix_local
  rows.append(row)
 plans[clip]=rows
changed={f'pose.bones["{p}_{s}"].{v}' for p in ('UpperArm','Forearm','Hand') for s in ('L','R') for v in ('location','rotation_quaternion')}
for clip,rows in plans.items():
 action=bpy.data.actions[clip];rig.animation_data.action=action
 for layer in action.layers:
  for strip in layer.strips:
   for bag in strip.channelbags:
    for fc in list(bag.fcurves):
     if fc.data_path in changed:bag.fcurves.remove(fc)
 last={}
 for frame,row in enumerate(rows):
  scene.frame_set(frame)
  for side in ('L','R'):
   for part in ('UpperArm','Forearm','Hand'):
    name=part+'_'+side;p=rig.pose.bones[name];p.rotation_mode='QUATERNION';p.matrix=row[name];bpy.context.view_layer.update()
    if name in last and p.rotation_quaternion.dot(last[name])<0:p.rotation_quaternion.negate()
    last[name]=p.rotation_quaternion.copy()
    for prop in ('location','rotation_quaternion'):p.keyframe_insert(data_path=prop,frame=frame,group=name)
 for fc in action_fcurves(action):
  if fc.data_path in changed:
   for key in fc.keyframe_points:key.interpolation='LINEAR'
max_prop_matrix_error=0.
for clip,rows in plans.items():
 rig.animation_data.action=bpy.data.actions[clip]
 for frame,row in enumerate(rows):
  scene.frame_set(frame);bpy.context.view_layer.update()
  for side in ('R','L'):
   actual=rig.pose.bones['Hand_'+side].matrix;expected=row['Hand_'+side]
   max_prop_matrix_error=max(max_prop_matrix_error,max(abs(actual[i][j]-expected[i][j]) for i in range(4) for j in range(4)))
assert max_prop_matrix_error<1e-4, max_prop_matrix_error
report['changes']['arm_ik']={'clips':list(plans),'minimum_reach_margin_m':min(reach),'prop_matrix_max_component_error':max_prop_matrix_error,'rigid_prop_binding_verified':True,'prop_world_motion':'preserved at authored 30Hz frames; left grip and shield share Hand_L skin; subframes not measured against original'}
bake_supports(rig,scene,'Elbow',plans)

# Fold sharp source shoulder remnants under the existing authored pauldrons.
for lod in (0,1):
 obj=bpy.data.objects[f'GuardBody_LOD{lod}'];count=0
 for v in obj.data.vertices:
  if .18<abs(v.co.x)<.38 and 1.39<v.co.z<1.64:
   v.co.z=1.39+(v.co.z-1.39)*.18;count+=1
 obj.data.update();report['changes'][f'shoulder_LOD{lod}']={'folded_source_vertices':count}
 # Narrow rear fauld panels remain pelvis-bound rather than stretching with lifted knees.
 for v in obj.data.vertices:
  if .33<v.co.z<.68 and v.co.y<-.045 and abs(v.co.x)>.17:
   for g in obj.vertex_groups:
    try:g.remove([v.index])
    except RuntimeError:pass
   obj.vertex_groups['Pelvis'].add([v.index],1,'REPLACE')

# Correct the inherited reversed knee blend: upper band follows thigh, lower follows shin.
for lod in (0,1):
 obj=bpy.data.objects[f'GuardPaddedLegLayer_LOD{lod}'];count=0
 for v in obj.data.vertices:
  if .36<v.co.z<.46 and abs(v.co.y)<=.12:
   side='L' if v.co.x<0 else 'R';t=(v.co.z-.36)/.10
   for g in obj.vertex_groups:g.remove([v.index])
   obj.vertex_groups['Thigh_'+side].add([v.index],t,'REPLACE')
   obj.vertex_groups['Shin_'+side].add([v.index],1-t,'REPLACE');count+=1
 report['changes'][f'knee_liner_LOD{lod}']={'corrected_vertices':count,'thigh_weight':'(z - .36) / .10'}
try:
 report['walk']=refine_walk(rig,[o for o in bpy.data.objects if o.type=='MESH' and o.name.endswith('LOD0')])
 bake_supports(rig,scene,'Knee',plans)
 report['knee']={'clips':list(plans),'Walk_sample_hz':120,'rest_orientation_offset_preserved':True}
except Exception as error:
 report['limitations'].append('Walk refinement failed: '+str(error))
 raise

# The revised source boots retain their authored geometry and corrected +Y orientation.
report['changes']['boots']='Reused separated, reoriented authored source boots; refined animation from actual sole vertices.'
# Recompute broad skin bounds in a single depsgraph sweep; include clip ends and midframes.
meshes=[o for o in bpy.data.objects if o.type=='MESH' and o.name.endswith(('LOD0','LOD1'))]
bounds={o.name:[Vector((float('inf'),)*3),Vector((-float('inf'),)*3)] for o in meshes}
parity=[]
for clip in ('Idle','Walk','Attack','Hurt','Death'):
 rig.animation_data.action=bpy.data.actions[clip];end=round(rig.animation_data.action.frame_range[1])
 for half in range(2*end+1):
  frame=half/2;scene.frame_set(int(frame),subframe=frame%1);dep=bpy.context.evaluated_depsgraph_get()
  snap={'clip':clip,'frame':frame,'objects':{}} if frame in (0,end/2,end) else None
  for obj in meshes:
   evaluated=obj.evaluated_get(dep);mesh=evaluated.to_mesh();lo,hi=bounds[obj.name]
   coords=np.empty(len(mesh.vertices)*3,dtype=np.float32);mesh.vertices.foreach_get('co',coords);coords=coords.reshape(-1,3)
   low=coords.min(axis=0);high=coords.max(axis=0)
   for a in range(3):lo[a]=min(lo[a],float(low[a]));hi[a]=max(hi[a],float(high[a]))
   if snap and (obj.name.startswith(('GuardHandGrip','GuardBoot','KingdomSteelSword','KingdomSunShield','GuardArms'))):
    # Extrema are invariant under exporter vertex splits and permit exact same-pose checks.
    pts=[evaluated.matrix_world@v.co for v in mesh.vertices]
    snap['objects'][obj.name]={'min':[min(p[a] for p in pts) for a in range(3)],'max':[max(p[a] for p in pts) for a in range(3)]}
   evaluated.to_mesh_clear()
  if snap:parity.append(snap)
for o in meshes:
 lo,hi=bounds[o.name];c=(lo+hi)*.5
 o['rtsConservativeBounds']={'sphere_center_y_up_m':[c.x,c.z,-c.y],'sphere_radius_m':(hi-lo).length*.5+.025,'sampling_margin_m':.025}
(RUN/'qa/blender-pose-extrema.json').write_text(json.dumps(parity))
rig.animation_data.action=bpy.data.actions['Idle'];scene.frame_set(0)
blend=RUN/'candidate/original-guard-assembly.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend))
report['exports']=[]
for lod in (0,1):
 standard=export_lod(RUN,rig,lod,True);donor=export_lod(RUN/'dense-donor',rig,lod,False)
 report.setdefault('walk_transplants',[]).append(transplant_walk(standard['path'],donor['path']))
 path=Path(standard['path']);standard['sha256']=sha(path);standard['bytes']=path.stat().st_size
 data=path.read_bytes();size=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+size])
 standard['clips']=[a['name'] for a in doc.get('animations',[])];assert set(standard['clips'])=={'Idle','Walk','Attack','Hurt','Death'}
 standard['mesh_count']=len(doc['meshes']);standard['skins']=len(doc['skins']);report['exports'].append(standard)
report['blend']={'path':str(blend),'sha256':sha(blend)}
(RUN/'qa/build.json').write_text(json.dumps(report,indent=2))
for obj in meshes:obj.hide_render=not obj.name.endswith('LOD0');obj.hide_set(False)
for clip,frame,view,label,center,scale in (
 ('Idle',0,'front','front',(0,0,.92),2.18),('Attack',16,'threequarter','attack',(0,0,.95),2.6),
 ('Walk',6,'front','walk',(0,0,.92),2.18),('Idle',0,'back','back',(0,0,.92),2.18),
 ('Idle',0,'threequarter','sword-grip',(.45,.07,.87),.62),('Idle',0,'back','shield-grip',(-.45,.05,1.02),.75)):
 rig.animation_data.action=bpy.data.actions[clip];scene.frame_set(frame);setup_camera(view,Vector(center),RUN)
 scene.camera.data.ortho_scale=scale;scene.render.resolution_x=640;scene.render.resolution_y=720
 scene.render.filepath=str(RUN/'qa'/f'{label}.png');bpy.ops.render.render(write_still=True)
print('REVISION_READY',json.dumps({'blend':report['blend'],'exports':report['exports'],'limitations':report['limitations']}))
