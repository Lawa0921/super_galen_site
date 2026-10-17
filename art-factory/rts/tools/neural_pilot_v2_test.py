import unittest

import numpy as np

from neural_pilot_v2 import smooth_positions, srgb_to_linear


class ColorSpaceTests(unittest.TestCase):
    def test_srgb_midpoint_decodes_once_to_linear(self):
        values = srgb_to_linear(np.array([0.0, 0.5, 1.0], dtype=np.float32))
        np.testing.assert_allclose(values, [0.0, 0.21404114, 1.0], atol=1e-6)


class GeometryTests(unittest.TestCase):
    def test_light_smoothing_reduces_single_vertex_spike(self):
        vertices = np.array(
            [[0, 0, 1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]],
            dtype=np.float32,
        )
        faces = np.array([[0, 1, 3], [0, 3, 2], [0, 2, 4], [0, 4, 1]], dtype=np.int64)
        result = smooth_positions(vertices, faces, factor=0.2)
        self.assertAlmostEqual(float(result[0, 2]), 0.8, places=6)
        self.assertEqual(result.shape, vertices.shape)
        self.assertTrue(np.isfinite(result).all())


if __name__ == "__main__":
    unittest.main()
