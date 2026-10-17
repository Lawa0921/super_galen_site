"""Use exact triangle intersections on actual posed body and held equipment."""
import argparse,json,sys
from pathlib import Path
import bpy,numpy as np
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from commander_assembly_collision import evaluated,exact_pairs
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--report',type=Path,required=True);p.add_argument('--clip');p.add_argument('--samples-per-frame',type=int)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');rows=[];failures=[]
for action in bpy.data.actions:
 if a.clip and action.name!=a.clip:continue
 g.set_action(rig,action.name)
 count=1+int(action.frame_range[1]-action.frame_range[0])*a.samples_per_frame if a.samples_per_frame else 31
 for frame in np.linspace(*action.frame_range,count):
  bpy.context.scene.frame_set(int(frame),subframe=float(frame%1))
  for lod in (0,1):
   bodies=[o for o in bpy.data.objects if o.type=='MESH' and any(prefix in o.name for prefix in ('OriginalBody','GuardBody','GuardRigidPlate')) and o.name.endswith(f'_LOD{lod}')]
   weapons=[o for o in bpy.data.objects if o.type=='MESH' and o.name.endswith(f'_LOD{lod}') and any(x in o.name for x in ('Axe','Sword','Shield','Staff','ProceduralCrossbow'))]
   assert bodies and weapons,'Expected real body and equipment meshes'
   weapon_data={o.name:evaluated(o) for o in weapons}
   for body in bodies:
    bp,bf,bt=evaluated(body)
    for weapon in weapons:
     wp,wf,wt=weapon_data[weapon.name];hits=exact_pairs(bp[bf],wp[wf],bt.overlap(wt));row={'clip':action.name,'frame':float(frame),'lod':lod,'body':body.name,'weapon':weapon.name,'crossings':len(hits)};rows.append(row)
     if len(hits):
      ids=set(bf[hits[:,0]].flatten().tolist());groups={}
      for i in ids:
       for weight in body.data.vertices[i].groups:groups[body.vertex_groups[weight.group].name]=groups.get(body.vertex_groups[weight.group].name,0)+weight.weight
      failures.append({**row,'body_regions':sorted(groups.items(),key=lambda x:-x[1])[:3],'bounds':[bp[list(ids)].min(axis=0).tolist(),bp[list(ids)].max(axis=0).tolist()]})
report={'source':str(a.source),'checks':len(rows),'max_crossings':max((r['crossings'] for r in rows),default=0),'failures':failures,'rows':rows,'artistic_quality_proven':False}
a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_bytes((json.dumps(report,indent=2)+'\n').encode());print(json.dumps({k:v for k,v in report.items() if k not in ('failures','rows')}))
if failures:raise AssertionError('Actual held equipment crosses the body surface')
