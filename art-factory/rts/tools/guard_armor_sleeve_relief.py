"""Author the independently measured 10 mm finite left inner-elbow cloth relief."""
import json
import sys
from pathlib import Path

import bpy
import numpy as np

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from guard_armor_controlled_helpers import BASE, sha, curve_signature
from guard_hand_ik_repair import mesh_signature
from guard_armor_sleeve_cap_fix import uv_signature
from sleeve_relief_math import relief_weights

PREVIOUS = BASE/'2026-10-08-v33-armor-sleeve-winding'
RUN = BASE/'2026-10-09-v34-left-sleeve-relief'
SOURCE = PREVIOUS/'candidate/guard-controlled-armor.blend'
SOURCE_SHA = '5b0ed1b075a655e4e844ded9a41a1d0fb2b21958be7d6b2ac43df1a02efd9d8d'
CORE = [set(range(1386, 1391)) | set(range(1397, 1400)) | set(range(1407, 1410)) | set(range(1413, 1418)) | set(range(1431, 1434)), {539, 546, 547, 548, 556, 563}]
SAFE = [set(range(1374, 1380)) | {1384} | set(range(1386, 1392)) | set(range(1397, 1401)) | set(range(1406, 1419)) | set(range(1429, 1435)) | set(range(1441, 1445)), {528, 529, 536, 537, 538, 539, 545, 546, 547, 548, 549, 555, 556, 560, 562, 563}]


def main():
    assert sha(SOURCE) == SOURCE_SHA
    candidate = RUN/'candidate/guard-controlled-armor.blend'
    assert not candidate.exists(), 'Do not overwrite an authored candidate'
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    before_meshes, before_curves = mesh_signature(), curve_signature(False)
    rig = bpy.data.objects['GuardRig20']
    rest = {bone.name: [list(row) for row in bone.matrix_local] for bone in rig.data.bones}
    records = {}
    for lod in (0, 1):
        obj = bpy.data.objects['GuardArms_LOD'+str(lod)]
        mesh = obj.data
        points = np.array([v.co[:] for v in mesh.vertices])
        faces = [list(p.vertices) for p in mesh.polygons]
        uv = uv_signature(mesh)
        weights = [[(g.group, g.weight) for g in v.groups] for v in mesh.vertices]
        source_ids = [d.value for d in mesh.attributes['original_arm_vertex'].data]
        relief = relief_weights(points, [tuple(e.vertices) for e in mesh.edges], source_ids, SAFE[lod], CORE[lod])
        moved = np.flatnonzero(relief > 1e-12)
        assert len(moved) == (19 if lod == 0 else 6), (lod, len(moved))
        assert all(points[i, 0] < 0 and source_ids[i] in SAFE[lod] for i in moved)
        for i in moved:
            mesh.vertices[int(i)].co.y -= .01 * relief[i]
        actual = np.array([v.co[:] for v in mesh.vertices])
        expected = points.copy()
        expected[:, 1] -= .01 * relief
        assert abs(actual - expected).max() < 1e-8
        assert [list(p.vertices) for p in mesh.polygons] == faces
        assert uv_signature(mesh) == uv
        assert [[(g.group, g.weight) for g in v.groups] for v in mesh.vertices] == weights
        assert [d.value for d in mesh.attributes['original_arm_vertex'].data] == source_ids
        records[obj.name] = {'moved_original_vertex_ids': [source_ids[i] for i in moved],
            'relief_weights': [float(relief[i]) for i in moved], 'max_actual_displacement_m': float(np.linalg.norm(actual-points, axis=1).max()),
            'safe_source_ids': sorted(SAFE[lod]), 'core_source_ids': sorted(CORE[lod]),
            'fixed_boundary_and_outside_exact': bool(np.array_equal(actual[relief == 0], points[relief == 0])),
            'topology_uv_weights_source_ids_unchanged': True}
    after_meshes = mesh_signature()
    assert all(after_meshes[n] == value for n, value in before_meshes.items() if n not in records)
    assert curve_signature(False) == before_curves
    assert {bone.name: [list(row) for row in bone.matrix_local] for bone in rig.data.bones} == rest
    candidate.parent.mkdir(parents=True, exist_ok=True)
    (RUN/'qa').mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(candidate))
    result = {'status': 'authored_pending_actual_modifier_and_visual_qa', 'runtime_publish_allowed': False,
        'source_sha256': SOURCE_SHA, 'candidate_sha256': sha(candidate), 'objects': records,
        'all_other_meshes_unchanged': True, 'all_actions_and_bone_rest_matrices_unchanged': True,
        'recipe_sha256': {name: sha(Path(__file__).parent/name) for name in ('guard_armor_sleeve_relief.py', 'sleeve_relief_math.py')},
        'independent_feasibility': '10mm passed5 discrete poses bothLOD,20mm rejected for Idle/Attack self-intersection; feasibility does not approve this saved candidate'}
    (RUN/'qa/sleeve-relief-authoring.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8', newline='\n')
    report = json.loads((PREVIOUS/'qa/authoring.json').read_text(encoding='utf-8'))
    report['candidate_sha256'] = sha(candidate)
    report['predecessor_candidate_sha256'] = SOURCE_SHA
    report['sleeve_relief'] = 'qa/sleeve-relief-authoring.json'
    report['recipe_sha256'].update(result['recipe_sha256'])
    (RUN/'qa/authoring.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8', newline='\n')
    print('LEFT_SLEEVE_RELIEF_SAVED', sha(candidate), flush=True)


if __name__ == '__main__':
    main()
