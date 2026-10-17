"""Exact body/equipment triangle tests using actual Three sampled skin matrices."""
import json,sys,os
from pathlib import Path
import numpy as np
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
from commander_assembly_collision import exact_pairs
from all_models_collision_groups import collision_group
RUN=Path(os.environ['RTS_POSE_RUN']).resolve() if 'RTS_POSE_RUN' in os.environ else Path(__file__).resolve().parents[3]/'art-factory/rts/runs/all-models/2026-10-14-v1'

def main(unit):
 report=json.loads((RUN/f'qa/{unit}-runtime-poses.json').read_bytes());rows=[];failures=[]
 for lod in report['lods']:
  static=[]
  for m in lod['geometry']:
   p=np.array(m['positions']).reshape(-1,3);p=np.column_stack((p,np.ones(len(p))));p=p@np.array(m['bind']).reshape(4,4)
   static.append((p,np.array(m['indices']).reshape(-1,3),np.array(m['joints']).reshape(-1,4),np.array(m['weights']).reshape(-1,4)))
  for pose in lod['poses']:
   bodies=[];weapons={}
   for meta,raw,(p,faces,joints,weights) in zip(lod['geometry'],pose['meshes'],static):
    skin=np.array(raw['skin']).reshape(-1,4,4).transpose(0,2,1);out=np.einsum('vwab,vb,vw->va',skin[joints],p,weights)@np.array(raw['outer']).reshape(4,4);points=out[:,:3]
    item=(points,faces,meta)
    group=collision_group(meta['name'])
    if group=='body':bodies.append(item)
    elif group=='weapon':weapons.setdefault(meta['name'].split('/')[0],[]).append(item)
   def merged(items):
    pts=[];fs=[];offset=0
    for p,f,m in items:pts.append(p);fs.append(f+offset);offset+=len(p)
    p=np.concatenate(pts);f=np.concatenate(fs);return p,f,BVHTree.FromPolygons(p.tolist(),f.tolist(),all_triangles=True)
   bp,bf,bt=merged(bodies)
   for name,parts in weapons.items():
    wp,wf,wt=merged(parts);hits=exact_pairs(bp[bf],wp[wf],bt.overlap(wt));row={'lod':lod['lod'],'clip':pose['clip'],'fraction':pose['fraction'],'time':pose['time'],'weapon':name,'crossings':len(hits),'floor':float(wp[:,1].min())};rows.append(row)
    if len(hits):
     ids=set(bf[hits[:,0]].flatten());bounds=bp[list(ids)];failures.append({**row,'body_bounds':[bounds.min(axis=0).tolist(),bounds.max(axis=0).tolist()]})
 result={'unit':unit,'method':'Actual Three AnimationMixer SLERP skin matrices and exact triangle intersections','assets':[{k:r[k]for k in ('lod','file','sha256')}for r in report['lods']],'checks':len(rows),'max_crossings':max(r['crossings']for r in rows),'failures':failures,'rows':rows}
 (RUN/f'qa/{unit}-runtime-collision.json').write_bytes((json.dumps(result,indent=2)+'\n').encode());print(json.dumps({k:v for k,v in result.items()if k not in ('failures','rows')}));print(json.dumps(failures[:5]));assert not failures,'Equipment crosses body'
if __name__=='__main__':main(sys.argv[sys.argv.index('--')+1])
