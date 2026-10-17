"""Ray-occlusion checks for the frozen best hinge pose."""
import unittest

import numpy as np

from original_guard_arm_hinge import hinge_transform
from original_guard_arm_hinge_visibility import first_ray_hit, sleeve_pose
from original_guard_solid_arm import AXIS, AXIS_LENGTH, AXIS_START


class VisibilityTests(unittest.TestCase):
    def test_front_facing_triangle_occludes_point_behind_it(self):
        triangle = np.array([[[0., 0., 0.], [1., 0., 0.], [0., 0., 1.]]])
        hit = first_ray_hit(np.array([.2, -1., .2]), np.array([0., 1., 0.]), triangle)
        self.assertAlmostEqual(hit, 1.)
        self.assertIsNone(first_ray_hit(np.array([1.5, -1., .2]), np.array([0., 1., 0.]), triangle))

    def test_point_on_surface_is_not_its_own_occluder(self):
        triangle = np.array([[[0., 0., 0.], [1., 0., 0.], [0., 0., 1.]]])
        self.assertIsNone(first_ray_hit(np.array([.2, 0., .2]), np.array([0., 1., 0.]), triangle))

    def test_sleeve_keeps_proximal_end_and_follows_distal_hinge(self):
        points = np.array([AXIS_START + t * AXIS_LENGTH * AXIS for t in (.2, .8)])
        pivot = AXIS_START + .48 * AXIS_LENGTH * AXIS
        distal = AXIS_START + .69 * AXIS_LENGTH * AXIS
        hinge_axis = np.array([1., 0., 0.])
        posed = sleeve_pose(points, pivot, hinge_axis, 90, 45, AXIS, distal)
        self.assertTrue(np.allclose(posed[0], points[0]))
        expected = hinge_transform(points[1:], pivot, hinge_axis, 90, 45, AXIS, distal)
        self.assertTrue(np.allclose(posed[1:], expected))


if __name__ == "__main__":
    unittest.main()
