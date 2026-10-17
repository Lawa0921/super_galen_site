"""Extract the existing authored surfaces/binds, without modifying the source."""
import bpy, json, sys, hashlib
from pathlib import Path
from collections import Counter
from mathutils import Matrix
from mathutils.bvhtree import BVHTree
sys.path.insert(0, str(Path(__file__).parent))
from original_crossbow_attack_probe import activate

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT/'art-factory/rts/runs/original-crossbow-complete/2026-10-07-v3'
SOURCE = RUN.parent/'2026-10-07-v2/candidate/complete-crossbow.blend'

def main():
    for folder in ('raw', 'candidate', 'qa', 'prompts'):
        (RUN/folder).mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    rig = bpy.data.objects['crossbowRig20']
    meta = json.loads((ROOT/'art-factory/rts/runs/original-crossbow-articulated-hand/2026-10-07-v1/qa/attachment-preflight.json').read_text())
    anchor = Matrix(meta['source_bones']['Hand_L']['matrix'])
    activate(rig, 'Attack', 54)
    canonical = anchor @ rig.pose.bones['HandPalm_L'].matrix.inverted()
    hand = bpy.data.objects['OriginalCrossbowArticulatedHand_L']
    hand.data.calc_loop_triangles()
    names = [g.name for g in hand.vertex_groups]
    bindings = []
    for vertex in hand.data.vertices:
        bindings.append([{'bone': names[g.group], 'weight': g.weight,
                          'point': list(rig.data.bones[names[g.group]].matrix_local.inverted() @ hand.matrix_world @ vertex.co)}
                         for g in vertex.groups if g.weight > 0])
    evaluated = hand.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    positions = [list(canonical @ evaluated.matrix_world @ v.co) for v in mesh.vertices]
    evaluated.to_mesh_clear()
    triangles = [list(t.vertices) for t in hand.data.loop_triangles]
    bolt = bpy.data.objects['OriginalLoadedBolt']
    bolt.data.calc_loop_triangles()
    bolt_rest = rig.data.bones['LoadedBolt'].matrix_local.inverted()
    bolt_points = [list(bolt_rest @ bolt.matrix_world @ v.co) for v in bolt.data.vertices]
    bolt_canonical = canonical @ rig.pose.bones['LoadedBolt'].matrix
    bolt_world_points = [bolt_canonical @ (bolt_rest @ bolt.matrix_world @ v.co) for v in bolt.data.vertices]
    overlaps = BVHTree.FromPolygons(positions, triangles, all_triangles=True).overlap(
        BVHTree.FromPolygons(bolt_world_points, [tuple(t.vertices) for t in bolt.data.loop_triangles], all_triangles=True))
    by_bone = Counter()
    for face, _ in overlaps:
        for vertex in triangles[face]:
            by_bone[max(bindings[vertex], key=lambda x: x['weight'])['bone']] += 1
    report = {'source_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
              'source_bones': meta['source_bones'], 'bindings': bindings, 'triangles': triangles,
              'baseline_positions': positions,
              'baseline_matrices': {b.name: [list(r) for r in canonical @ b.matrix] for b in rig.pose.bones},
              'bolt': {'positions': bolt_points, 'triangles': [list(t.vertices) for t in bolt.data.loop_triangles],
                       'materials': [m.name for m in bolt.data.materials],
                       'triangle_materials': [t.material_index for t in bolt.data.loop_triangles],
                       'baseline_matrix': [list(r) for r in bolt_canonical]},
              'baseline_overlap_pairs': len(overlaps), 'overlap_dominant_bones': dict(by_bone),
              'runtime_publish_allowed': False}
    (RUN/'raw/pinch-surfaces.json').write_text(json.dumps(report, separators=(',', ':'))+'\n', newline='\n')
    print('PINCH_SURFACES', json.dumps({k: report[k] for k in ('source_sha256','baseline_overlap_pairs','overlap_dominant_bones')}))
    # Material-specific extents expose the actual shaft/feather domains.
    for i, material in enumerate(bolt.data.materials):
        ids = {v for t in bolt.data.loop_triangles if t.material_index == i for v in t.vertices}
        print('BOLT_PART', material.name, len(ids), [[min(bolt_points[j][axis] for j in ids), max(bolt_points[j][axis] for j in ids)] for axis in range(3)])

if __name__ == '__main__':
    main()
