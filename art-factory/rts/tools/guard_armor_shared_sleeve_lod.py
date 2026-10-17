"""Use the same authored left cloth surface in both LODs, without resampling skin."""
import json
import sys
from pathlib import Path

import bpy
import numpy as np

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from guard_armor_controlled_helpers import BASE, sha, curve_signature
from guard_hand_ik_repair import mesh_signature
from guard_armor_relief_inventory import components
from original_guard_shell_winding_math import closed_consistent_shell

PREVIOUS = BASE/'2026-10-09-v34-left-sleeve-relief'
RUN = BASE/'2026-10-09-v35-shared-left-cloth-lod'
SOURCE = PREVIOUS/'candidate/guard-controlled-armor.blend'
SOURCE_SHA = '6131217091431e0fcb9165afaf75b653908de5593c4d83a5a0b821eb27f3075c'


def island_record(obj, left):
    mesh = obj.data
    ids = next(part for part in components(mesh) if (mesh.vertices[part[0]].co.x < 0) == left)
    owned = set(ids)
    return {'vertices': [list(mesh.vertices[i].co) for i in ids],
        'source_ids': [mesh.attributes['original_arm_vertex'].data[i].value for i in ids],
        'weights': [{obj.vertex_groups[g.group].name: g.weight for g in mesh.vertices[i].groups} for i in ids],
        'faces': [[ids.index(i) for i in p.vertices] for p in mesh.polygons if p.vertices[0] in owned],
        'uv': [[list(mesh.uv_layers.active.data[i].uv) for i in p.loop_indices] for p in mesh.polygons if p.vertices[0] in owned],
        'materials': [mesh.materials[p.material_index].name for p in mesh.polygons if p.vertices[0] in owned],
        'smooth': [p.use_smooth for p in mesh.polygons if p.vertices[0] in owned],
        'vertex_normals': [list(mesh.vertices[i].normal) for i in ids]}


def main():
    assert sha(SOURCE) == SOURCE_SHA
    candidate = RUN/'candidate/guard-controlled-armor.blend'
    assert not candidate.exists(), 'Do not overwrite a saved candidate'
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    obj, donor = bpy.data.objects['GuardArms_LOD1'], bpy.data.objects['GuardArms_LOD0']
    assert np.array_equal(np.array(obj.matrix_world), np.array(donor.matrix_world))
    assert not obj.data.has_custom_normals and not donor.data.has_custom_normals
    assert len(obj.data.uv_layers) == len(donor.data.uv_layers) == 1
    before_meshes, before_curves = mesh_signature(), curve_signature(False)
    right, left, old_left = island_record(obj, False), island_record(donor, True), island_record(obj, True)
    assert set(left['source_ids']) == set(range(1324, 1474))
    assert set(old_left['source_ids']) == set(range(517, 574))
    assert len(left['faces']) == 296 and len(old_left['faces']) == 110
    material_names = [material.name for material in obj.data.materials]
    group_names = [group.name for group in obj.vertex_groups]
    assert all(name in material_names for name in left['materials'])
    assert all(name in group_names for weights in left['weights'] for name in weights)
    source_mesh = obj.data
    mesh = bpy.data.meshes.new('Original shared left cloth LOD1')
    positions = right['vertices'] + left['vertices']
    offset = len(right['vertices'])
    faces = right['faces'] + [[i+offset for i in face] for face in left['faces']]
    mesh.from_pydata(positions, [], faces)
    for material in source_mesh.materials:
        mesh.materials.append(material)
    uv = mesh.uv_layers.new(name=source_mesh.uv_layers.active.name)
    for polygon, coords, material, smooth in zip(mesh.polygons, right['uv']+left['uv'], right['materials']+left['materials'], right['smooth']+left['smooth']):
        polygon.material_index = material_names.index(material)
        polygon.use_smooth = smooth
        for i, value in zip(polygon.loop_indices, coords):
            uv.data[i].uv = value
    source_id = mesh.attributes.new('original_arm_vertex', 'INT', 'POINT')
    for i, value in enumerate(right['source_ids']+left['source_ids']):
        source_id.data[i].value = value
    obj.data = mesh
    obj.vertex_groups.clear()
    groups = {name: obj.vertex_groups.new(name=name) for name in group_names}
    for i, weights in enumerate(right['weights']+left['weights']):
        for name, weight in weights.items():
            groups[name].add([i], weight, 'REPLACE')
    mesh.update()
    mesh.calc_loop_triangles()
    assert len(mesh.vertices) == 207 and len(mesh.loop_triangles) == 406
    assert closed_consistent_shell([tuple(t.vertices) for t in mesh.loop_triangles])
    right_after, left_after = island_record(obj, False), island_record(obj, True)
    normal_error = 0.
    for expected, actual in ((right, right_after), (left, left_after)):
        normal_error = max(normal_error, float(np.max(abs(np.array(actual.pop('vertex_normals'))-np.array(expected.pop('vertex_normals'))))))
        assert actual == expected, 'Transferred position/topology/winding/UV/material/skin/sourceID differs'
    assert normal_error < 1e-6
    assert all(mesh_signature()[name] == value for name, value in before_meshes.items() if name != obj.name)
    assert curve_signature(False) == before_curves
    candidate.parent.mkdir(parents=True, exist_ok=True)
    (RUN/'qa').mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(candidate))
    result = {'status': 'authored_pending_actual_modifier_full_sweep_and_interface_visual', 'runtime_publish_allowed': False,
        'source_sha256': SOURCE_SHA, 'candidate_sha256': sha(candidate), 'target': obj.name, 'donor': donor.name,
        'replaced_source_ids': old_left['source_ids'], 'shared_source_ids': left['source_ids'],
        'vertices': len(mesh.vertices), 'triangles': len(mesh.loop_triangles), 'delta_vertices': 93, 'delta_triangles': 186,
        'same_right_sleeve_and_exact_donor_left_position_topology_uv_material_skin': True,
        'maximum_vertex_normal_component_difference': normal_error, 'all_other_meshes_and_actions_unchanged': True,
        'interface_policy': 'Shared donor14vertex shoulder UpperArm_L=1 and14vertex wrist Forearm_L=1 replace old coarse8vertex interfaces as a coherent cloth component; no graft/corrective animation. Body/hand visual seams remain to inspect.',
        'recipe_sha256': sha(Path(__file__))}
    (RUN/'qa/shared-sleeve-authoring.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8', newline='\n')
    report = json.loads((PREVIOUS/'qa/authoring.json').read_text(encoding='utf-8'))
    report.update(candidate_sha256=sha(candidate), predecessor_candidate_sha256=SOURCE_SHA, shared_sleeve='qa/shared-sleeve-authoring.json')
    report['recipe_sha256']['guard_armor_shared_sleeve_lod.py'] = sha(Path(__file__))
    (RUN/'qa/authoring.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8', newline='\n')
    print('SHARED_LEFT_CLOTH_LOD_SAVED', sha(candidate), flush=True)


if __name__ == '__main__':
    main()
