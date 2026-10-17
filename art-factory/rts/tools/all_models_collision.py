"""Strict posed body/equipment triangle crossings for the repaired assemblies."""
import bpy,json,sys
import numpy as np
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from all_models_units import RUN
from commander_assembly_collision import evaluated,exact_pairs
def main(unit):
 bpy.ops.wm.open_mainfile(filepath=str(RUN/f'raw/{unit}-assembly.blend'));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');rows=[];failures=[]
 for action in bpy.data.actions:
  g.set_action(rig,action.name)
  for frame in np.linspace(*action.frame_range,31):
   bpy.context.scene.frame_set(int(frame),subframe=float(frame%1))
   for lod in (0,1):
    body=bpy.data.objects[('GuardBody' if unit=='guard' else unit+'OriginalBody')+f'_LOD{lod}'];bp,bf,bt=evaluated(body)
    for weapon in [o for o in bpy.data.objects if o.type=='MESH' and o.name.endswith(f'LOD{lod}') and any(x in o.name for x in ('Axe','Sword','Shield','Staff','ProceduralCrossbow'))]:
     wp,wf,wt=evaluated(weapon);hits=exact_pairs(bp[bf],wp[wf],bt.overlap(wt));row={'clip':action.name,'frame':float(frame),'lod':lod,'weapon':weapon.name,'floor':float(wp[:,2].min()),'crossings':len(hits)};rows.append(row)
     if len(hits):
      ids=set(bf[hits[:,0]].flatten().tolist());groups={}
      for i in ids:
       for q in body.data.vertices[i].groups:groups[body.vertex_groups[q.group].name]=groups.get(body.vertex_groups[q.group].name,0)+q.weight
      failures.append({**row,'groups':sorted(groups.items(),key=lambda x:-x[1])[:3],'bounds':[bp[list(ids)].min(axis=0).tolist(),bp[list(ids)].max(axis=0).tolist()]})
 report={'unit':unit,'checks':len(rows),'max_crossings':max(r['crossings']for r in rows),'failures':failures,'rows':rows};(RUN/f'qa/{unit}-collision.json').write_bytes((json.dumps(report,indent=2)+'\n').encode());print(json.dumps({k:v for k,v in report.items()if k not in ('failures','rows')}));print(json.dumps(failures[:12]));assert not failures,'Equipment crosses body'
if __name__=='__main__':main(sys.argv[sys.argv.index('--')+1])
