"""Freeze exact local face and perimeter evidence before any edit."""
from pathlib import Path
import hashlib
import json
import sys
import bpy
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_grip_low_build import RUN as LOW_RUN, SOURCE, CHANNEL_ORIGIN, CHANNEL_AXIS, CHANNEL_RADIUS, PROTECTED_TOLERANCE, PROTECTED_Z, mesh_fingerprint
from original_guard_grip_low_math import protected_channel_mask, protected_failure_neighborhood_mask
from original_guard_grip_local_math import repair_region

RUN = Path(__file__).resolve().parents[1] / 'runs/original-guard-grip-local/2026-10-05'
GROUPS = {
    'main': [6235, 6241, 6247, 6243, 6353, 6352, 6743, 6742, 6244, 6333, 6332, 6335, 6720],
    'pair-202': [202, 945], 'pair-1205': [1205, 1208],
    'pair-3248': [3248, 3340], 'sliver-3285': [3285, 7267],
    'sliver-7856': [7856, 10223],
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    low = LOW_RUN / 'candidate/original-guard-grip-low.blend'
    assert sha(low) == 'f73f309fc7a1c2af29006336c20f20c975471c595f214a3942e2d94d70a63ef0'
    assert sha(SOURCE) == '123ad986465e79a26a685eefa9c5da9043f27ce984036ce178b783c103213281'
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    high_obj = bpy.data.objects['OriginalGripRigidFitReviewOnly']
    high_points = np.asarray([tuple(v.co) for v in high_obj.data.vertices], dtype=np.float32)
    channel = protected_channel_mask(high_points.astype(float), CHANNEL_ORIGIN, CHANNEL_AXIS, CHANNEL_RADIUS, PROTECTED_TOLERANCE, PROTECTED_Z)
    first = json.loads((LOW_RUN / 'rejected/attempt-1/geometry.json').read_text(encoding='utf8'))
    centres = ([r['source_local_center_m'] for r in first['metrics']['local_face_flip_records']]
               + [r['low_source_local_center_m'] for r in first['crossing_records']])
    failure = protected_failure_neighborhood_mask(high_points.astype(float), centres, .002)
    protected_points = {tuple(p) for p in high_points[channel | failure]}
    high_fingerprint = mesh_fingerprint(high_obj.data)
    bpy.ops.wm.open_mainfile(filepath=str(low))
    glove = bpy.data.objects['OriginalGripLowCandidate']
    glove.data.calc_loop_triangles()
    faces = np.asarray([tuple(tri.vertices) for tri in glove.data.loop_triangles], dtype=int)
    local = np.asarray([tuple(v.co) for v in glove.data.vertices], dtype=np.float32)
    protected = {i for i, p in enumerate(local) if tuple(p) in protected_points}
    assert len(protected) == 4302, len(protected)
    groups = {}
    union = set()
    for name, seeds in GROUPS.items():
        item = repair_region(faces, seeds, protected)
        item['perimeter_coordinates_local_m'] = {str(v): local[v].tolist() for v in item['perimeter_vertices']}
        item['protected_coordinates_local_m'] = {str(v): local[v].tolist() for v in item['protected_in_region']}
        groups[name] = item
        union.update(item['region_faces'])
    result = {
        'source_low_blend_sha256': sha(low), 'source_fit_blend_sha256': sha(SOURCE),
        'source_high_mesh_fingerprint': high_fingerprint,
        'low_mesh_fingerprint': mesh_fingerprint(glove.data),
        'channel_wall_vertex_count': int(channel.sum()),
        'protected_input_vertex_count': len(protected),
        'low_triangles': len(faces), 'low_vertices': len(local),
        'groups': groups, 'union_region_faces': sorted(union),
    }
    target = RUN / 'qa/roi-before.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
    print('ROI_INSPECT', json.dumps({name: {'faces': len(item['region_faces']), 'editable': len(item['editable_vertices']), 'protected': len(item['protected_in_region']), 'perimeter': len(item['perimeter_vertices'])} for name,item in groups.items()}), flush=True)


if __name__ == '__main__':
    main()
