"""Source-preserving topology preparation regression tests."""

import unittest

import numpy as np

from original_guard_quadri_mesh import retain_largest_closed_component


class SourcePreparationTest(unittest.TestCase):
    def test_exact_weld_removes_only_duplicate_geometry_and_tiny_island(self):
        tetra = np.array([[0., 0., 0.], [1., 0., 0.], [0., 1., 0.], [0., 0., 1.]])
        faces = np.array([[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]])
        vertices = np.vstack([tetra[faces.reshape(-1)], tetra + 10])
        triangles = np.arange(12).reshape(-1, 3)
        triangles = np.vstack([triangles, faces + 12, triangles[0], [0, 0, 1]])
        vertices_out, faces_out, report = retain_largest_closed_component(vertices, triangles)
        self.assertEqual((len(vertices_out), len(faces_out)), (4, 4))
        self.assertEqual(report["dropped_component_faces"], [4])
        self.assertEqual(report["duplicate_triangles_removed"], 1)
        self.assertEqual(report["degenerate_triangles_removed"], 1)
        self.assertEqual(set(map(tuple, vertices_out)), set(map(tuple, tetra)))

    def test_nonclosed_primary_component_fails_closed_contract(self):
        vertices = np.array([[0., 0., 0.], [1., 0., 0.], [0., 1., 0.]])
        faces = np.array([[0, 1, 2]])
        with self.assertRaisesRegex(ValueError, "closed"):
            retain_largest_closed_component(vertices, faces)

    def test_tiny_positive_area_faces_are_not_discarded(self):
        vertices = np.array([[0., 0., 0.], [1e-7, 0., 0.],
                             [0., 1e-7, 0.], [0., 0., 1e-7]])
        faces = np.array([[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]])
        _, kept, report = retain_largest_closed_component(vertices, faces)
        self.assertEqual(len(kept), 4)
        self.assertEqual(report["degenerate_triangles_removed"], 0)


if __name__ == "__main__":
    unittest.main()
