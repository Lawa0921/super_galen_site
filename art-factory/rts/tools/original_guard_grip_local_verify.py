"""Frozen baseline comparisons for the same-ROI edge-flip candidate."""
from pathlib import Path
import hashlib
import json
import sys
import bpy
import numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from original_guard_grip_local_inspect import RUN,LOW_RUN,SOURCE,sha
from original_guard_grip_low_build import CHANNEL_AXIS,CHANNEL_ORIGIN,mesh_fingerprint
from original_guard_grip_low_qa import surface_samples,sampled_error
from original_guard_grip_fit_blender import source_geometry,bvh
from original_guard_grip_fit_math import axis_local_finger_side

ROOT=Path(__file__).resolve().parents[3]
CONTACT=ROOT/'art-factory/rts/runs/original-guard-grip-fit/2026-10-05/qa/finger-side-contact.json'


def main():
    flip=json.loads((RUN/'qa/flip-search.json').read_text(encoding='utf8'))
    blend=RUN/'candidate/original-guard-grip-local-flip.blend'
    assert sha(blend)==flip['candidate_blend_sha256']
    high,high_faces=source_geometry(SOURCE,'OriginalGripRigidFitReviewOnly')
    original,original_faces=source_geometry(LOW_RUN/'candidate/original-guard-grip-low.blend','OriginalGripLowCandidate')
    old=bpy.data.objects['OriginalGripLowCandidate']
    local_old=np.asarray([tuple(v.co) for v in old.data.vertices],dtype=np.float32)
    old_sword=bpy.data.objects['KingdomSteelSword_LOD0']
    sword_fingerprint=mesh_fingerprint(old_sword.data)
    sword_matrix=[list(row) for row in old_sword.matrix_world]
    glove_matrix=[list(row) for row in old.matrix_world]
    low,low_faces=source_geometry(blend,'OriginalGripLowCandidate')
    glove=bpy.data.objects['OriginalGripLowCandidate']
    sword=bpy.data.objects['KingdomSteelSword_LOD0']
    local_new=np.asarray([tuple(v.co) for v in glove.data.vertices],dtype=np.float32)
    assert local_old.shape==local_new.shape
    exact_rows=np.all(local_old.view(np.uint32)==local_new.view(np.uint32),axis=1)
    roi=json.loads((RUN/'qa/roi-before.json').read_text(encoding='utf8'))
    fixed={int(v) for g in roi['groups'].values() for v in g['perimeter_vertices']+g['protected_in_region']}
    matrix_ok=glove_matrix==[list(row) for row in glove.matrix_world]
    sword_ok=sword_fingerprint==mesh_fingerprint(sword.data) and sword_matrix==[list(row) for row in sword.matrix_world]
    low_tree=bvh(low,low_faces)
    high_tree=bvh(high,high_faces)
    rng=np.random.default_rng(20261005)
    high_error=sampled_error(surface_samples(high,high_faces,25000,rng),low_tree)
    low_error=sampled_error(surface_samples(low,low_faces,15000,rng),high_tree)
    old_report=json.loads((LOW_RUN/'qa/geometry.json').read_text(encoding='utf8'))
    old_metrics=old_report['metrics']
    sword.data.calc_loop_triangles()
    sword_points=np.asarray([tuple(sword.matrix_world@v.co) for v in sword.data.vertices],float)
    sword_faces=np.asarray([tuple(t.vertices) for t in sword.data.loop_triangles],int)
    sword_samples=np.vstack((sword_points,sword_points[sword_faces].mean(axis=1)))
    sword_nearest=[low_tree.find_nearest(Vector(p)) for p in sword_samples]
    sword_gaps=np.asarray([x[3] for x in sword_nearest])
    sword_radial=np.linalg.norm(sword_samples[:,:2]-[.45,.075],axis=1)
    fit_contacts=json.loads(CONTACT.read_text(encoding='utf8'))
    counts=[];contact_records=[]
    for zone in fit_contacts['zones']:
        zlo,zhi=zone['sword_z_window_m']
        on_wrap=np.zeros(len(sword_samples),dtype=bool)
        for band in range(7):
            lo=.82+band*.026;hi=lo+.008
            on_wrap|=(sword_samples[:,2]>=max(lo,zlo))&(sword_samples[:,2]<=min(hi,zhi))
        ids=np.flatnonzero(on_wrap&(sword_radial>.0225)&(sword_radial<.027))
        accepted=[]
        for sample_id in ids:
            nearest_world=sword_nearest[sample_id][0]
            source_local=glove.matrix_world.inverted()@nearest_world
            if not axis_local_finger_side(source_local,CHANNEL_ORIGIN,CHANNEL_AXIS)['finger_side']:continue
            gap=float(sword_gaps[sample_id])
            if .0003<=gap<=.0008:
                accepted.append({'sword_sample_id':int(sample_id),'gap_m':gap,'triangle':int(sword_nearest[sample_id][2])})
        counts.append(len(accepted))
        contact_records.append({'finger_from_guard':zone['finger_from_guard'],'count':len(accepted),'samples':accepted})
    report={'runtime_publish_allowed':False,'candidate_blend_sha256':sha(blend),
            'original_low_blend_sha256':sha(LOW_RUN/'candidate/original-guard-grip-low.blend'),
            'source_fit_blend_sha256':sha(SOURCE),
            'all_original_vertices_bitexact':bool(exact_rows.all()),
            'all_original_vertices_count':len(exact_rows),'unchanged_original_vertices':int(exact_rows.sum()),
            'fixed_roi_vertices_bitexact':all(exact_rows[list(fixed)]),'fixed_roi_count':len(fixed),
            'sword_mesh_and_transform_unchanged':sword_ok,'glove_transform_unchanged':matrix_ok,
            'contact_counts':counts,'baseline_contact_counts':old_metrics['four_finger_side_contacts'],
            'contact_records':contact_records,
            'sample_seed':20261005,'sample_method':'Same area-weighted deterministic samples as original low QA; quantiles are not Hausdorff bounds.',
            'high_to_low_p95_m':high_error['p95_m'],'low_to_high_p95_m':low_error['p95_m'],
            'baseline_high_to_low_p95_m':old_metrics['high_to_low_sample_p95_m'],
            'baseline_low_to_high_p95_m':old_metrics['low_to_high_sample_p95_m'],
            'sample_error':{'high_to_low':high_error,'low_to_high':low_error}}
    (RUN/'qa/fit-and-provenance.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    print('LOCAL_VERIFY',json.dumps({k:v for k,v in report.items() if k not in ('contact_records','sample_error')}),flush=True)


if __name__=='__main__':main()
