"""Projection regressions: canonical axes, occlusion and source pixel fidelity."""
import unittest
import numpy as np

from original_guard_projection import (
    camera_coordinates, rasterize_depth, sample_reference,
    projection_weights, blend_projected,
)


class GuardProjectionTests(unittest.TestCase):
    def test_canonical_front_back_and_opposite_profiles(self):
        point = np.array([[.2, .4, 1.5]])
        for camera, expected in [((0, 1, 0), [-.2, 1.5, .4]),
                                 ((0, -1, 0), [.2, 1.5, -.4]),
                                 ((-1, 0, 0), [-.4, 1.5, -.2]),
                                 ((1, 0, 0), [.4, 1.5, .2])]:
            actual = camera_coordinates(point, camera)
            self.assertIsNotNone(actual, "Canonical projection is not implemented")
            np.testing.assert_allclose(actual, [expected])

    def test_depth_raster_uses_nearest_surface_not_vertex_only_splats(self):
        # Two overlapping large triangles, whose centers contain no vertices.
        # Depth is toward the camera, so +.3 hides -.2.
        vertices = np.array([[0, 0, -.2], [1, 0, -.2], [0, 1, -.2],
                             [0, 0, .3], [1, 0, .3], [0, 1, .3]])
        result = rasterize_depth(vertices, [[0, 1, 2], [3, 4, 5]], [[0, 0], [1, 1]], (8, 8))
        self.assertIsNotNone(result, "Triangle depth raster is not implemented")
        self.assertAlmostEqual(result[1, 1], .3)
        self.assertTrue(np.isneginf(result[7, 7]))
        reverse = rasterize_depth(vertices, [[3, 4, 5], [0, 1, 2]], [[0, 0], [1, 1]], (8, 8))
        np.testing.assert_array_equal(result, reverse)

    def test_depth_raster_interpolates_sloping_triangle(self):
        result = rasterize_depth([[0, 0, 0], [1, 0, 1], [0, 1, 0]], [[0, 1, 2]], [[0, 0], [1, 1]], (8, 8))
        self.assertIsNotNone(result)
        self.assertAlmostEqual(result[1, 2], 2.5 / 8)

    def test_premultiplied_sampling_excludes_hidden_rgb_and_alpha_haze(self):
        image = np.array([[[255, 0, 0, 255], [0, 255, 0, 0]],
                          [[0, 0, 255, 7], [128, 128, 128, 255]]], dtype=np.uint8)
        result = sample_reference(image, [[.5, 0], [0, 1], [1, 1], [-.01, 0]])
        self.assertIsNotNone(result, "Reference pixel sampling is not implemented")
        np.testing.assert_allclose(result[0], [1, 0, 0, .5])
        np.testing.assert_array_equal(result[1], 0)
        np.testing.assert_allclose(result[2], [.2158605, .2158605, .2158605, 1], atol=1e-6)
        np.testing.assert_array_equal(result[3], 0)

    def test_view_rejects_hidden_backfacing_wrong_semantic_and_absent_pixels(self):
        normals = np.array([[0, 1, 0]] * 6 + [[0, -1, 0]])
        result = projection_weights(normals, [0, 1, 0], np.zeros(7),
                                    [0, .04, -np.inf, 0, 0, -.04, 0],
                                    [1, 1, 1, 0, 1, 1, 1],
                                    [True, True, True, True, False, True, True])
        self.assertIsNotNone(result, "Visibility and semantic gates are not implemented")
        np.testing.assert_array_equal(result, [1, 0, 0, 0, 0, 0, 0])

    def test_multiview_blend_normalizes_and_retains_original_semantic_fallback(self):
        colors = np.array([[[1, 0, 0], [1, 0, 0]], [[0, 0, 1], [0, 0, 1]]])
        result = blend_projected(colors, [[.8, 0], [.8, 0]], [[10, 20, 30], [43, 72, 101]])
        self.assertIsNotNone(result, "Linear-light source blending is not implemented")
        np.testing.assert_array_equal(result, [[188, 0, 188], [43, 72, 101]])

    def test_partial_coverage_keeps_fallback_in_linear_light(self):
        result = blend_projected([[[1, 0, 0]]], [[.25]], [[0, 0, 255]])
        np.testing.assert_array_equal(result, [[137, 0, 225]])

    def test_alpha_eight_is_the_first_accepted_source_level(self):
        image = np.array([[[255, 0, 0, 7], [255, 0, 0, 8]]], dtype=np.uint8)
        result = sample_reference(image, [[0, 0], [1, 0]])
        np.testing.assert_array_equal(result[0], 0)
        np.testing.assert_allclose(result[1], [1, 0, 0, 8 / 255])

    def test_zero_length_normal_has_no_projection_weight(self):
        with np.errstate(all='raise'):
            result = projection_weights([[0, 0, 0]], [0, 1, 0], [0], [0], [1], [True])
        np.testing.assert_array_equal(result, [0])

    def test_invalid_inputs_fail_closed(self):
        with self.assertRaises(ValueError):
            camera_coordinates([[0, 0, 1]], [0, 0, 1])
        with self.assertRaises(ValueError):
            rasterize_depth([[0, 0, 0]], [[0, 1, 2]], [[0, 0], [1, 1]], (8, 8))
        with self.assertRaises(ValueError):
            blend_projected([[[0, 0, 0]]], [[1]], None)


if __name__ == '__main__':
    unittest.main()
