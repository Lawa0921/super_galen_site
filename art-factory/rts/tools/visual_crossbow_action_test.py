"""Measure visible aim/recoil in torso space, not misleading local bone angles."""
import argparse,json,sys
from pathlib import Path
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from visual_knight_motion_test import positions
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--report',type=Path,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');weapon=bpy.data.objects['ProceduralCrossbow_LOD0'];g.set_action(rig,'Attack');rows=[]
for frame in range(41):
 bpy.context.scene.frame_set(frame);points=positions(weapon);world=Vector(points.mean(axis=0));local=rig.pose.bones['SpineUpper'].matrix.inverted()@world
 rows.append({'frame':frame,'local_center':list(local)})
baseline=Vector(rows[0]['local_center']);travel=max((Vector(r['local_center'])-baseline).length for r in rows[6:17]);recoil=(Vector(rows[16]['local_center'])-Vector(rows[13]['local_center'])).length;recovery=(Vector(rows[-1]['local_center'])-baseline).length
failures=[]
if travel<.10:failures.append('Bow remains locked to the carry pose instead of being raised to aim')
if recoil<.018:failures.append('No visible local recoil around the firing frame')
if recovery>.015:failures.append('Bow fails to recover its original carry pose')
report={'source':str(a.source),'aim_travel_m':travel,'recoil_travel_m':recoil,'recovery_m':recovery,'samples':rows,'failures':failures,'artistic_quality_proven':False}
a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_bytes((json.dumps(report,indent=2)+'\n').encode());print(json.dumps(report))
if failures:raise AssertionError('; '.join(failures))
