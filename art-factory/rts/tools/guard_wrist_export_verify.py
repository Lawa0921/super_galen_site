"""Export the frozen wrist repair and capture dense Blender parity references.

Diagnostic-only geometry exports. No source save or runtime asset replacement.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from original_guard_walk_refine import action_fcurves

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / 'art-factory/rts/runs/guard-right-hand-cage'
SOURCE = BASE / '2026-10-08-v15-wrist-motion-exact-curves/candidate/guard-wrist-motion.blend'
SOURCE_SHA = '6d2d2dcd1ecd9795ff2246a9ce079150aa19b53ebc97d7238ca7d762614361c4'
CLIPS = ('Idle', 'Walk', 'Attack', 'Hurt', 'Death')
STEP = 256


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def curve_signature():
    return hashlib.sha256(json.dumps([
        [a.name, [[f.data_path, f.array_index,
                   [[list(k.co), list(k.handle_left), list(k.handle_right), k.interpolation]
                    for k in f.keyframe_points]] for f in action_fcurves(a)]]
        for a in bpy.data.actions], sort_keys=True).encode()).hexdigest()


def main():
    global SOURCE, SOURCE_SHA
    parser = argparse.ArgumentParser()
    parser.add_argument('--sampled', action='store_true')
    parser.add_argument('--skip-reference', action='store_true')
    parser.add_argument('--tabard-repair', action='store_true')
    parser.add_argument('--source-identities', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    run = BASE / '2026-10-08-v16-wrist-export'
    if args.tabard_repair:
        SOURCE = BASE / '2026-10-08-v17-tabard-continuity/candidate/guard-tabard-continuity.blend'
        SOURCE_SHA = 'cb1f0bf304b82b27792b7fe57abcdc4ff2ed48f302d9dcd97531652096f5a751'
        run = BASE / '2026-10-08-v18-wrist-export-continuity'
        if args.source_identities:
            run = BASE / '2026-10-08-v19-wrist-export-exact-skin'
    for folder in ('candidate', 'qa', 'raw'):
        (run / folder).mkdir(parents=True, exist_ok=True)
    assert sha(SOURCE) == SOURCE_SHA
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    rig, scene = bpy.data.objects['GuardRig20'], bpy.context.scene
    assert rig['canonical_wrist_motion_repair'] == 'v1'
    rig.data.pose_position = 'POSE'
    scene.render.fps, scene.render.fps_base = 30, 1
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.endswith(('LOD0', 'LOD1'))]
    assert not any(b.constraints for b in rig.pose.bones)
    assert set(a.name for a in bpy.data.actions) == set(CLIPS)
    assert not rig.animation_data.nla_tracks and not rig.animation_data.drivers
    identity = np.eye(4)
    assert np.max(np.abs(np.asarray(rig.matrix_world) - identity)) < 1e-8
    assert len(meshes) == len([o for o in bpy.data.objects if o.type == 'MESH'])
    for obj in meshes:
        assert np.max(np.abs(np.asarray(obj.matrix_world) - identity)) < 1e-8
        assert len(obj.modifiers) == 1 and obj.modifiers[0].type == 'ARMATURE' and obj.modifiers[0].object == rig
        assert not obj.data.shape_keys
    signature = curve_signature()
    bone_names = [b.name for b in rig.pose.bones]
    inverses = {b.name: b.matrix_local.inverted() for b in rig.data.bones}
    if not args.skip_reference:
        chunks, clips, witnesses = [], [], []
        offset = 0
        for clip in CLIPS:
            action = bpy.data.actions[clip]
            rig.animation_data.action = action
            end = float(action.frame_range[1])
            assert float(action.frame_range[0]) == 0
            count = round(end * STEP) + 1
            values = np.empty((count, len(bone_names), 4, 4), dtype='<f4')
            for index in range(count):
                frame = index / STEP
                scene.frame_set(math.floor(frame), subframe=frame % 1)
                for bi, name in enumerate(bone_names):
                    values[index, bi] = np.asarray(rig.pose.bones[name].matrix @ inverses[name])
            chunks.append(values)
            clips.append({'name': clip, 'count': count, 'offset': offset, 'end_frame': end, 'duration_seconds': end / 30})
            offset += count
            times = sorted(set([0, end * .1234567, end * .25, end * .5, end * .7654321, end] +
                               ([12.83203125, 13.09375, 13.1217, 15.5] if clip == 'Attack' else [])))
            for frame in times:
                scene.frame_set(math.floor(frame), subframe=frame % 1)
                depsgraph = bpy.context.evaluated_depsgraph_get()
                row = {'clip': clip, 'frame': frame, 'objects': {}, 'skin_matrices': {}}
                for name in bone_names:
                    row['skin_matrices'][name] = [list(r) for r in (rig.pose.bones[name].matrix @ inverses[name])]
                for obj in meshes:
                    evaluated = obj.evaluated_get(depsgraph)
                    mesh = evaluated.to_mesh()
                    points = np.empty(len(mesh.vertices) * 3, dtype=np.float32)
                    mesh.vertices.foreach_get('co', points)
                    points = points.reshape(-1, 3)
                    matrix = np.asarray(evaluated.matrix_world)
                    points = points @ matrix[:3, :3].T + matrix[:3, 3]
                    row['objects'][obj.name] = {'min': points.min(axis=0).tolist(), 'max': points.max(axis=0).tolist()}
                    evaluated.to_mesh_clear()
                witnesses.append(row)
            print('EXPORT_REFERENCE', clip, count, flush=True)
        binary = run / 'qa/blender-skin-matrices.f32'
        np.concatenate(chunks).tofile(binary)
        metadata = {'source_sha256': SOURCE_SHA, 'bones': bone_names, 'clips': clips, 'step_per_frame': STEP,
                    'fps': 30, 'matrix_order': 'row_major', 'matrix_space': 'Blender world skin', 'dtype': 'little-endian float32',
                    'binary_sha256': sha(binary), 'samples': offset, 'runtime_publish_allowed': False}
        (run / 'qa/blender-reference.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
        (run / 'qa/blender-pose-extrema.json').write_text(json.dumps(witnesses, separators=(',', ':')) + '\n', encoding='utf-8')
    else:
        metadata = json.loads((run / 'qa/blender-reference.json').read_text(encoding='utf-8'))
        assert metadata['source_sha256'] == SOURCE_SHA
        assert metadata['binary_sha256'] == sha(run / 'qa/blender-skin-matrices.f32')
        assert metadata['pose_extrema_sha256'] == sha(run / 'qa/blender-pose-extrema.json')
    # A convex per-bone rest box provides a conservative bound on every
    # skinned vertex's error, not only on selected bone matrix components.
    influence_points = {name: [] for name in bone_names}
    static_meshes = {}
    maximum_influences, maximum_weight_error = 0, 0.
    for obj in meshes:
        static_vertices = []
        for vertex in obj.data.vertices:
            active = [(obj.vertex_groups[g.group].name, g.weight) for g in vertex.groups
                      if g.weight > 0 and obj.vertex_groups[g.group].name in influence_points]
            assert active, (obj.name, vertex.index, 'unbound vertex')
            maximum_influences = max(maximum_influences, len(active))
            maximum_weight_error = max(maximum_weight_error, abs(sum(w for _, w in active) - 1))
            point = list(obj.matrix_world @ vertex.co)
            total = sum(w for _, w in active)
            static_vertices.append({'position': [point[0], point[2], -point[1]], 'weights': sorted([[name, weight / total] for name, weight in active])})
            for name, weight in active:
                influence_points[name].append(point)
        obj.data.calc_loop_triangles()
        static_meshes[obj.name] = {'vertices': static_vertices, 'triangles': [list(t.vertices) for t in obj.data.loop_triangles]}
    assert maximum_influences <= 4 and maximum_weight_error < 1e-6
    metadata['bone_rest_bounds'] = {name: {'min': np.min(points, axis=0).tolist(), 'max': np.max(points, axis=0).tolist()}
                                     for name, points in influence_points.items() if points}
    metadata['weight_normalization_max_error'] = maximum_weight_error
    metadata['maximum_vertex_influences'] = maximum_influences
    metadata['source_vertex_identity_required'] = args.source_identities
    static_path = run / 'qa/blender-static-skin.json'
    static_path.write_text(json.dumps(static_meshes, separators=(',', ':')) + '\n', encoding='utf-8')
    metadata['static_skin_sha256'] = sha(static_path)
    metadata['pose_extrema_sha256'] = sha(run / 'qa/blender-pose-extrema.json')
    metadata['bone_rest_matrices'] = {bone.name: [list(row) for row in bone.matrix_local] for bone in rig.data.bones}
    (run / 'qa/blender-reference.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
    # The exporter drops <=1e-4 weights. Carry explicit source identity through
    # seam splits so a candidate postprocess can restore the original vectors.
    for obj in meshes if args.source_identities else []:
        assert '_RTS_SOURCE_VERTEX' not in obj.data.attributes
        attribute = obj.data.attributes.new(name='_RTS_SOURCE_VERTEX', type='FLOAT', domain='POINT')
        attribute.data.foreach_set('value', np.arange(len(obj.data.vertices), dtype=np.float32))
    rig.animation_data.action = bpy.data.actions['Idle']
    scene.frame_set(0)
    outputs = []
    mode = 'sampled' if args.sampled else 'direct'
    for lod in (0, 1):
        bpy.ops.object.select_all(action='DESELECT')
        selected = [rig] + [o for o in meshes if o.name.endswith('LOD' + str(lod))]
        for obj in selected:
            obj.hide_set(False)
            obj.hide_viewport = obj.hide_render = False
            obj.select_set(True)
        bpy.context.view_layer.objects.active = rig
        target = run / f'candidate/guard-wrist-{mode}-lod{lod}.glb'
        bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB', use_selection=True,
                                  export_animations=True, export_animation_mode='ACTIONS',
                                  export_force_sampling=args.sampled, export_optimize_animation_size=False,
                                  export_materials='NONE', export_skins=True, export_yup=True,
                                  export_def_bones=True, export_extras=True, export_attributes=True)
        outputs.append({'lod': lod, 'file': target.name, 'sha256': sha(target), 'bytes': target.stat().st_size})
    assert curve_signature() == signature, 'Exporter changed source animation curves in memory'
    assert sha(SOURCE) == SOURCE_SHA
    report = {'status': 'exported_pending_actual_three_interpolation', 'runtime_publish_allowed': False,
              'source_sha256': SOURCE_SHA, 'protected_curve_signature': signature, 'exports': outputs,
              'mode': mode, 'materials': 'NONE: geometry/skeleton diagnostic, not a final material export',
              'sampling_forced': args.sampled, 'animation_optimization': False}
    (run / f'qa/export-{mode}.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print('EXPORT_COMPLETE', json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
