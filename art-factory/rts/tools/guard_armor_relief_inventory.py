"""Measure the frozen armor collision envelope in original UV parameter space."""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from original_guard_arm_hinge import strict_triangle_crossings
from original_guard_arm_hinge_diagnose import intersection_points

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / 'art-factory/rts/runs/guard-right-hand-cage'
SOURCE = BASE / '2026-10-08-v17-tabard-continuity/candidate/guard-tabard-continuity.blend'
SOURCE_SHA = 'cb1f0bf304b82b27792b7fe57abcdc4ff2ed48f302d9dcd97531652096f5a751'
RUN = BASE / '2026-10-08-v22-armor-relief-envelope'
PARTS = ('ShoulderSpaulder', 'UpperArmArmor', 'ElbowArmor', 'ForearmArmor', 'WristCuff', 'FlexibleSleeve')
CLIPS = ('Idle', 'Walk', 'Attack', 'Hurt', 'Death')


def components(mesh):
    neighbors = [set() for _ in mesh.vertices]
    for edge in mesh.edges:
        a, b = edge.vertices
        neighbors[a].add(b)
        neighbors[b].add(a)
    pending = set(range(len(neighbors)))
    result = []
    while pending:
        seed = min(pending)
        pending.remove(seed)
        stack, found = [seed], []
        while stack:
            index = stack.pop()
            found.append(index)
            for other in neighbors[index]:
                if other in pending:
                    pending.remove(other)
                    stack.append(other)
        result.append(sorted(found))
    return result


