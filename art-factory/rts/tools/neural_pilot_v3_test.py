"""Projection-vs-neural blending regressions for the fixed guard v3 pilot."""

import unittest

import numpy as np

from neural_pilot_v3 import linear_to_srgb, projection_pixels, projection_weight
from neural_pilot_v2 import srgb_to_linear


class ProjectionTests(unittest.TestCase):
    def test_front_and_back_mirror_horizontal_axis(self):
        points = np.array([[0, -1, -1], [0, 1, 1]], dtype=np.float32)
        bounds = np.array([[-1, -1, -1], [1, 1, 1]], dtype=np.float32)
        bbox = (10, 20, 90, 180)
        front = projection_pixels(points, bounds, bbox, rear=False)
        rear = projection_pixels(points, bounds, bbox, rear=True)
        np.testing.assert_allclose(front, [[10, 180], [90, 20]])
        np.testing.assert_allclose(rear, [[90, 180], [10, 20]])

    def test_alpha_normal_and_occlusion_gate_wrong_surfaces(self):
        signed_normal = np.array([1.0, 0.0, -1.0, 1.0], dtype=np.float32)
        alpha = np.array([1.0, 1.0, 1.0, 0.0], dtype=np.float32)
        depth_gap = np.array([0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        weights = projection_weight(signed_normal, alpha, depth_gap)
        self.assertGreater(weights[0], 0.9)
        np.testing.assert_array_equal(weights[1:], 0)
        self.assertEqual(float(projection_weight(np.array([1.0]), np.array([1.0]), np.array([0.1]))[0]), 0)

    def test_srgb_roundtrip_preserves_midgray(self):
        encoded = np.array([0.0, 0.5, 1.0], dtype=np.float32)
        np.testing.assert_allclose(linear_to_srgb(srgb_to_linear(encoded)), encoded, atol=1e-6)


if __name__ == "__main__":
    unittest.main()
