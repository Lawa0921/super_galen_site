"""Focused regression tests for original right-arm solid sections."""
import unittest

import numpy as np
import trimesh

from original_guard_solid_arm import (build_arm_piece, cap_cut_loops, clip_polygons,
                                      rigid_weights, source_geometry, triangulate_planar_loop)


class SolidArmTests(unittest.TestCase):
    def setUp(self):
        # Four-sided open prism: the two cuts must close without an inset shell.
        self.vertices = np.array([
            [-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0],
            [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
        ], float)
        self.faces = [[0, 1, 5, 4], [1, 2, 6, 5],
                      [2, 3, 7, 6], [3, 0, 4, 7]]

    def test_clip_preserves_untouched_vertices_and_faces(self):
        vertices, faces, kept = clip_polygons(self.vertices, self.faces,
                                              np.array([0, 0, .5]), np.array([0, 0, 1]))
        self.assertEqual(len(kept), 0)
        self.assertTrue(np.allclose(vertices[:8], self.vertices))
        self.assertEqual(len(faces), 4)
        self.assertTrue(all(len(face) == 4 for face in faces))

    def test_planar_caps_close_solid_without_degenerate_faces(self):
        vertices, faces = cap_cut_loops(self.vertices, self.faces,
                                        np.array([0, 0, 1]))
        triangles = np.array([[f[0], f[i], f[i + 1]]
                              for f in faces for i in range(1, len(f) - 1)])
        mesh = trimesh.Trimesh(vertices=vertices, faces=triangles, process=False)
        self.assertTrue(mesh.is_watertight)
        area = np.linalg.norm(np.cross(vertices[triangles[:, 1]] - vertices[triangles[:, 0]],
                                       vertices[triangles[:, 2]] - vertices[triangles[:, 0]]), axis=1)
        self.assertGreater(float(area.min()), 1e-9)
        self.assertEqual(len(vertices), 8)  # solid planar section, no inward duplicate shell

    def test_concave_cap_ear_clipping_stays_inside_outline(self):
        polygon = np.array([[0, 0, 0], [2, 0, 0], [2, 2, 0],
                            [1, .5, 0], [0, 2, 0]], float)
        faces = triangulate_planar_loop(polygon, [0, 1, 2, 3, 4], np.array([0, 0, 1]))
        areas = [np.linalg.norm(np.cross(polygon[b] - polygon[a], polygon[c] - polygon[a])) / 2
                 for a, b, c in faces]
        self.assertAlmostEqual(sum(areas), 2.5, places=8)

    def test_degenerate_cut_fails_closed(self):
        vertices = self.vertices.copy()
        vertices[1] = vertices[0]
        with self.assertRaises(ValueError):
            cap_cut_loops(vertices, self.faces, np.array([0, 0, 1]))

    def test_armor_weights_are_single_bone(self):
        groups = rigid_weights(8, "ForearmArmor")
        self.assertEqual(groups, {"ForearmArmor": np.ones(8).tolist()})

    def test_real_arm_reports_untouched_polygons_separately_from_clipped_facets(self):
        vertices, faces = source_geometry()
        expected = [(.255, .385, 56, 66), (.415, .58, 71, 64),
                    (.665, .96, 153, 60)]
        for lo, hi, untouched, clipped in expected:
            piece = build_arm_piece(vertices, faces, lo, hi)
            self.assertEqual(piece["fully_unchanged_source_polygon_count"], untouched)
            self.assertEqual(piece["plane_clipped_source_polygon_count"], clipped)
            self.assertEqual(piece["pre_cap_exterior_polygon_count"], untouched + clipped)


if __name__ == "__main__":
    unittest.main()
