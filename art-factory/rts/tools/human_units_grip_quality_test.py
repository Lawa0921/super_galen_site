"""Regression gates for the actual worker wrist and exported LOD budgets."""
import copy
import unittest
from human_units_grip_quality import candidate_failures


def valid_report():
    return {'components':1,'open_boundary_edges':0,'nonmanifold_edges':0,
            'same_bone_transform_guarantees_no_detach':True,'shaft_intersection':False,
            'source_unchanged':True,
            'original_open_hand_trim':{'cap_faces':1,'remaining_wrist_boundary_edges':0},
            'original_open_hand_trim_lod1':{'cap_faces':1,'remaining_wrist_boundary_edges':0},
            'exported_triangles':{'lod0':18973,'lod1':9900}}


class CandidateQualityTests(unittest.TestCase):
    def test_accepts_closed_budgeted_candidate(self):
        self.assertEqual(candidate_failures(valid_report()),[])

    def test_rejects_previous_low_lod_uncapped_wrist(self):
        report=valid_report()
        report['original_open_hand_trim_lod1']['cap_faces']=0
        self.assertIn('lod1_wrist_uncapped',candidate_failures(report))

    def test_rejects_open_seam_even_when_cap_was_created(self):
        report=valid_report()
        report['original_open_hand_trim']['remaining_wrist_boundary_edges']=2
        self.assertIn('lod0_wrist_boundary',candidate_failures(report))

    def test_rejects_previous_10787_triangle_low_lod(self):
        report=valid_report();report['exported_triangles']['lod1']=10787
        self.assertIn('lod1_triangle_budget',candidate_failures(report))

    def test_missing_measurements_are_not_approval(self):
        report=valid_report();del report['original_open_hand_trim_lod1']['remaining_wrist_boundary_edges']
        self.assertIn('lod1_wrist_boundary',candidate_failures(report))

    def test_missing_lod_budget_is_not_approval(self):
        report=valid_report();del report['exported_triangles']
        self.assertIn('lod1_triangle_budget',candidate_failures(report))


if __name__=='__main__': unittest.main()
