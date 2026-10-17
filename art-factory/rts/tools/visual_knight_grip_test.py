"""Check mounted hands on the real horse/rider NLA clips and held objects."""
import argparse,json,sys
from pathlib import Path
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
from visual_hand_rework_test import inspect_glove
from visual_knight_motion_test import positions

p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--report',type=Path,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()))
hands=[o for o in bpy.data.objects if o.name.startswith('KnightCommanderHand_')];rig=bpy.data.objects['MountedKnightRig']
assert len(hands)==2,'Each mounted source must contain exactly two hands'
topology=[inspect_glove(o) for o in hands];failures=[];rows=[]
for row in topology:
 if len(row['leather_components'])!=1 or row['non_manifold_leather_edges'] or row['unweighted_vertices']:failures.append(row['object']+': disconnected/open/unweighted glove')
for track in rig.animation_data.nla_tracks:
 clip=track.name;start,end=map(int,track.strips[0].frame_start_end) if hasattr(track.strips[0],'frame_start_end') else (int(track.strips[0].frame_start),int(track.strips[0].frame_end))
 for obj in bpy.data.objects:
  if obj.animation_data:
   obj.animation_data.action=None
   for t in obj.animation_data.nla_tracks:t.mute=t.name!=clip
 contacts={o.name:100000 for o in hands}
 for frame in range(start,end+1):
  bpy.context.scene.frame_set(frame)
  for hand in hands:
   side=hand.name.split('_')[1];lod=hand.name.rsplit('_',1)[-1]
   weapon=bpy.data.objects[('KnightLance_' if side=='R' else 'KnightSunShield_')+lod]
   points=positions(weapon);faces=[tuple(p.vertices) for p in weapon.data.polygons if 'leather' in weapon.data.materials[p.material_index].name.lower()]
   tree=BVHTree.FromPolygons([Vector(v) for v in points],faces)
   count=sum(tree.find_nearest(Vector(v))[3]<.006 for v in positions(hand));contacts[hand.name]=min(contacts[hand.name],count)
 rows.append({'clip':clip,'frames_checked':end-start+1,'minimum_actual_handle_contacts':contacts})
 if any(n<10 for n in contacts.values()):failures.append(clip+': lost actual lance/shield grip contact')
report={'source':str(a.source),'hands':topology,'clips':rows,'failures':failures,'artistic_quality_proven':False}
a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_bytes((json.dumps(report,indent=2)+'\n').encode());print(json.dumps(report))
if failures:raise AssertionError('; '.join(failures))
