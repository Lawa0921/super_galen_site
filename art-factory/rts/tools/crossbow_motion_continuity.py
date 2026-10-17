"""Reject elbow/wrist snaps in the exported clips, measured relative to Root."""
import bpy,json,hashlib,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from crossbow_glb_acceptance_blender import set_action
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/all-models/2026-10-14-v1'
rows=[];failures=[];assets=[]
packing=json.loads((RUN/'qa/crossbow-externalization.json').read_bytes())
for lod in (0,1):
 path=RUN/f'candidate/crossbow{"-lod1"if lod else""}.glb'
 embedded=ROOT/f'art-factory/rts/runs/all-models/2026-10-14-crossbow/final/raw/crossbow-edited-lod{lod}.glb'
 proof=next(row for row in packing if row['lod']==lod)
 assert proof['lossless_verified'] and proof['sha256']==hashlib.sha256(path.read_bytes()).hexdigest() and proof['embedded_sha256']==hashlib.sha256(embedded.read_bytes()).hexdigest()
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(embedded))
 rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');scene=bpy.context.scene
 assets.append({'lod':lod,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
 for clip in ('Attack','Death','Hurt','Idle','Walk'):
  set_action(rig,clip);start,end=bpy.data.actions[clip].frame_range;previous=None;highest={'speed_m_s':0}
  for index in range(201):
   frame=start+(end-start)*index/200;scene.frame_set(int(frame),subframe=frame%1);bpy.context.view_layer.update()
   inverse=(rig.matrix_world@rig.pose.bones['Root'].matrix).inverted()
   current={name:inverse@rig.matrix_world@rig.pose.bones[name].head for name in ('Forearm_L','Forearm_R','Hand_L','Hand_R')}
   if previous:
    dt=(end-start)/200/(scene.render.fps/scene.render.fps_base)
    for name,point in current.items():
     speed=(point-previous[name]).length/dt
     if speed>highest['speed_m_s']:highest={'speed_m_s':speed,'bone':name,'frame':frame}
   previous=current
  row={'lod':lod,'clip':clip,**highest};rows.append(row)
  if highest['speed_m_s']>4:failures.append(row)
result={'status':'failed'if failures else'passed','assets':assets,'samples_per_clip':201,'root_relative_elbow_wrist_speed_limit_m_s':4,'rows':rows,'failures':failures}
(RUN/'qa/crossbow-motion-continuity.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8');print(json.dumps(result));assert not failures
