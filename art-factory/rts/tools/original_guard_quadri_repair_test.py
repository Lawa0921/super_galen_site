"""Regression tests for source-coordinate-only collapse and local temporary patches."""

import unittest

import numpy as np

from original_guard_quadri_repair_math import (collapse_exact_groups,
                                                oriented_boundary_loops,
                                                triangulate_boundary_loop,
                                                segment_triangle_intersection,
                                                harmonic_disk_triangulation)


class ExactRepairTest(unittest.TestCase):
    def test_harmonic_disk_keeps_outer_ring_and_triangulates_interior(self):
        points = np.array([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
                           [.5, .5, .2]], dtype=np.float32)
        faces = [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]]
        triangles, uv = harmonic_disk_triangulation(points, faces, [0, 1, 2, 3])
        self.assertEqual(len(triangles), 4)
        self.assertEqual(set(v for tri in triangles for v in tri), set(range(5)))
        edges = [tuple(sorted((a, b))) for tri in triangles
                 for a, b in zip(tri, tri[1:] + tri[:1])]
        self.assertEqual({edge for edge in edges if edges.count(edge) == 1},
                         {(0, 1), (1, 2), (2, 3), (0, 3)})
        self.assertTrue(np.linalg.norm(uv[4]) < 1e-6)

    def test_segment_triangle_interior_crossing_and_external_miss(self):
        triangle = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0]], dtype=np.float64)
        crossing = segment_triangle_intersection(np.array([.2, .2, -1]),
                                                  np.array([.2, .2, 1]), triangle)
        self.assertIsNotNone(crossing)
        self.assertTrue(np.allclose(crossing["point"], [.2, .2, 0]))
        self.assertEqual(crossing["kind"], "interior_crossing")
        self.assertIsNone(segment_triangle_intersection(np.array([2, 2, -1]),
                                                         np.array([2, 2, 1]), triangle))

    def test_weld_only_named_equal_coordinates_and_preserve_exception(self):
        points = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0],
                           [0, 0, 0], [0, 0, 0]], dtype=np.float32)
        faces = np.array([[0, 1, 2], [3, 2, 1]], dtype=np.int32)
        welded, mapped, mapping = collapse_exact_groups(points, faces, [[0, 3]])
        self.assertEqual(len(welded), 4)
        self.assertTrue(np.array_equal(welded, points[[0, 1, 2, 4]]))
        self.assertEqual(mapped.tolist(), [[0, 1, 2], [0, 2, 1]])
        self.assertNotEqual(mapping[0], mapping[4])
        bad = points.copy()
        bad[3, 0] = np.nextafter(np.float32(0), np.float32(1))
        with self.assertRaisesRegex(ValueError, "exact"):
            collapse_exact_groups(bad, faces, [[0, 3]])

    def test_oriented_boundary_cycle_and_concave_seven_edge_patch(self):
        # Existing side faces point along the inner boundary; patch reverses them.
        points = np.array([[0, 0, 0], [2, 0, 0], [3, 1, 0], [2, 2, 0],
                           [1, 1, 0], [0, 2, 0], [-1, 1, 0], [1, 1, -1]],
                          dtype=np.float32)
        faces = [[7, i, (i + 1) % 7] for i in range(7)]
        loops = oriented_boundary_loops(faces)
        self.assertEqual(len(loops), 1)
        self.assertEqual(set(loops[0]), set(range(7)))
        patch = triangulate_boundary_loop(points, loops[0])
        self.assertEqual(len(patch), 5)
        self.assertEqual({v for tri in patch for v in tri}, set(range(7)))
        self.assertEqual(len({tuple(sorted((a, b))) for tri in patch
                              for a, b in zip(tri, tri[1:] + tri[:1])}), 11)


if __name__ == "__main__":
    unittest.main()
