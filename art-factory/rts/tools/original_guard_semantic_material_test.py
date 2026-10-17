"""Sampling and semantic-region regressions, independent of generated art taste."""
import unittest
import numpy as np

from original_guard_semantic_material_math import repeat_sample, triplanar_sample, material_regions, atlas_conflicts, isolate_uv_faces


class MaterialSurfaceTests(unittest.TestCase):
    def test_repeat_sampling_is_periodic_across_negative_coordinates(self):
        tile = np.arange(4 * 4 * 3, dtype=float).reshape(4, 4, 3) / 48
        uv = np.array([[-.15, 1.42], [1.2, -.65], [0, 0]])
        np.testing.assert_allclose(repeat_sample(tile, uv), repeat_sample(tile, uv + [3, -2]), atol=1e-12)

    def test_axis_aligned_surface_uses_its_tangent_plane(self):
        tile = np.arange(4 * 4 * 3, dtype=float).reshape(4, 4, 3) / 48
        points = np.array([[.2, .35, .6], [-.8, .35, .6]])
        actual = triplanar_sample(tile, points, np.array([[1, 0, 0], [-1, 0, 0]]), 1)
        expected = repeat_sample(tile, points[:, [1, 2]])
        np.testing.assert_allclose(actual, expected)

    def test_degenerate_normals_and_nonpositive_scale_rejected(self):
        tile = np.ones((4, 4, 3))
        for normal, scale in [([0, 0, 0], .1), ([1, 0, 0], 0)]:
            with self.assertRaises(ValueError):
                triplanar_sample(tile, [[0, 0, 0]], [normal], scale)

    def test_helmet_ridge_and_neck_do_not_share_material(self):
        points = np.array([[0, .092, 1.76], [.04, .086, 1.74], [0, .04, 1.545], [.22, 0, 1.55], [0, .13, 1.4]])
        normals = np.tile([0, 1, 0], (len(points), 1))
        result = material_regions(points, normals)
        self.assertEqual(result['material'].tolist(), [1, 0, 2, 0, 0])
        self.assertTrue(result['helmet'][:2].all())
        self.assertFalse(result['helmet'][2:].any())

    def test_atlas_reports_unrelated_surface_overlap_but_not_shared_edges(self):
        report = atlas_conflicts([7, 7, 9, 9], [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, .1]])
        self.assertEqual(report['duplicate_pixels'], 2)
        self.assertEqual(report['conflicting_pixels'], [9])
        self.assertAlmostEqual(report['maximum_surface_separation_m'], .1)

    def test_uv_collision_faces_move_to_disjoint_reserved_cells(self):
        uv=np.tile([[.1,.1],[.8,.1],[.1,.8]],(4,1,1))
        result=isolate_uv_faces(uv,[1,2])
        np.testing.assert_allclose(result[[0,3],:,0],uv[[0,3],:,0]*.90)
        np.testing.assert_array_equal(result[[0,3],:,1],uv[[0,3],:,1])
        self.assertGreater(result[[1,2],:,0].min(),.92)
        self.assertLess(result[1,:,0].max(),result[2,:,0].min())
        self.assertTrue(((result>=0)&(result<=1)).all())

    def test_uv_isolation_rejects_invalid_source_face(self):
        with self.assertRaises(ValueError):
            isolate_uv_faces(np.zeros((2,3,2)),[2])

    def test_blue_helmet_cheek_and_fused_arm_regression(self):
        points = np.array([[.055, .04, 1.595], [-.03, -.07, 1.60], [.22, 0, 1.42], [.08, .04, 1.55]])
        normals = np.tile([-1, 0, 0], (len(points), 1))
        # The rear sample lies on the intended metal rim, never on textile.
        self.assertEqual(material_regions(points, normals)['material'].tolist(), [0, 1, 0, 0])

    def test_entire_triangle_keeps_one_material_even_across_old_threshold(self):
        from original_guard_semantic_material_math import sample_face_materials
        np.testing.assert_array_equal(sample_face_materials([0, 2], [0, 0, 1]), [0, 0, 2])
        with self.assertRaises(ValueError):
            sample_face_materials([0, 2], [-1])


if __name__ == '__main__':
    unittest.main()
