"""Measured before/after weapon and gripping-hand body crossings, no edits."""
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils.bvhtree import BVHTree

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from guard_attack_author import ROOT, RUN, SOURCE, SOURCE_SHA
from original_guard_arm_hinge import strict_triangle_crossings

TARGETS = ('GuardBody', 'GuardFauld', 'GuardTasset_R', 'GuardTasset_L', 'GuardLegArmor_thigh_armor_R',
           'GuardLegArmor_thigh_armor_L', 'KingdomSunShield', 'Tabard_OriginalGuardFrontTabard')
MOVERS = ('KingdomSteelSword', 'GuardHandGrip_R')


def evaluated(name):
    obj = bpy.data.objects[name].evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = obj.to_mesh()
    mesh.calc_loop_triangles()
    points = [obj.matrix_world @ v.co for v in mesh.vertices]
    faces = [list(t.vertices) for t in mesh.loop_triangles]
    triangles = np.asarray(points, float)[np.asarray(faces, int)]
    tree = BVHTree.FromPolygons(points, faces, all_triangles=True, epsilon=0.)
    obj.to_mesh_clear()
    return triangles, tree


def main(*, run=RUN, source=SOURCE, source_sha=SOURCE_SHA, sample_times=None):
    RUN, SOURCE, SOURCE_SHA = run, source, source_sha
    info = json.loads((RUN/'qa/authoring.json').read_text(encoding='utf-8'))
    sources = [('before', SOURCE, SOURCE_SHA), ('after', RUN/'candidate/guard-authored-attack.blend', info['candidate_sha256'])]
    times = sorted(set([i/4 for i in range(9*4,18*4+1)]+[10.69140625, 10.87890625, 13.09375])) if sample_times is None else sample_times
    results = {}
    for label, path, expected in sources:
        assert hashlib.sha256(path.read_bytes()).hexdigest() == expected
        bpy.ops.wm.open_mainfile(filepath=str(path))
        rig, scene = bpy.data.objects['GuardRig20'], bpy.context.scene
        rig.animation_data.action = bpy.data.actions['Attack']
        rows = []
        for frame in times:
            scene.frame_set(math.floor(frame), subframe=frame % 1)
            for lod in (0,1):
                objects = {n: evaluated(f'{n}_LOD{lod}') for n in (*MOVERS, *TARGETS)}
                for mover in MOVERS:
                    a, tree_a = objects[mover]
                    for target in TARGETS:
                        b, tree_b = objects[target]
                        overlaps = tree_a.overlap(tree_b)
                        strict = [[int(i),int(j)] for i,j in overlaps if len(strict_triangle_crossings(a[i:i+1], b[j:j+1]))]
                        if strict:
                            rows.append({'frame': frame, 'lod': lod, 'mover': mover, 'target': target, 'strict_pairs': strict})
        results[label] = {'source_sha256': expected, 'crossings': rows, 'samples': len(times)}
        print('ATTACK_BODY_CROSSINGS', label, len(rows), flush=True)
    report = {'status': 'sampled_body_crossing_check_only', 'runtime_publish_allowed': False, 'results': results,
              'limitations': ['Quarter-frame motion witnesses plus velocity extrema; final dense sweep still required',
                              'Strict surface crossing does not exclude containment, contact or coplanar overlap',
                              'Existing arm-to-armor/sleeve intersections remain a separate rejected geometry gate']}
    (RUN/'qa/body-crossings.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')


if __name__ == '__main__':
    if '--attack-start' in sys.argv or '--exterior-tangent' in sys.argv:
        run = RUN.with_name('2026-10-08-v28-authored-attack-start-arc')
        if '--exterior-tangent' in sys.argv:
            run = RUN.with_name('2026-10-08-v29-attack-start-exterior-tangent')
        main(run=run, source=RUN/'candidate/guard-authored-attack.blend',
             source_sha='a57e17a559d60a3912b77d6e5cb6708e888a5e73181e2c5d5e517cb1af103c35',
             sample_times=[i/16 for i in range(65)])
    else:
        main()
