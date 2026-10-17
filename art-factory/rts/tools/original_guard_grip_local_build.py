"""One bounded local source projection on the frozen low-poly glove."""
from pathlib import Path
import hashlib
import json
import sys
import bpy
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_grip_local_inspect import RUN, LOW_RUN, SOURCE, sha
from original_guard_grip_local_math import unchanged_points
from original_guard_grip_low_build import mesh_fingerprint


def main():
    roi_path = RUN / 'qa/roi-before.json'
    roi = json.loads(roi_path.read_text(encoding='utf8'))
    assert sha(LOW_RUN / 'candidate/original-guard-grip-low.blend') == roi['source_low_blend_sha256']
    assert sha(SOURCE) == roi['source_fit_blend_sha256']
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    high = bpy.data.objects['OriginalGripRigidFitReviewOnly']
    assert mesh_fingerprint(high.data) == roi['source_high_mesh_fingerprint']
    high.data.calc_loop_triangles()
    high_world = [tuple(high.matrix_world @ v.co) for v in high.data.vertices]
    high_faces = [tuple(t.vertices) for t in high.data.loop_triangles]
    tree = BVHTree.FromPolygons(high_world, high_faces, all_triangles=True)
    bpy.ops.wm.open_mainfile(filepath=str(LOW_RUN / 'candidate/original-guard-grip-low.blend'))
    glove = bpy.data.objects['OriginalGripLowCandidate']
    sword = bpy.data.objects['KingdomSteelSword_LOD0']
    sword_fingerprint = mesh_fingerprint(sword.data)
    old = [tuple(v.co) for v in glove.data.vertices]
    before_matrix = [list(row) for row in glove.matrix_world]
    perimeter = sorted({v for g in roi['groups'].values() for v in g['perimeter_vertices']})
    protected = sorted({v for g in roi['groups'].values() for v in g['protected_in_region']})
    bm = bmesh.new()
    bm.from_mesh(glove.data)
    bm.faces.ensure_lookup_table()
    bm.faces.index_update()
    # The frozen ROI contains only original triangle indices; no growth occurs.
    targets = [bm.faces[i] for i in roi['union_region_faces']]
    inverse = glove.matrix_world.inverted()
    movement = []
    for face in targets:
        local_centre = face.calc_center_median()
        world_centre = glove.matrix_world @ local_centre
        nearest = tree.find_nearest(world_centre)
        if nearest[0] is None:
            raise ValueError('Missing high-poly correspondence')
        result = bmesh.ops.poke(bm, faces=[face], offset=0.)
        centre = result['verts'][0]
        centre.co = inverse @ nearest[0]
        movement.append({'original_face': int(roi['union_region_faces'][len(movement)]),
                         'source_face': int(nearest[2]),
                         'offset_m': float((nearest[0] - world_centre).length),
                         'original_centre_world_m': list(world_centre),
                         'projected_centre_world_m': list(nearest[0])})
    bm.to_mesh(glove.data)
    bm.free()
    glove.data.update()
    new = [tuple(v.co) for v in glove.data.vertices]
    if not unchanged_points(old, new, perimeter + protected):
        raise ValueError('Fixed perimeter/protected point changed')
    if not unchanged_points(old, new, range(len(old))):
        raise ValueError('Original point changed or disappeared')
    glove.data.calc_loop_triangles()
    triangles = len(glove.data.loop_triangles)
    if triangles > 12500:
        raise ValueError(f'Triangle ceiling exceeded: {triangles}')
    if mesh_fingerprint(sword.data) != sword_fingerprint or [list(row) for row in glove.matrix_world] != before_matrix:
        raise ValueError('Sword or glove transform changed')
    candidate = RUN / 'candidate'
    candidate.mkdir(parents=True, exist_ok=True)
    blend = candidate / 'original-guard-grip-local.blend'
    glb = candidate / 'original-guard-grip-local.glb'
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=False, export_animations=False)
    report = {'status': 'built_pending_qa', 'runtime_publish_allowed': False,
              'source_low_blend_sha256': roi['source_low_blend_sha256'],
              'source_fit_blend_sha256': roi['source_fit_blend_sha256'],
              'source_high_mesh_fingerprint': roi['source_high_mesh_fingerprint'],
              'source_sword_mesh_fingerprint': sword_fingerprint,
              'candidate_sword_mesh_fingerprint': mesh_fingerprint(sword.data),
              'fixed_original_vertices_bitexact': len(old),
              'fixed_perimeter_vertices': len(perimeter),
              'fixed_protected_vertices_in_roi': len(protected),
              'edited_original_faces': len(targets),
              'inserted_vertices': len(new)-len(old),
              'triangles_before': roi['low_triangles'], 'triangles_after': triangles,
              'projection_records': movement,
              'candidate_blend_sha256': sha(blend), 'candidate_glb_sha256': sha(glb)}
    (RUN / 'qa/build.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
    print('LOCAL_BUILD', json.dumps({k:v for k,v in report.items() if k not in ('projection_records',)}), flush=True)


if __name__ == '__main__':
    main()
