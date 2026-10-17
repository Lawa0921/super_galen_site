"""Check closed, foot-sized stirrups and actual sole support before release."""
import argparse,json,sys
from pathlib import Path
import bpy,bmesh,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
from visual_knight_seat_test import select_clip,sole_sets
from visual_knight_motion_test import positions

p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--report',type=Path,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()))
metal=[o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith('ForgedStirrup')]
body=next(o for o in bpy.data.objects if o.name.startswith('MountedKnightBody_'));rig=bpy.data.objects['MountedKnightRig'];sets=sole_sets(body)
select_clip('Idle');bpy.context.scene.frame_set(1);failures=[];topology=[]
for obj in metal:
    bm=bmesh.new();bm.from_mesh(obj.data);open_edges=sum(not e.is_manifold for e in bm.edges);bm.free()
    extent=np.ptp(positions(obj),axis=0);topology.append({'mesh':obj.name,'open_edges':open_edges,'extent':extent.tolist()})
    if open_edges:failures.append(obj.name+': open metal surface')
    if extent[2]>.26 or max(extent[:2])>.24:failures.append(obj.name+': stirrup larger than the foot support envelope')
rows=[]
for track in rig.animation_data.nla_tracks:
    select_clip(track.name);start,end=map(int,track.strips[0].action.frame_range);maximum=0
    for frame in np.linspace(start,end,(end-start)*4+1):
        if track.name=='Death' and (frame-start)/max(1,end-start)>.02:continue
        bpy.context.scene.frame_set(int(frame),subframe=float(frame%1));bp=positions(body);vertices=[];faces=[]
        for obj in metal:
            offset=len(vertices);vertices.extend(Vector(v) for v in positions(obj));faces.extend(tuple(i+offset for i in f.vertices) for f in obj.data.polygons)
        for side in 'LR':
            ids=set(sets[side]['all']);boot_faces=[list(p.vertices) for p in body.data.polygons if all(i in ids for i in p.vertices)]
            tree=BVHTree.FromPolygons([Vector(v) for v in bp],boot_faces)
            near=[]
            for obj in metal:
                mp=positions(obj);bottom=float(mp[:,2].min())
                obj.data.calc_loop_triangles()
                for tri in obj.data.loop_triangles:
                    triangle=mp[list(tri.vertices)]
                    if float(triangle[:,2].max())>bottom+.025:continue
                    for u in np.linspace(0,1,9):
                        for v in np.linspace(0,1-u,9):
                            p=Vector(triangle[0]*u+triangle[1]*v+triangle[2]*(1-u-v))
                            near.append(tree.find_nearest(p)[3])
            assert near,'No tread surface samples'
            distance=min(near);maximum=max(maximum,distance)
    rows.append({'clip':track.name,'maximum_sole_metal_gap_m':maximum})
    if maximum>.006:failures.append(track.name+': neither tread nor rim meets the boot sole within 6mm')
a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps({'source':str(a.source),'topology':topology,'clips':rows,'death_foot_release_after_phase':.02,'failures':failures},indent=2)+'\n');print(json.dumps({'topology':topology,'clips':rows,'failures':failures}))
if failures:raise AssertionError('; '.join(failures))
