"""Actual evaluated hand/arrow acceptance, including inter-key hold frames."""
import bpy, json, sys, hashlib
from pathlib import Path
from mathutils.bvhtree import BVHTree
from mathutils import Vector
sys.path.insert(0, str(Path(__file__).parent))
from original_crossbow_attack_probe import activate
from original_crossbow_pinch_surface_probe import ROOT, RUN, SOURCE
from original_glove_deformation import crossings

candidate = RUN/'candidate/complete-crossbow.blend'
study = '--study' in sys.argv
if study: candidate = RUN/'candidate/pinch-study.blend'
source = SOURCE if '--baseline' in sys.argv else candidate if candidate.exists() else SOURCE
bpy.ops.wm.open_mainfile(filepath=str(source))
rig = bpy.data.objects['crossbowRig20']

def mesh(name):
    obj = bpy.data.objects[name].evaluated_get(bpy.context.evaluated_depsgraph_get())
    data = obj.to_mesh(); data.calc_loop_triangles()
    points = [obj.matrix_world @ v.co for v in data.vertices]
    normals = [(obj.matrix_world.to_3x3() @ v.normal).normalized() for v in data.vertices]
    faces = [tuple(t.vertices) for t in data.loop_triangles]
    mats = [t.material_index for t in data.loop_triangles]
    obj.to_mesh_clear()
    return points, faces, normals, mats

rows = []
layout = json.loads((RUN/'raw/pinch-layout.json').read_text()) if source == candidate else None
for k in ([0] if study else range(400, 497)):
    frame = k/8
    activate(rig, 'PinchStudy' if study else 'Attack', frame)
    hp, hf, hn, _ = mesh('OriginalCrossbowArticulatedHand_L')
    bp, bf, _, bm = mesh('OriginalLoadedBolt')
    handtree = BVHTree.FromPolygons(hp, hf, all_triangles=True)
    overlaps = handtree.overlap(BVHTree.FromPolygons(bp, bf, all_triangles=True))
    self_pairs = [(a,b) for a,b in handtree.overlap(handtree) if a < b and len(set(hf[a]) & set(hf[b])) < 2 and crossings([hp[i] for i in hf[a]], [hp[i] for i in hf[b]])]
    marker = bpy.data.objects['OriginalCrossbowArticulatedHand_L'].data.attributes['TailoredGauntlet']
    cuff = [any(marker.data[i].value for i in face) for face in hf]
    cuff_pairs = [(a,b) for a,b in self_pairs if cuff[a] or cuff[b]]
    row = {'frame': frame, 'hand_bolt_triangle_pairs': len(overlaps), 'hand_self_crossings': len(self_pairs),
           'gauntlet_self_crossings': len(cuff_pairs), 'non_gauntlet_self_crossings': len(self_pairs)-len(cuff_pairs)}
    if layout:
        material = next(i for i,m in enumerate(bpy.data.objects['OriginalLoadedBolt'].data.materials) if m.name == 'HewnOak')
        shaft = BVHTree.FromPolygons(bp, [f for f,m in zip(bf,bm) if m == material], all_triangles=True)
        contacts = {}
        for name, ids in layout['contact_vertex_ids'].items():
            measured = []
            for i in ids:
                point, normal, face, distance = shaft.find_nearest(hp[i])
                measured.append({'vertex': i, 'distance_m': distance, 'normal_opposition': -hn[i].dot(normal), 'shaft_normal': list(normal)})
            contacts[name] = sorted(measured, key=lambda r: r['distance_m'])[:3]
        row['contacts'] = contacts
        directions = [sum((Vector(r['shaft_normal']) for r in contacts[n]), Vector()).normalized() for n in ('Index','Thumb')]
        row['opposite_pad_dot'] = directions[0].dot(directions[1])
        row['contact_pass'] = row['opposite_pad_dot'] < -.5 and all(max(r['distance_m'] for r in group) <= .0015 and min(r['normal_opposition'] for r in group) > .5 for group in contacts.values())
    rows.append(row)
report = {'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
          'input_source_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
          'candidate_blend_sha256': hashlib.sha256(source.read_bytes()).hexdigest() if source == candidate else None, 'samples': len(rows),
          'rows': rows, 'maximum_hand_bolt_pairs': max(r['hand_bolt_triangle_pairs'] for r in rows),
          'finger_shaft_hold_pass': all(r['hand_bolt_triangle_pairs'] == 0 and r['non_gauntlet_self_crossings'] == 0 and r.get('contact_pass', False) for r in rows),
          'pass': all(r['hand_bolt_triangle_pairs'] == 0 and r['hand_self_crossings'] == 0 and r.get('contact_pass', False) for r in rows), 'runtime_publish_allowed': False,
          'scope': 'Evaluated LOD0 arrow overlap, noncoplanar self crossings excluding shared edges, and nearest three original distal palmar vertices to shaft surfaces with normal opposition. Does not approve full character or surrounding motion.'}
suffix = 'study' if study else 'candidate' if source == candidate else 'baseline'
(RUN/f'qa/surface-{suffix}.json').write_text(json.dumps(report, indent=2)+'\n', newline='\n')
print('SURFACE_VERIFY', json.dumps({k: v for k, v in report.items() if k != 'rows'}))
assert report['pass'], 'Glove/arrow surface QA failed; inspect separate contact, intersection and gauntlet gates'
