"""Posed triangle/triangle crossings, BVH broad phase and exact edge tests."""
import bpy,json,sys,math
import numpy as np
from pathlib import Path
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
from commander_assembly_qa import ROOT,RUN,SOURCE

def evaluated(o):
    ev=o.evaluated_get(bpy.context.evaluated_depsgraph_get());m=ev.to_mesh();m.calc_loop_triangles()
    points=np.array([list(ev.matrix_world@v.co) for v in m.vertices]);faces=np.array([list(t.vertices) for t in m.loop_triangles],int)
    ev.to_mesh_clear();return points,faces,BVHTree.FromPolygons(points.tolist(),faces.tolist(),all_triangles=True)

def exact_pairs(a,b,pairs):
    if not pairs:return np.empty((0,2),int)
    indices=np.array(pairs);first=a[indices[:,0]];second=b[indices[:,1]];hit=np.zeros(len(indices),bool)
    for start,target in ((first,second),(second,first)):
        e1=target[:,1]-target[:,0];e2=target[:,2]-target[:,0]
        for edge in range(3):
            origin=start[:,edge];direction=start[:,(edge+1)%3]-origin;p=np.cross(direction,e2);det=np.einsum('ij,ij->i',e1,p);valid=abs(det)>1e-11
            inv=np.divide(1.,det,out=np.zeros_like(det),where=valid);d=origin-target[:,0];u=np.einsum('ij,ij->i',d,p)*inv;q=np.cross(d,e1);v=np.einsum('ij,ij->i',direction,q)*inv;t=np.einsum('ij,ij->i',e2,q)*inv
            hit|=valid&(u>1e-6)&(u<1-1e-6)&(v>1e-6)&(v<1-u-1e-6)&(t>1e-6)&(t<1-1e-6)
    return indices[hit]

def main():
    target=(Path(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else RUN/'raw/commander-assembly.blend').resolve()
    bpy.ops.wm.open_mainfile(filepath=str(target));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');rows=[];failures=[]
    for action in bpy.data.actions:
        rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
        for frame in np.linspace(*action.frame_range,101 if action.name=='Death' else 31):
            bpy.context.scene.frame_set(int(frame),subframe=float(frame%1))
            for lod in (0,1):
                body=bpy.data.objects[f'commanderOriginalBody_LOD{lod}'];bp,bf,bt=evaluated(body)
                for part in ('DawnShield','Longsword'):
                    wp,wf,wt=evaluated(bpy.data.objects[f'Commander{part}_LOD{lod}']);hits=exact_pairs(bp[bf],wp[wf],bt.overlap(wt))
                    row={'clip':action.name,'frame':float(frame),'lod':lod,'part':part,'floor_m':float(wp[:,2].min()),'strict_crossings':len(hits)};rows.append(row)
                    if len(hits):
                        bodyids=set(bf[hits[:,0]].flatten().tolist());groups={}
                        for i in bodyids:
                            for g in body.data.vertices[i].groups:groups[body.vertex_groups[g.group].name]=groups.get(body.vertex_groups[g.group].name,0)+g.weight
                        failures.append({**row,'body_groups':sorted(groups.items(),key=lambda x:-x[1])[:3],'body_bounds':[bp[list(bodyids)].min(axis=0).tolist(),bp[list(bodyids)].max(axis=0).tolist()]})
    report={'status':'failed' if failures else 'passed','pose_samples':len(rows)//2,'equipment_tests':len(rows),'source_sha256':__import__('hashlib').sha256(target.read_bytes()).hexdigest(),'max_crossings':max(r['strict_crossings'] for r in rows),'failures':failures,'rows':rows}
    path=RUN/'qa'/('collision-baseline-red.json' if target==SOURCE else 'collision.json');path.write_bytes((json.dumps(report,indent=2)+'\n').encode());print(json.dumps({k:v for k,v in report.items() if k not in ('rows','failures')}));print(json.dumps(failures[:8]));assert not failures,'Equipment crosses character surface'
if __name__=='__main__':main()
