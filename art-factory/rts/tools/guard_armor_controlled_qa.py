"""Reload actual saved helper rig and test its triangulated moving armor."""
import argparse
import itertools
import json
import math
import sys
import time as timer
from pathlib import Path

import bpy
import numpy as np
from mathutils.bvhtree import BVHTree

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from guard_armor_controlled_helpers import RUN, CANDIDATE, CLIPS, HELPERS, curve_signature, sha, window_from_source, planned_skins
from guard_armor_relief_inventory import components
from guard_hand_ik_repair import mesh_signature
from original_guard_arm_hinge import strict_triangle_crossings
from original_guard_shell_winding_math import closed_consistent_shell
from grip_gap_math import triangle_clearance, mesh_clearance
from armor_surface_qa_math import face_component_count, prevalidated_surface_winding

CONTACT = 1e-7


def main():
    global RUN, CANDIDATE
    parser = argparse.ArgumentParser()
    parser.add_argument('--step', type=int, default=8)
    parser.add_argument('--clip', choices=CLIPS)
    parser.add_argument('--start', type=float, default=0.)
    parser.add_argument('--end', type=float)
    parser.add_argument('--run')
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    if args.run:
        RUN = RUN.with_name(args.run)
        CANDIDATE = RUN/'candidate/guard-controlled-armor.blend'
    report = json.loads((RUN/'qa/authoring.json').read_text(encoding='utf-8'))
    assert sha(CANDIDATE) == report['candidate_sha256']
    bpy.ops.wm.open_mainfile(filepath=str(CANDIDATE))
    scene, rig = bpy.context.scene, bpy.data.objects['GuardRig20']
    started = timer.perf_counter()
    assert np.max(abs(np.array(rig.matrix_world)-np.eye(4))) < 1e-7
    assert curve_signature() == report['original_curves_signature']
    signatures = mesh_signature()
    assert all(signatures[n] == h for n, h in report['non_arm_mesh_signatures'].items())
    assert all(bpy.data.objects[n].hide_render == v for n, v in report['original_mesh_visibility'].items())
    names = [b.name for b in rig.data.bones]
    inverses = [b.matrix_local.inverted() for b in rig.data.bones]
    source, groups, topology = {}, {}, {}
    for lod in (0, 1):
        arm = bpy.data.objects['GuardArms_LOD'+str(lod)]
        for side in ('R', 'L'):
            groups[side+str(lod)] = {}
            for part in ('UpperArmArmor', 'ForearmArmor', 'ElbowArmor', 'ShoulderSpaulder', 'WristCuff', 'FlexibleSleeve'):
                obj = arm if part == 'FlexibleSleeve' else bpy.data.objects['Guard'+part+'_'+side+'_LOD'+str(lod)]
                mesh = obj.data
                assert np.max(abs(np.array(obj.matrix_world)-np.eye(4))) < 1e-7
                mesh.calc_loop_triangles()
                if obj.name not in source:
                    points = np.array([v.co[:] for v in mesh.vertices])
                    weights = np.zeros((len(points), len(names)))
                    for v in mesh.vertices:
                        for g in v.groups:
                            name = obj.vertex_groups[g.group].name
                            if name in names:
                                weights[v.index, names.index(name)] = g.weight
                    assert np.max(abs(weights.sum(axis=1)-1)) < 1e-6
                    source[obj.name] = (np.column_stack((points, np.ones(len(points)))), weights)
                faces = np.array([t.vertices[:] for t in mesh.loop_triangles])
                if part == 'FlexibleSleeve':
                    islands = components(mesh)
                    assert len(islands) == 2
                    owned = next(ids for ids in islands if (mesh.vertices[ids[0]].co.x > 0) == (side == 'R'))
                    faces = faces[np.isin(faces[:, 0], owned)]
                closed = closed_consistent_shell(faces)
                assert closed, (obj.name, side, 'Open/inconsistent shell cannot be checked as a volume')
                connected = face_component_count(faces)
                assert connected == 1, (obj.name, side, 'Single-point containment requires one edge-connected shell')
                groups[side+str(lod)][part] = (obj.name, faces)
                topology[side+str(lod)+'_'+part] = {'triangles': len(faces), 'closed_consistent_shell': closed, 'edge_connected_components': connected}
    window = window_from_source()
    rest = {s: np.array([rig.data.bones[n+'_'+s].head_local[:] for n in ('UpperArm', 'Forearm', 'Hand')]) for s in HELPERS}
    failures, minimum_witnesses = [], []
    maximum_helper_error, maximum_modifier_error, poses, checks = 0., 0., 0, 0
    for clip in ([args.clip] if args.clip else CLIPS):
        rig.animation_data.action = bpy.data.actions[clip]
        end = min(float(rig.animation_data.action.frame_range[1]), args.end) if args.end is not None else float(rig.animation_data.action.frame_range[1])
        for index in range(round(args.start*args.step), round(end*args.step)+1):
            time = index/args.step
            scene.frame_set(math.floor(time), subframe=time % 1)
            skins = np.array([np.array(rig.pose.bones[n].matrix @ inverse) for n, inverse in zip(names, inverses)])
            predicted = {n: np.einsum('vb,bij,vj->vi', weights, skins, points)[:, :3] for n, (points, weights) in source.items()}
            for side, helpers in HELPERS.items():
                intended = planned_skins(rig, rest[side], side, clip, time, window)
                for i, name in enumerate(helpers):
                    delta = skins[names.index(name)]-intended[i]
                    maximum_helper_error = max(maximum_helper_error, float(np.linalg.norm(delta[:3, 3])+2*np.linalg.norm(delta[:3, :3], 2)))
            graph = bpy.context.evaluated_depsgraph_get()
            posed = {}
            for name, expected in predicted.items():
                actual_obj = bpy.data.objects[name].evaluated_get(graph)
                mesh = actual_obj.to_mesh()
                actual = np.empty(len(mesh.vertices)*3, dtype=np.float64)
                mesh.vertices.foreach_get('co', actual)
                actual = actual.reshape((-1, 3))
                assert actual.shape == expected.shape and np.isfinite(actual).all()
                maximum_modifier_error = max(maximum_modifier_error, float(np.linalg.norm(actual-expected, axis=1).max()))
                posed[name] = actual
                actual_obj.to_mesh_clear()
            for group, records in groups.items():
                geom = {}
                for part, (obj_name, faces) in records.items():
                    # Compact to referenced vertices: avoids unused opposite-arm
                    # points polluting nearest-distance or containment evidence.
                    ids = np.unique(faces)
                    points = posed[obj_name][ids]
                    remap = np.full(len(posed[obj_name]), -1, int)
                    remap[ids] = np.arange(len(ids))
                    local = remap[faces]
                    triangles = points[local]
                    assert np.all(np.linalg.norm(np.cross(triangles[:, 1]-triangles[:, 0], triangles[:, 2]-triangles[:, 0]), axis=1) > 1e-14), (clip, time, group, part, 'Degenerate posed triangle')
                    geom[part] = (points, local, triangles, BVHTree.FromPolygons(points.tolist(), local.tolist(), all_triangles=True, epsilon=CONTACT))
                for first, second in itertools.combinations(geom, 2):
                    pa, fa, ta, ba = geom[first]
                    pb, fb, tb, bb = geom[second]
                    checks += 1
                    if np.any(pa.min(axis=0) > pb.max(axis=0)+CONTACT) or np.any(pb.min(axis=0) > pa.max(axis=0)+CONTACT):
                        continue
                    strict, inclusive = [], []
                    for a, b in ba.overlap(bb):
                        if len(strict_triangle_crossings(ta[a:a+1], tb[b:b+1])):
                            strict.append([a, b])
                        elif triangle_clearance(ta[a], tb[b])['distance'] <= CONTACT:
                            inclusive.append([a, b])
                    contained = []
                    # With connected closed surfaces and no surface crossing or
                    # contact, a single surface sample determines full containment.
                    if not strict and not inclusive:
                        for label, sample, triangles, tree in ((first, pa[0], tb, bb), (second, pb[0], ta, ba)):
                            if abs(prevalidated_surface_winding(sample, triangles)) > .5 and tree.find_nearest(sample)[3] > CONTACT:
                                contained.append(label)
                    if strict or inclusive or contained:
                        failures.append({'clip': clip, 'frame': time, 'group': group, 'pair': [first, second],
                                         'strict': strict, 'inclusive_contact': inclusive, 'contained': contained})
                    if clip == 'Death' and time in (14., 15., 15.375, 15.5, 16., 17.) and group == 'R1' and (first, second) == ('ForearmArmor', 'WristCuff'):
                        minimum_witnesses.append({'frame': time, **mesh_clearance(ta, tb)})
            poses += 1
            if time % 6 == 0:
                print('SAVED_ARMOR_QA', clip, time, 'failures', len(failures), 'elapsed_seconds', round(timer.perf_counter()-started, 2), flush=True)
    result = {'status': 'passed_sampled_armor_scope' if not failures else 'failed_sampled_armor_scope', 'runtime_publish_allowed': False,
              'candidate_sha256': sha(CANDIDATE), 'samples_per_frame': args.step, 'clip': args.clip or 'all', 'start': args.start, 'end': args.end,
              'poses': poses, 'pair_checks': checks, 'failures': failures, 'topology': topology,
              'maximum_reloaded_helper_two_metre_point_bound_m': maximum_helper_error, 'maximum_actual_modifier_point_error_m': maximum_modifier_error,
              'actual_modifier_comparison_poses': poses, 'geometry_method': 'Actual evaluated Blender modifier vertices at every reported pose; manual LBS is a separate parity comparison only',
              'qa_revision': 2, 'elapsed_seconds': timer.perf_counter()-started,
              'qa_recipe_sha256': {n: sha(Path(__file__).parent/n) for n in ('guard_armor_controlled_qa.py', 'armor_surface_qa_math.py', 'original_guard_shell_winding_math.py', 'original_guard_arm_hinge.py', 'grip_gap_math.py', 'original_guard_quadri_repair_math.py')},
              'wrist_clearance_witnesses': minimum_witnesses, 'contact_tolerance_m': CONTACT,
              'limitations': ['Only armor parts and sleeves; excludes whole-body and weapon collisions', 'Discrete sampling; refine signature changes if present', 'Not visual, hand, export or runtime approval']}
    path = RUN/f'qa/reload-v2-{args.clip or "all"}-step{args.step}-{args.start}-{args.end}.json'
    path.write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8', newline='\n')
    print('SAVED_ARMOR_RESULT', len(failures), 'helper_bound', maximum_helper_error, 'actual_modifier', maximum_modifier_error, flush=True)
    assert maximum_modifier_error < 2e-6
    assert not failures, len(failures)


if __name__ == '__main__':
    main()
