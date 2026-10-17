"""Whole-clip closed-grip and cuff contact acceptance on editable sources."""
import bpy,json,sys,math,hashlib
import numpy as np
from pathlib import Path
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
from all_models_units import RUN
import procedural_gauntlet_build as g
from commander_assembly_qa import posed
from commander_assembly_collision import evaluated,exact_pairs

def main(unit):
 source=RUN/f'raw/{unit}-assembly.blend';bpy.ops.wm.open_mainfile(filepath=str(source));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');build=json.loads((RUN/f'qa/{unit}-build.json').read_bytes());hands=[]
 for record in build['hands']:
  hand=bpy.data.objects[record['name']];names=json.loads(hand['original_gauntlet_parts']);adj=[set()for v in hand.data.vertices]
  for e in hand.data.edges:a,b=e.vertices;adj[a].add(b);adj[b].add(a)
  seen=set();components=[]
  for i in range(len(adj)):
   if i in seen:continue
   todo=[i];found=set()
   while todo:
    v=todo.pop()
    if v in found:continue
    found.add(v);todo.extend(adj[v]-found)
   seen|=found;components.append(found)
  assert len(components)==len(names),(hand.name,'part topology',len(components),len(names))
  cuff=components[names.index('cuff')];hand.data.calc_loop_triangles();faces=np.array([list(t.vertices)for t in hand.data.loop_triangles if all(i in cuff for i in t.vertices)])
  weapon_name={'worker':'WorkerCraftAxe','guard':'KingdomSunShield'if record['side']=='L'else 'KingdomSteelSword','priest':'PriestDawnStaff','neutral-raider':'RaiderShortAxe'}[unit]+f'_LOD{record["lod"]}'
  weapon=bpy.data.objects[weapon_name];ids={i for p in weapon.data.polygons if 'leather'in weapon.data.materials[p.material_index].name.lower()for i in p.vertices}
  hands.append((record,hand,weapon,ids,faces))
 rows=[];failures=[]
 for action in bpy.data.actions:
  g.set_action(rig,action.name)
  for frame in np.linspace(*action.frame_range,31):
   bpy.context.scene.frame_set(int(frame),subframe=float(frame%1))
   for record,hand,weapon,ids,faces in hands:
    hp=posed(hand);wp,wf,wt=evaluated(weapon);shaft=wp[list(ids)];center=shaft.mean(axis=0);_,_,axes=np.linalg.svd(shaft-center);axis=axes[0]
    radial=shaft-center-np.outer((shaft-center)@axis,axis);radius=float(np.percentile(np.linalg.norm(radial,axis=1),80))
    d=hp-center;along=d@axis;radial=d-np.outer(along,axis);dist=np.linalg.norm(radial,axis=1);near=(abs(along)<.045)&(dist>radius*.8)&(dist<radius+.026)
    gap=float(dist[near].min()-radius)if near.any()else math.inf
    trial=np.array([1.,0,0])if abs(axis[0])<.9 else np.array([0.,1,0]);u=np.cross(axis,trial);u/=np.linalg.norm(u);v=np.cross(axis,u);angles=np.arctan2(radial[near]@v,radial[near]@u);sectors=len(set(np.floor((angles+math.pi)/math.tau*16).astype(int)%16))
    ct=BVHTree.FromPolygons(hp.tolist(),faces.tolist(),all_triangles=True);hits=len(exact_pairs(hp[faces],wp[wf],ct.overlap(wt)))
    row={'clip':action.name,'frame':float(frame),'lod':record['lod'],'side':record['side'],'gap_m':gap,'wrap_sectors':sectors,'cuff_weapon_crossings':hits};rows.append(row)
    if not(-.006<=gap<=.008 and sectors>=12)or hits:failures.append(row)
 report={'unit':unit,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'method':'Closed finger wrap, grip gap and strict cuff/equipment intersections; source poses','checks':len(rows),'failures':failures,'rows':rows};(RUN/f'qa/{unit}-hand-contact.json').write_bytes((json.dumps(report,indent=2)+'\n').encode());print(json.dumps({'unit':unit,'checks':len(rows),'failures':len(failures),'first_failures':failures[:4]}));assert not failures
if __name__=='__main__':main(sys.argv[sys.argv.index('--')+1])
