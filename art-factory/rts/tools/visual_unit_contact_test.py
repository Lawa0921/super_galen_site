"""All-frame hand/handle, surface connectivity and foot/torso contact gates."""
import argparse,json,sys
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from visual_hand_rework_test import inspect_glove
from visual_knight_motion_test import positions

p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--report',type=Path,required=True);p.add_argument('--require-grounding',action='store_true')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');meshes=[o for o in bpy.data.objects if o.type=='MESH']
hands=[o for o in meshes if any(s in o.name for s in ('Gauntlet','AssemblyHand','CommanderHand','CommanderClosedGrip'))]
bodies=[o for o in meshes if 'OriginalBody' in o.name or 'GuardBody' in o.name]
weapons=[o for o in meshes if o not in hands+bodies]
failures=[];topology=[inspect_glove(o) for o in hands]
for r in topology:
 if len(r['leather_components'])!=1 or r['non_manifold_leather_edges'] or r['unweighted_vertices']:failures.append(r['object']+': disconnected/open/unweighted glove')
rows=[]
for action in bpy.data.actions:
 g.set_action(rig,action.name);minimum=1e9;handfloor=1e9;maxground=0;mincontact=1e9;torsofloor=1e9;contacts={o.name:None for o in hands};areas={o.name:None for o in hands};released_frames=0;deathfeet={}
 for frame in range(int(action.frame_range[0]),int(action.frame_range[1])+1):
  bpy.context.scene.frame_set(frame);bodypoints={o.name:positions(o) for o in bodies};weaponpoints={o.name:positions(o) for o in weapons}
  minimum=min(minimum,min(float(p[:,2].min()) for p in list(bodypoints.values())+list(weaponpoints.values())))
  if action.name=='Walk':maxground=max(maxground,max(float(p[:,2].min()) for p in bodypoints.values()))
  if action.name=='Death' and frame==int(action.frame_range[1]):
   for o in bodies:
    height=max(v.co.z for v in o.data.vertices);ids=[v.index for v in o.data.vertices if .48*height<v.co.z<.77*height and abs(v.co.x)<.14*height]
    torsofloor=min(torsofloor,float(bodypoints[o.name][ids,2].min()))
    for side in 'LR':
     ids=[v.index for v in o.data.vertices if v.co.z<height*.10 and (v.co.x<0 if side=='L' else v.co.x>0)]
     if ids:deathfeet[o.name+':'+side]=float(bodypoints[o.name][ids,2].min())
  # Contacts are evaluated on the actual leather handle triangles, rather
  # than a fitted cylinder whose radius is wrong for a rectangular grip.
  for hand in hands:
   lod=hand.name.rsplit('_',1)[-1];candidates=[o for o in weapons if o.name.endswith(lod)]
   vertices=[];faces=[]
   for weapon in candidates:
    points=weaponpoints[weapon.name];offset=len(vertices);vertices.extend(Vector(v) for v in points)
    material_kind='oak' if 'Crossbow' in weapon.name and '_R_' in hand.name else 'leather'
    faces.extend(tuple(i+offset for i in p.vertices) for p in weapon.data.polygons if material_kind in weapon.data.materials[p.material_index].name.lower())
   if not faces:continue
   tree=BVHTree.FromPolygons(vertices,faces);hp=positions(hand);handfloor=min(handfloor,float(hp[:,2].min()));near=np.array([tree.find_nearest(Vector(v))[3]<.006 for v in hp]);count=int(near.sum())
   hand.data.calc_loop_triangles();triangles=np.array([list(t.vertices) for t in hand.data.loop_triangles]);points=hp[triangles]
   triangle_area=np.linalg.norm(np.cross(points[:,1]-points[:,0],points[:,2]-points[:,0]),axis=1)*.5
   # Measure physical contact rather than tessellation density. A decimated
   # glove can retain the same grip patch with fewer vertices than LOD0.
   # Triangle centroids prevent one close corner counting a whole long face.
   center_near=np.array([tree.find_nearest(Vector(v))[3]<.006 for v in points.mean(axis=1)])
   area=float(triangle_area[center_near].sum())
   # crossbow_death.author_death deliberately releases the supporting L
   # hand after 18% of the fall. R must retain contact for the entire clip.
   phase=(frame-action.frame_range[0])/max(1,action.frame_range[1]-action.frame_range[0])
   releasing=action.name=='Death' and '_L_' in hand.name and any('Crossbow' in o.name for o in candidates) and phase>.18
   if releasing:released_frames+=1
   else:
    mincontact=min(mincontact,count);contacts[hand.name]=count if contacts[hand.name] is None else min(contacts[hand.name],count)
    areas[hand.name]=area if areas[hand.name] is None else min(areas[hand.name],area)
 rows.append({'clip':action.name,'minimum_body_equipment_z':minimum,'minimum_hand_z':handfloor,'maximum_walk_support_gap':maxground,'minimum_actual_handle_contacts':mincontact,'minimum_required_contacts_by_hand':contacts,'minimum_contact_patch_area_m2':areas,'intentional_support_release_lod_frames':released_frames,'death_torso_ground_gap':torsofloor if torsofloor<1e9 else None,'death_foot_ground_gaps':deathfeet})
 if minimum<-.006:failures.append(action.name+': body/equipment penetrates floor')
 if handfloor<-.006:failures.append(action.name+': glove penetrates floor')
 if mincontact<4:failures.append(action.name+': fewer than four vertices contact the actual handle')
 if any(area is None or area<.0002 for area in areas.values()):failures.append(action.name+': grip contact patch is smaller than 2 square centimetres')
 if a.require_grounding and action.name=='Walk' and maxground>.012:failures.append('Walk: neither foot supports the body within 12 mm of ground')
 if a.require_grounding and action.name=='Death' and torsofloor>.06:failures.append('Death: torso remains suspended more than 6 cm above ground')
 if a.require_grounding and action.name=='Death' and any(z>.025 for z in deathfeet.values()):failures.append('Death: a foot remains suspended more than 2.5 cm above ground')
report={'source':str(a.source),'hands':topology,'clips':rows,'failures':failures,'artistic_quality_proven':False}
a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_bytes((json.dumps(report,indent=2)+'\n').encode());print(json.dumps(report))
if failures:raise AssertionError('; '.join(failures))
