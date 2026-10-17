"""Bounded hinge-sweep geometry regressions."""
import unittest

import numpy as np

from original_guard_arm_hinge import hinge_transform, strict_triangle_crossings


class HingeTests(unittest.TestCase):
    def test_zero_pose_is_identity_and_bend_is_rigid(self):
        vertices = np.array([[0., 0., -1.], [1., 0., -1.], [0., 1., -1.]])
        pivot = np.zeros(3)
        axis = np.array([1., 0., 0.])
        zero = hinge_transform(vertices, pivot, axis, 0)
        bent = hinge_transform(vertices, pivot, axis, 90)
        self.assertTrue(np.allclose(zero, vertices))
        self.assertTrue(np.allclose(bent[0], [0., 1., 0.], atol=1e-10))
        for a, b in ((0, 1), (1, 2), (2, 0)):
            self.assertAlmostEqual(np.linalg.norm(vertices[a] - vertices[b]),
                                   np.linalg.norm(bent[a] - bent[b]), places=10)

    def test_strict_collision_rejects_separated_and_accepts_interior_crossing(self):
        base = np.array([[[0., 0., 0.], [1., 0., 0.], [0., 1., 0.]]])
        crossing = np.array([[[.25, .25, -1.], [.25, .25, 1.], [.75, .25, 1.]]])
        separate = crossing + [2., 0., 0.]
        self.assertEqual(strict_triangle_crossings(base, crossing).tolist(), [[0, 0]])
        self.assertEqual(strict_triangle_crossings(base, separate).tolist(), [])


if __name__ == "__main__":
    unittest.main()
