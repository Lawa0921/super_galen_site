"""Dense actual triangle overlap investigation; does not imply art approval."""
import bpy,json,sys,hashlib
from pathlib import Path
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_fullbody_build import RUN
from original_crossbow_attack_probe import activate
SOURCE=RUN/'candidate/complete-crossbow.blend'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['crossbowRig20']
def tree(name):
    obj=bpy.data.objects[name].evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=obj.to_mesh();mesh.calc_loop_triangles()
    t=BVHTree.FromPolygons([obj.matrix_world@v.co for v in mesh.vertices],[tuple(f.vertices) for f in mesh.loop_triangles],all_triangles=True)
    obj.to_mesh_clear();return t
rows=[]
for k in range(100,125):
    frame=k/2;activate(rig,'Attack',frame)
    bolt=tree('OriginalLoadedBolt');hand=tree('OriginalCrossbowArticulatedHand_L');weapon=tree('CrossbowWeapon_LOD0')
    rows.append({'frame':frame,'bolt_weapon_overlap_pairs':len(bolt.overlap(weapon)),
                 'bolt_hand_overlap_pairs':len(bolt.overlap(hand)),'hand_weapon_overlap_pairs':len(hand.overlap(weapon))})
report={'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'rows':rows,'runtime_publish_allowed':False,
        'scope':'Actual triangle intersection pairs. Pair counts identify frames needing inspection, not penetration depth or a contact approval.'}
(RUN/'qa/held-bolt-collision.json').write_text(json.dumps(report,indent=2)+'\n',newline='\n')
print('HELD_BOLT_COLLISION',json.dumps({'maximum_pairs':{key:max(r[key] for r in rows) for key in rows[0] if key!='frame'},'nonzero_frames':[r for r in rows if any(v for k,v in r.items() if k!='frame')]}))
