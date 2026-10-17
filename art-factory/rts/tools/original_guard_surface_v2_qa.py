import bpy,bmesh,json,math,hashlib,sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-guard-assembly/continuation-20261006-2/surface'
bpy.ops.wm.open_mainfile(filepath=str(RUN/'candidate/original-guard-assembly.blend'))
rig=bpy.data.objects['GuardRig20'];scene=bpy.context.scene
meshes=[o for o in bpy.data.objects if o.type=='MESH' and o.name.endswith(('LOD0','LOD1'))]
def rig_record():
 return {b.name:{'parent':b.parent.name if b.parent else None,'matrix':[list(r) for r in b.matrix_local],'head':list(b.head_local),'tail':list(b.tail_local)} for b in bpy.data.objects['GuardRig20'].data.bones}
def mesh_signature(o):
 return hashlib.sha256(json.dumps({'vertices':[list(v.co) for v in o.data.vertices],'faces':[list(p.vertices) for p in o.data.polygons],'weights':[[[o.vertex_groups[g.group].name,g.weight] for g in v.groups] for v in o.data.vertices]},sort_keys=True).encode()).hexdigest()
preserved_names=['GuardHandGrip_L_LOD0','GuardHandGrip_R_LOD0','KingdomSteelSword_LOD0','KingdomSunShield_LOD0']
candidate_rig=rig_record();candidate_sigs={n:mesh_signature(bpy.data.objects[n]) for n in preserved_names};candidate_motion=scene['rtsMotion'].to_dict()
rows=[];issues=[];counts={};collisions=[];bounds={o.name:[Vector((float('inf'),)*3),Vector((-float('inf'),)*3)] for o in meshes}
for clip in ('Idle','Walk','Attack','Hurt','Death'):
 rig.animation_data.action=bpy.data.actions[clip];end=rig.animation_data.action.frame_range[1]
 frames=sorted(set([0,end*.125,end*.25,end*.375,end*.5,end*.625,end*.75,end*.875,end,max(0,end/2-.5),min(end,end/2+.5)]))
 counts[clip]=len(frames)
 for f in frames:
  scene.frame_set(int(f),subframe=f%1);dep=bpy.context.evaluated_depsgraph_get();row={'clip':clip,'frame':f,'objects':{}};trees={}
  for o in meshes:
   ev=o.evaluated_get(dep);m=ev.to_mesh();pts=[ev.matrix_world@v.co for v in m.vertices]
   lo=[min(v[a] for v in pts) for a in range(3)];hi=[max(v[a] for v in pts) for a in range(3)]
   if not all(math.isfinite(v) for v in lo+hi):issues.append([clip,f,o.name,'nonfinite'])
   if max(hi[a]-lo[a] for a in range(3))>3:issues.append([clip,f,o.name,'exploded'])
   row['objects'][o.name]={'min':lo,'max':hi}
   if o.name.startswith(('GuardTasset','GuardFauld','GuardLegArmor_knee_cap')):trees[o.name]=BVHTree.FromPolygons(pts,[list(p.vertices) for p in m.polygons])
   for a in range(3):bounds[o.name][0][a]=min(bounds[o.name][0][a],lo[a]);bounds[o.name][1][a]=max(bounds[o.name][1][a],hi[a])
   ev.to_mesh_clear()
  for lod in (0,1):
   for side in ('L','R'):
    knee=f'GuardLegArmor_knee_cap_{side}_LOD{lod}'
    for panel in (f'GuardTasset_{side}_LOD{lod}',f'GuardFauld_LOD{lod}'):
     hits=trees[knee].overlap(trees[panel])
     if hits:collisions.append({'clip':clip,'frame':f,'panel':panel,'knee':knee,'overlapping_triangle_pairs':len(hits)})
  rows.append(row)
(RUN/'qa/blender-pose-extrema.json').write_text(json.dumps(rows))
report={'status':'pass' if not issues else 'fail','runtime_publish_allowed':False,'method':'Actual evaluated skinned vertices, 11 points per action including fractional frames; finite/bounds regression, not comprehensive triangle collision proof','sample_counts':counts,'object_samples':sum(len(r['objects']) for r in rows),'issues':issues,'scene_motion':scene['rtsMotion'].to_dict(),'bounds':{k:[list(v[0]),list(v[1])] for k,v in bounds.items()}}
report['knee_fauld_collision_samples']=len(rows)*8;report['knee_fauld_collisions']=collisions
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art-factory/rts/runs/original-guard-assembly/revision-20261006/candidate/original-guard-assembly.blend'))
report['rest_hierarchy_exact']=rig_record()==candidate_rig
report['root_motion_exact']=bpy.context.scene['rtsMotion'].to_dict()==candidate_motion
report['preserved_lod0_geometry_weights_exact']={n:mesh_signature(bpy.data.objects[n])==sig for n,sig in candidate_sigs.items()}
assert report['rest_hierarchy_exact'] and report['root_motion_exact'] and all(report['preserved_lod0_geometry_weights_exact'].values())
(RUN/'qa/dynamic-skin.json').write_text(json.dumps(report,indent=2))
print('DYNAMIC_SKIN',json.dumps({k:report[k] for k in ('status','sample_counts','object_samples','issues')}))
