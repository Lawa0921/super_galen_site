"""A melee axe must wind up above the shoulder and strike forward, then recover."""
import argparse,json,sys
from pathlib import Path
import bpy,numpy as np
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from visual_knight_motion_test import positions
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--report',type=Path,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');weapon=next(o for o in bpy.data.objects if 'Axe_LOD0' in o.name);body=next(o for o in bpy.data.objects if 'OriginalBody_LOD0' in o.name)
g.set_action(rig,'Attack');start,end=map(int,bpy.data.actions['Attack'].frame_range);samples=[];ends=[]
height=max(v.co.z for v in body.data.vertices)
for frame in range(start,end+1):
 bpy.context.scene.frame_set(frame);points=positions(weapon)
 samples.append({'frame':frame,'tool_max_z':float(points[:,2].max()),'tool_max_forward_y':float(points[:,1].max())})
 if frame in (start,end):ends.append(points)
windup=max(s['tool_max_z'] for s in samples if s['frame']<=8);strike=max(s['tool_max_forward_y'] for s in samples if 10<=s['frame']<=16)
recovery=float(np.linalg.norm(ends[1]-ends[0],axis=1).max());failures=[]
if windup<height+.03:failures.append('Axe wind-up never rises above head height')
if strike<.35:failures.append('Axe never reaches forward into a strike')
if recovery>.015:failures.append('Attack does not return to its starting carry pose')
r={'source':str(a.source),'windup_max_z':windup,'body_height':height,'strike_forward_extent':strike,'recovery_distance':recovery,'samples':samples,'failures':failures,'artistic_quality_proven':False}
a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_bytes((json.dumps(r,indent=2)+'\n').encode());print(json.dumps(r))
if failures:raise AssertionError('; '.join(failures))
