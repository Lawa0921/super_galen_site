import unittest

from human_units_probe import vertex_components, welded_vertex_components


class ComponentTest(unittest.TestCase):
    def test_connected_mesh(self):
        self.assertEqual(vertex_components(4, [(0, 1), (1, 2), (2, 3)]), [[0, 1, 2, 3]])

    def test_small_island_and_isolated_vertex(self):
        self.assertEqual(vertex_components(5, [(0, 1), (1, 2), (3, 4)]), [[0, 1, 2], [3, 4]])

    def test_uv_seam_duplicates_weld_by_position(self):
        points = [(0, 0, 0), (1, 0, 0), (1, 0, 0), (2, 0, 0)]
        self.assertEqual(welded_vertex_components(points, [(0, 1), (2, 3)]), [[0, 1, 2, 3]])


if __name__ == '__main__':
    unittest.main()
