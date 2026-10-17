import unittest
from original_guard_grip_local_math import repair_region, unchanged_points, oriented_flip


class RepairRegionTest(unittest.TestCase):
    def test_seed_plus_exactly_one_edge_ring(self):
        faces = [(0, 1, 2), (2, 1, 3), (2, 3, 4), (4, 3, 5)]
        region = repair_region(faces, [0])
        self.assertEqual(region["region_faces"], [0, 1])
        self.assertEqual(region["editable_vertices"], [])
        self.assertEqual(region["perimeter_vertices"], [0, 1, 2, 3])

    def test_protected_centre_is_not_editable(self):
        faces = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)]
        region = repair_region(faces, [0, 1, 2, 3], [4])
        self.assertEqual(region["protected_in_region"], [4])
        self.assertEqual(region["editable_vertices"], [])
        self.assertEqual(len(region["perimeter_edges"]), 4)

    def test_fixed_points_must_survive_bit_exact(self):
        old = [(0., 0., 0.), (1., 0., 0.), (0., 1., 0.)]
        new = [old[2], old[0], old[1], (.2, .2, .2)]
        self.assertTrue(unchanged_points(old, new, [0, 2]))
        new[1] = (0., 0., 1e-8)
        self.assertFalse(unchanged_points(old, new, [0, 2]))

    def test_oriented_flip_preserves_outer_edges(self):
        old = [(0, 1, 2), (1, 0, 3)]
        new = oriented_flip(*old)
        self.assertEqual(new, ((1, 2, 3), (0, 3, 2)))
        self.assertIsNone(oriented_flip(old[0], (0, 1, 3)))


if __name__ == "__main__":
    unittest.main()
