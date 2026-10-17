"""Repair twelve reversed source LOD1 right-sleeve cap triangles only."""
import json
import sys
from pathlib import Path

import bpy
import bmesh

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from guard_armor_controlled_helpers import RUN as PREVIOUS, CANDIDATE as SOURCE, sha, curve_signature
from guard_hand_ik_repair import mesh_signature
from original_guard_shell_winding_math import closed_consistent_shell

RUN = PREVIOUS.with_name('2026-10-08-v33-armor-sleeve-winding')
SOURCE_SHA = '607772370e40e8c9a2cc63a4e520a962de13687b715d959b25f1a5ad238fc2df'


def uv_signature(mesh):
    return {p.index: {mesh.loops[i].vertex_index: list(mesh.uv_layers.active.data[i].uv) for i in p.loop_indices} for p in mesh.polygons}


def main():
    assert sha(SOURCE) == SOURCE_SHA
    report = json.loads((PREVIOUS/'qa/authoring.json').read_text(encoding='utf-8'))
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    obj = bpy.data.objects['GuardArms_LOD1']
    mesh = obj.data
    mesh.calc_loop_triangles()
    assert not closed_consistent_shell([t.vertices[:] for t in mesh.loop_triangles]), 'Expected frozen source winding defect'
    before_meshes, before_curves = mesh_signature(), curve_signature(False)
    vertices = [list(v.co) for v in mesh.vertices]
    weights = [[(g.group, g.weight) for g in v.groups] for v in mesh.vertices]
    faces = [list(p.vertices) for p in mesh.polygons]
    uv = uv_signature(mesh)
    flipped = list(range(150, 162))
    source_ids = [mesh.attributes['original_arm_vertex'].data[v.index].value for v in mesh.vertices]
    # These are exactly source faces810..821, two six-triangle end caps on
    # the R sleeve. Vertex coordinates, skin, UV per vertex, and seam stay fixed.
    assert all(all(vertices[v][0] > 0 for v in faces[i]) for i in flipped)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    for i in flipped:
        bm.faces[i].normal_flip()
    bm.to_mesh(mesh)
    bm.free()
    mesh.calc_loop_triangles()
    assert closed_consistent_shell([t.vertices[:] for t in mesh.loop_triangles])
    assert [list(v.co) for v in mesh.vertices] == vertices
    assert [[(g.group, g.weight) for g in v.groups] for v in mesh.vertices] == weights
    assert uv_signature(mesh) == uv, 'Per-face vertex UV correspondence changed'
    assert [mesh.attributes['original_arm_vertex'].data[v.index].value for v in mesh.vertices] == source_ids
    for i, polygon in enumerate(mesh.polygons):
        current = list(polygon.vertices)
        if i not in flipped:
            assert current == faces[i]
        else:
            assert set(current) == set(faces[i]) and current != faces[i]
    after_meshes = mesh_signature()
    assert all(after_meshes[n] == h for n, h in before_meshes.items() if n != obj.name)
    assert curve_signature(False) == before_curves
    candidate = RUN/'candidate/guard-controlled-armor.blend'
    candidate.parent.mkdir(parents=True, exist_ok=True)
    (RUN/'qa').mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(candidate))
    repair = {'status': 'saved_winding_repair_pending_full_reload_qa', 'runtime_publish_allowed': False,
              'source_sha256': SOURCE_SHA, 'candidate_sha256': sha(candidate), 'object': obj.name,
              'flipped_candidate_polygon_ids': flipped, 'original_source_polygon_ids': list(range(810, 822)),
              'original_source_vertex_triples': [[source_ids[v] for v in faces[i]] for i in flipped],
              'vertices_weights_uv_source_ids_unchanged': True, 'all_other_meshes_unchanged': True,
              'all_action_curves_unchanged': True, 'closed_consistent_shell_after': True,
              'recipe_sha256': sha(Path(__file__))}
    (RUN/'qa/sleeve-cap-repair.json').write_text(json.dumps(repair, indent=2)+'\n', encoding='utf-8', newline='\n')
    report['candidate_sha256'] = sha(candidate)
    report['predecessor_candidate_sha256'] = SOURCE_SHA
    report['sleeve_winding_repair'] = 'qa/sleeve-cap-repair.json'
    report['recipe_sha256']['guard_armor_sleeve_cap_fix.py'] = sha(Path(__file__))
    (RUN/'qa/authoring.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8', newline='\n')
    print('SLEEVE_CAP_REPAIRED', repair['candidate_sha256'], flush=True)


if __name__ == '__main__':
    main()