def collect(rig):
    records, inventory = {}, {}
    for lod in (0, 1):
        obj = bpy.data.objects[f'GuardArms_LOD{lod}']
        mesh = obj.data
        mesh.calc_loop_triangles()
        groups = components(mesh)
        assert len(groups) == 12, (obj.name, 'component count', len(groups))
        membership = {vertex: ci for ci, ids in enumerate(groups) for vertex in ids}
        all_points = np.asarray([v.co for v in mesh.vertices], float)
        lod_record = {}
        for side, offset in (('R', 0), ('L', 6)):
            for label, ci, bone_name in (('UpperArmArmor', offset + 1, 'UpperArm_' + side), ('ForearmArmor', offset + 3, 'Forearm_' + side)):
                ids = groups[ci]
                assert all((all_points[i, 0] > 0) == (side == 'R') for i in ids)
                for i in ids:
                    weights = {obj.vertex_groups[g.group].name: g.weight for g in mesh.vertices[i].groups if g.weight > 1e-8 and obj.vertex_groups[g.group].name in rig.data.bones}
                    assert weights == {bone_name: 1.}, (obj.name, label, i, weights)
                triangles = [t for t in mesh.loop_triangles if membership[t.vertices[0]] == ci]
                assert all(all(membership[v] == ci for v in t.vertices) for t in triangles)
                faces = np.asarray([list(t.vertices) for t in triangles], int)
                uv = np.asarray([[list(mesh.uv_layers.active.data[loop].uv) for loop in t.loops] for t in triangles], float)
                uv = uv[..., [1, 0]] / [2.5, 1.75]
                key = f'LOD{lod}_{side}_{label}'
                records[key] = {'points': all_points, 'faces': faces, 'uv': uv, 'bone': bone_name,
                                'triangle_ids': [t.index for t in triangles], 'object': obj.name,
                                'inverse': rig.data.bones[bone_name].matrix_local.inverted()}
                lod_record[f'{side}_{label}'] = {'component': ci, 'vertex_ids': ids, 'triangle_ids': [t.index for t in triangles],
                                               'uv_parameter_min': uv.reshape(-1, 2).min(axis=0).tolist(), 'uv_parameter_max': uv.reshape(-1, 2).max(axis=0).tolist(),
                                               'rigid_bone': bone_name}
        inventory[obj.name] = lod_record
    return records, inventory


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--step', type=int, default=64)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    assert args.step > 0 and args.step <= 256
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == SOURCE_SHA
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    rig, scene = bpy.data.objects['GuardRig20'], bpy.context.scene
    records, inventory = collect(rig)
    summaries, modifier_error = {}, 0.
    for clip in CLIPS:
        rig.animation_data.action = bpy.data.actions[clip]
        end = float(rig.animation_data.action.frame_range[1])
        times = sorted(set([i / args.step for i in range(round(end * args.step) + 1)] +
                           ([13.09375] if clip == 'Attack' else [15.5, 35.5] if clip == 'Death' else [])))
        summary = {f'LOD{lod}_{side}': {'samples': len(times), 'colliding_samples': 0, 'maximum_pairs': 0, 'unique_pairs': {}, 'colliding_frames': []}
                   for lod in (0, 1) for side in ('R', 'L')}
        for index, frame in enumerate(times):
            scene.frame_set(math.floor(frame), subframe=frame % 1)
            posed = {}
            for key, part in records.items():
                skin = np.asarray(rig.pose.bones[part['bone']].matrix @ part['inverse'])
                points = part['points'] @ skin[:3, :3].T + skin[:3, 3]
                posed[key] = points[part['faces']]
                if frame in (0, 13.09375, 15.5, 35.5):
                    evaluated = bpy.data.objects[part['object']].evaluated_get(bpy.context.evaluated_depsgraph_get())
                    data = evaluated.to_mesh()
                    actual = np.asarray([data.vertices[v].co for v in np.unique(part['faces'])], float)
                    modifier_error = max(modifier_error, float(np.linalg.norm(actual - points[np.unique(part['faces'])], axis=1).max()))
                    evaluated.to_mesh_clear()
            for key, row in summary.items():
                upper, fore = records[key + '_UpperArmArmor'], records[key + '_ForearmArmor']
                a, b = posed[key + '_UpperArmArmor'], posed[key + '_ForearmArmor']
                pairs = strict_triangle_crossings(a, b)
                if not len(pairs):
                    continue
                row['colliding_samples'] += 1
                row['colliding_frames'].append(frame)
                if len(pairs) > row['maximum_pairs']:
                    row['maximum_pairs'], row['worst_frame'] = len(pairs), frame
                for ai, bi in pairs:
                    identity = f'{upper["triangle_ids"][ai]}/{fore["triangle_ids"][bi]}'
                    if identity in row['unique_pairs']:
                        continue
                    hits = intersection_points(a[ai], b[bi])
                    parameters = []
                    for point in hits:
                        mapped = {}
                        for label, triangle, uv in (('upper', a[ai], upper['uv'][ai]), ('fore', b[bi], fore['uv'][bi])):
                            uvw = np.linalg.lstsq(np.vstack((triangle.T, np.ones(3))), np.append(point, 1), rcond=None)[0]
                            assert np.linalg.norm(uvw @ triangle - point) < 1e-7
                            mapped[label] = (uvw @ uv).tolist()
                        parameters.append(mapped)
                    row['unique_pairs'][identity] = {'first_frame': frame, 'upper_triangle': int(upper['triangle_ids'][ai]),
                                                    'fore_triangle': int(fore['triangle_ids'][bi]), 'crossing_parameters': parameters,
                                                    'upper_triangle_uv': upper['uv'][ai].tolist(), 'fore_triangle_uv': fore['uv'][bi].tolist()}
            if index % (args.step * 12) == 0:
                print('ARM_ENVELOPE_PROGRESS', clip, frame, flush=True)
        summaries[clip] = summary
        print('ARM_ENVELOPE', clip, {key: (row['colliding_samples'], row['maximum_pairs'], len(row['unique_pairs'])) for key, row in summary.items()}, flush=True)
    assert modifier_error <= 2e-6, modifier_error
    (RUN / 'qa').mkdir(parents=True, exist_ok=True)
    report = {'status': 'source_armor_crossing_gate_failed_envelope_only', 'source_sha256': SOURCE_SHA, 'runtime_publish_allowed': False,
              'samples_per_frame': args.step, 'actual_modifier_max_error_m': modifier_error, 'inventory': inventory, 'clips': summaries,
              'parameter_policy': 'Raw original UV inverse [u=V/2.5,v=U/1.75]; independent provenance validation required before authoring',
              'limitations': ['Strict crossing excludes coplanar/tangential contacts and containment', 'Sampled time grid is not a continuous-time proof', 'Witness UVs require source correspondence confirmation']}
    (RUN / f'qa/envelope-step{args.step}.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print('ARM_ENVELOPE_COMPLETE', modifier_error, flush=True)


if __name__ == '__main__':
    main()
