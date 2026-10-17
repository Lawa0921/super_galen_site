"""Acceptance and protected-channel regressions for the original grip LOD."""
import unittest
import numpy as np

from original_guard_grip_low_math import protected_channel_mask, protected_failure_neighborhood_mask, low_grip_verdict


class GripLowTests(unittest.TestCase):
    def test_protects_first_pass_failure_centres_with_bounded_neighborhood(self):
        points = np.array([[0., 0., 0.], [.001, 0., 0.], [.002, 0., 0.], [.004, 0., 0.]])
        selected = protected_failure_neighborhood_mask(points, [[0., 0., 0.]], .002)
        self.assertEqual(selected.tolist(), [True, True, False, False])

    def test_protects_measured_bore_without_protecting_outer_or_end_geometry(self):
        origin = [.07, .02, .17]
        axis = [0., 0., 1.]
        points = np.array([[.09728, .02, .08], [.09728, .02, .24],
                           [.09728, .02, .30], [.105, .02, .12], [.07, .02, .12]])
        selected = protected_channel_mask(points, origin, axis, .02728, .00025, (.065, .28))
        self.assertEqual(selected.tolist(), [True, True, False, False, False])

    def test_acceptance_rejects_one_missing_finger_or_near_source_normal_opposition(self):
        metrics = {"triangles": 11900, "connected_components": 1,
                   "protected_input_vertices": 3000, "protected_vertices_kept_exact": 3000,
                   "bore_axis_minimum_sample_distance_m": .0245,
                   "uv_resolvable_nonzero_fraction": 1.0,
                   "boundary_edges": 0, "nonmanifold_edges": 0,
                   "winding_edges": 0, "zero_area_faces": 0, "near_source_normal_oppositions": 0,
                   "exact_sword_crossings": 0, "sword_vertices_inside_glove": 0,
                   "closed_sword_component_containment_complete": True,
                   "glove_vertices_confirmed_inside_closed_sword_components": 0,
                   "high_to_low_sample_p95_m": .0012, "low_to_high_sample_p95_m": .0014,
                   "four_finger_side_contacts": [3, 2, 4, 2],
                   "four_finger_side_distinct_faces": [3, 2, 4, 2],
                   "four_finger_side_closest_gap_m": [.0005] * 4}
        self.assertTrue(low_grip_verdict(metrics)["pass"])
        self.assertFalse(low_grip_verdict(dict(metrics, four_finger_side_contacts=[3, 2, 0, 2]))["pass"])
        self.assertFalse(low_grip_verdict(dict(metrics, near_source_normal_oppositions=1))["pass"])
        self.assertFalse(low_grip_verdict(dict(metrics, triangles=12001))["pass"])
        self.assertFalse(low_grip_verdict(dict(metrics, connected_components=2))["pass"])
        self.assertFalse(low_grip_verdict(dict(metrics, glove_vertices_confirmed_inside_closed_sword_components=1))["pass"])
        self.assertFalse(low_grip_verdict(dict(metrics, closed_sword_component_containment_complete=False))["pass"])
        self.assertFalse(low_grip_verdict(dict(metrics, protected_vertices_kept_exact=2999))["pass"])
        self.assertFalse(low_grip_verdict(dict(metrics, bore_axis_minimum_sample_distance_m=.023))["pass"])
        self.assertFalse(low_grip_verdict(dict(metrics, four_finger_side_distinct_faces=[3, 2, 1, 2]))["pass"])
        self.assertFalse(low_grip_verdict(dict(metrics, uv_resolvable_nonzero_fraction=.8))["pass"])


if __name__ == "__main__":
    unittest.main()
