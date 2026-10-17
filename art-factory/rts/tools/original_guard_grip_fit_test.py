"""Regression checks for rigid grip placement and exact triangle crossing."""
import unittest
import numpy as np

from original_guard_grip_fit_math import rigid_fit, transform_points, segment_triangle_hit, triangles_cross, fit_verdict, axis_local_finger_side, finger_side_fit_verdict


class GripFitMathTests(unittest.TestCase):
    def test_tilted_source_axis_maps_to_original_sword_axis(self):
        source_origin = np.array([.07, .02, .17])
        source_axis = np.array([-.011, .001, 1.0])
        source_axis /= np.linalg.norm(source_axis)
        rotation, translation = rigid_fit(source_origin, source_axis, [.45, .075, .904], .9, 0.0)
        np.testing.assert_allclose(rotation @ source_axis, [0, 0, 1], atol=1e-12)
        np.testing.assert_allclose(transform_points(source_origin[None, :], rotation, translation, .9)[0], [.45, .075, .904], atol=1e-12)
        self.assertAlmostEqual(np.linalg.det(rotation), 1.0, places=12)

    def test_antiparallel_axis_and_segment_boundary(self):
        rotation, translation = rigid_fit([0, 0, 0], [0, 0, -1], [0, 0, 1], 1.0, .4)
        np.testing.assert_allclose(rotation @ [0, 0, -1], [0, 0, 1], atol=1e-12)
        self.assertAlmostEqual(np.linalg.det(rotation), 1.0, places=12)
        tri = np.array([[0., 0., 0.], [1., 0., 0.], [0., 1., 0.]])
        self.assertTrue(segment_triangle_hit([.2, .2, -1], [.2, .2, 1], tri))
        self.assertFalse(segment_triangle_hit([1.2, .2, -1], [1.2, .2, 1], tri))
        self.assertFalse(segment_triangle_hit([.2, .2, 1], [.2, .2, 2], tri))

    def test_triangle_crossing_is_symmetric_and_disjoint_is_clear(self):
        a = np.array([[0., 0., 0.], [1., 0., 0.], [0., 1., 0.]])
        b = np.array([[.2, .2, -1.], [.2, .2, 1.], [.8, .2, 0.]])
        c = b + [0., 0., 3.]
        self.assertTrue(triangles_cross(a, b))
        self.assertTrue(triangles_cross(b, a))
        self.assertFalse(triangles_cross(a, c))

    def test_acceptance_requires_all_four_contacts_and_zero_penetration(self):
        fingers = [{"closest_gap_m": .00056, "samples_within_0p8mm": 4} for _ in range(4)]
        self.assertTrue(fit_verdict(0, 0, fingers, .001, .002)["pass"])
        missing = [*fingers[:3], {"closest_gap_m": .0012, "samples_within_0p8mm": 0}]
        self.assertFalse(fit_verdict(0, 0, missing, .001, .002)["pass"])
        self.assertFalse(fit_verdict(1, 0, fingers, .001, .002)["pass"])
        self.assertFalse(fit_verdict(0, 1, fingers, .001, .002)["pass"])
        self.assertFalse(fit_verdict(0, 0, fingers, 0., .002)["pass"])

    def test_same_height_and_radius_on_opposite_side_cannot_count_as_finger_contact(self):
        axis_origin = [0., 0., 0.]
        axis_direction = [0., 0., 1.]
        finger = axis_local_finger_side([.024, 0., .15], axis_origin, axis_direction)
        back = axis_local_finger_side([-.024, 0., .15], axis_origin, axis_direction)
        self.assertAlmostEqual(finger["radius_m"], back["radius_m"])
        self.assertTrue(finger["finger_side"])
        self.assertFalse(back["finger_side"])
        self.assertAlmostEqual(finger["azimuth_degrees"], 0.)
        self.assertAlmostEqual(abs(back["azimuth_degrees"]), 180.)
        zones = [{"finger_side_samples": [dict(finger, gap_m=.0005, sample_id=1), dict(finger, gap_m=.0005, sample_id=2)]} for _ in range(4)]
        self.assertTrue(finger_side_fit_verdict(zones)["pass"])
        zones[3] = {"finger_side_samples": [dict(back, gap_m=.0005, sample_id=1), dict(back, gap_m=.0005, sample_id=2)]}
        self.assertFalse(finger_side_fit_verdict(zones)["pass"])


if __name__ == "__main__":
    unittest.main()
