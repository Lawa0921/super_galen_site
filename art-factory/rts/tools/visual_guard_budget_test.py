"""Verify far/near caps, retained armor surfaces and protected body coordinates."""
import argparse,json,sys
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from commander_assembly_collision import exact_pairs

def snapshot():
    rows={}
    for obj in bpy.data.objects:
        if obj.type!='MESH':continue
        obj.data.calc_loop_triangles()
        vertices=[v.co.copy() for v in obj.data.vertices];faces=[tuple(p.vertices) for p in obj.data.loop_triangles]
        protected=[tuple(v.co) for v in obj.data.vertices if obj.name=='GuardBody_LOD1' and any(w.weight>.01 and obj.vertex_groups[w.group].name.startswith(('Hand_','Forearm_','UpperArm_','Foot_')) for w in v.groups)]
        rows[obj.name]={'vertices':vertices,'faces':faces,'protected':protected,'tris':g.tri_count(obj)}
    return rows

def distance(source,target):
    tree=BVHTree.FromPolygons(target['vertices'],target['faces'])
    points=source['vertices']+[sum((source['vertices'][i] for i in f),Vector())/len(f) for f in source['faces']]
    return max(tree.find_nearest(p)[3] for p in points)

def self_crossings(row):
    faces=row['faces'];tree=BVHTree.FromPolygons(row['vertices'],faces,all_triangles=True)
    pairs=[(a,b) for a,b in tree.overlap(tree) if a<b and not set(faces[a])&set(faces[b])]
    points=np.array([list(v) for v in row['vertices']]);triangles=points[np.array(faces)]
    return len(exact_pairs(triangles,triangles,pairs))

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--reference',type=Path,required=True);p.add_argument('--report',type=Path,required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);bpy.ops.wm.open_mainfile(filepath=str(a.reference.resolve()));before=snapshot();bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));after=snapshot()
    failures=[];surfaces=[];totals={lod:sum(row['tris'] for name,row in after.items() if name.endswith(f'_LOD{lod}')) for lod in (0,1)}
    for lod,cap in ((0,20000),(1,10000)):
        if totals[lod]>cap:failures.append(f'LOD{lod} {totals[lod]} exceeds {cap}')
    for name,old in before.items():
        new=after[name]
        if name.startswith('GuardRigidPlate_') or name=='GuardBody_LOD1':
            outward=distance(old,new);inward=distance(new,old);surfaces.append({'object':name,'old_to_new_m':outward,'new_to_old_m':inward})
            if max(outward,inward)>.003:failures.append(name+': surface moves over 3 mm')
            if name.startswith('GuardRigidPlate_'):
                before_hits=self_crossings(old);after_hits=self_crossings(new);surfaces[-1].update({'source_self_crossings':before_hits,'candidate_self_crossings':after_hits})
                if after_hits>before_hits:failures.append(name+': new armor self intersections')
        elif old['vertices']!=new['vertices'] or old['faces']!=new['faces']:failures.append(name+': unrelated surface changed')
        if old['protected'] and not set(old['protected'])<=set(tuple(v) for v in new['vertices']):failures.append(name+': protected hand/arm/foot moved')
    report={'triangles':totals,'surfaces':surfaces,'failures':failures};a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));assert not failures,failures
if __name__=='__main__':main()
