"""Real Blender deformation regression for the original crossbow waist repair.

The belt witness uses existing edges, not an implementation formula. Preserve
the prior source when comparing; this script never saves a loaded blend.
"""
import bpy
import hashlib
import json
import math
import os
import sys


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def snapshot():
    meshes = {}
    for obj in bpy.data.objects:
        if obj.type != 'MESH':
            continue
        mesh = obj.data
        meshes[obj.name] = {
            'geometry': digest([[list(v.co) for v in mesh.vertices],
                                [list(p.vertices) for p in mesh.polygons],
                                [list(d.uv) for layer in mesh.uv_layers for d in layer.data],
                                [p.material_index for p in mesh.polygons]]),
            'weights': [{obj.vertex_groups[g.group].name: g.weight for g in v.groups}
                        for v in mesh.vertices],
            'coordinates': [tuple(v.co) for v in mesh.vertices],
        }
    rig = bpy.data.objects['crossbowRig20']
    bones = {b.name: [b.parent.name if b.parent else None,
                     [x for row in b.matrix_local for x in row]] for b in rig.data.bones}
    actions = {}
    for action in bpy.data.actions:
        curves = [fc for layer in action.layers for strip in layer.strips
                  for slot in action.slots for bag in [strip.channelbag(slot)]
                  if bag for fc in bag.fcurves]
        actions[action.name] = [[fc.data_path, fc.array_index,
                                [[list(k.co), list(k.handle_left), list(k.handle_right), k.interpolation]
                                 for k in fc.keyframe_points]] for fc in curves]
    images = {i.name: hashlib.sha256(i.packed_file.data).hexdigest()
              for i in bpy.data.images if i.packed_file}
    return {'meshes': meshes, 'bones': bones, 'actions': actions, 'images': images}


def measure_belt():
    rig = bpy.data.objects['crossbowRig20']
    result = {}
    for lod in (0, 1):
        obj = bpy.data.objects[f'crossbowOriginalBody_LOD{lod}']
        edges = []
        for edge in obj.data.edges:
            a, b = [obj.data.vertices[i].co for i in edge.vertices]
            if all(.86 < v.z < .995 and abs(v.x) < .265 for v in (a, b)):
                length = (a - b).length
                if length > .001:
                    edges.append((tuple(edge.vertices), length))
        assert len(edges) > 100, 'A missing or empty belt is not a passing test'
        worst = {'relative_strain': 0.0}
        samples = 0
        for name in ('Idle', 'Walk', 'Attack', 'Hurt', 'Death'):
            action = bpy.data.actions[name]
            rig.animation_data.action = action
            if action.slots:
                rig.animation_data.action_slot = action.slots[0]
            start, end = action.frame_range
            for n in range(round((end - start) * 2) + 1):
                frame = start + n / 2
                bpy.context.scene.frame_set(int(frame), subframe=frame % 1)
                bpy.context.view_layer.update()
                evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
                mesh = evaluated.to_mesh()
                for (i, j), rest in edges:
                    length = (mesh.vertices[i].co - mesh.vertices[j].co).length
                    strain = abs(length / rest - 1)
                    if strain > worst['relative_strain']:
                        worst = {'relative_strain': strain, 'clip': name, 'frame': frame,
                                 'vertices': [i, j], 'rest_m': rest, 'posed_m': length}
                evaluated.to_mesh_clear()
                samples += 1
        result[str(lod)] = {'edge_count': len(edges), 'sample_count': samples, 'worst': worst}
    return result


def main():
    source, candidate, out = sys.argv[sys.argv.index('--') + 1:][:3]
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(source))
    before = snapshot()
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(candidate))
    after = snapshot()
    checks = {key + '_unchanged': before[key] == after[key] for key in ('bones', 'actions', 'images')}
    checks['all_geometry_uv_and_material_indices_unchanged'] = (
        before['meshes'].keys() == after['meshes'].keys() and
        all(before['meshes'][name]['geometry'] == item['geometry'] for name, item in after['meshes'].items()))
    changed = {}
    protected_arms = True
    valid_weights = True
    for name, old in before['meshes'].items():
        rows = [i for i, (a, b) in enumerate(zip(old['weights'], after['meshes'][name]['weights'])) if a != b]
        changed[name] = len(rows)
        for i in rows:
            x, y, z = old['coordinates'][i]
            assert 'Body' in name and .66 < z < 1.21 and abs(x) < .325, (name, i, 'outside waist scope')
            protected_arms &= not any(('Arm' in g or 'Hand' in g or 'Shoulder' in g) and w > 1e-7
                                      for g, w in old['weights'][i].items())
            weights = after['meshes'][name]['weights'][i]
            valid_weights &= (len(weights) <= 4 and abs(sum(weights.values()) - 1) < 1e-6 and
                              all(math.isfinite(w) and 0 < w <= 1 for w in weights.values()))
    checks['protected_objects_and_weights_unchanged'] = all(
        count == 0 for name, count in changed.items() if 'Body' not in name)
    checks['all_previously_arm_weighted_vertices_unchanged'] = protected_arms
    checks['repaired_weights_normalized_finite_and_four_influences'] = valid_weights
    belt = measure_belt()
    checks['belt_edges_rigid_within_one_percent'] = all(
        item['worst']['relative_strain'] < .01 for item in belt.values())
    report = {'source_sha256': hashlib.sha256(open(source, 'rb').read()).hexdigest(),
              'candidate_sha256': hashlib.sha256(open(candidate, 'rb').read()).hexdigest(),
              'checks': checks, 'changed_weight_vertices': changed, 'belt': belt,
              'pass': all(checks.values()), 'runtime_publish_allowed': False}
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, 'w') as f:
        json.dump(report, f, indent=2)
    print('WAIST_REGRESSION', json.dumps(report))
    assert report['pass'], 'Waist deformation or preservation regression; see report'


if __name__ == '__main__':
    main()
