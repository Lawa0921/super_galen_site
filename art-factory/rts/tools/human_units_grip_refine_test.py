import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from human_units_grip_refine_math import (
    SOURCE_CHANNEL_AXIS, SOURCE_CHANNEL_ORIGIN_M, SOURCE_FINGER_SIDE,
    build_closed_grip_shell, edge_use_counts, profile_radius, source_grip_transform_point,
)


class SourceGripMapperTests(unittest.TestCase):
    def test_source_channel_origin_maps_exactly_to_worker_shaft_point(self):
        target = (0.32974883913993835, 0.014999999664723873, 0.8615250587463379)
        mapped = source_grip_transform_point(SOURCE_CHANNEL_ORIGIN_M, target, 0.75, 90.0)
        for actual, expected in zip(mapped, target):
            self.assertAlmostEqual(actual, expected, places=10)

    def test_source_channel_axis_maps_to_vertical_worker_axe_axis(self):
        origin = SOURCE_CHANNEL_ORIGIN_M
        point = tuple(origin[i] + SOURCE_CHANNEL_AXIS[i] * 0.1 for i in range(3))
        mapped = source_grip_transform_point(point, (0, 0, 0), 0.75, 90.0)
        self.assertAlmostEqual(mapped[0], 0.0, places=8)
        self.assertAlmostEqual(mapped[1], 0.0, places=8)
        self.assertAlmostEqual(mapped[2], 0.075, places=8)

    def test_spin_places_original_finger_side_toward_worker_front(self):
        origin = SOURCE_CHANNEL_ORIGIN_M
        point = tuple(origin[i] + SOURCE_FINGER_SIDE[i] * 0.1 for i in range(3))
        mapped = source_grip_transform_point(point, (0, 0, 0), 0.75, 90.0)
        self.assertGreater(mapped[1], 0.074)
        self.assertLess(abs(mapped[0]), 0.001)

    def test_channel_axis_can_map_to_negative_worker_axe_axis(self):
        origin = SOURCE_CHANNEL_ORIGIN_M
        point = tuple(origin[i] + SOURCE_CHANNEL_AXIS[i] * 0.1 for i in range(3))
        mapped = source_grip_transform_point(point, (0, 0, 0), 0.75, 90.0, target_axis_sign=-1)
        self.assertAlmostEqual(mapped[2], -0.075, places=8)
        self.assertAlmostEqual(mapped[0], 0.0, places=8)
        self.assertAlmostEqual(mapped[1], 0.0, places=8)


class ClosedGripShellTests(unittest.TestCase):
    def test_hand_is_single_closed_manifold_with_budgeted_triangle_count(self):
        vertices, faces, meta = build_closed_grip_shell(shaft_radius_m=0.019, segments=36, levels=12)
        self.assertGreaterEqual(meta["triangles"], 1000)
        self.assertLessEqual(meta["triangles"], 2000)
        self.assertEqual(meta["components"], 1)
        self.assertTrue(all(count == 2 for count in edge_use_counts(faces).values()))
        self.assertEqual(meta["open_boundary_edges"], 0)

    def test_bore_clears_original_axe_haft_without_collision(self):
        vertices, faces, meta = build_closed_grip_shell(shaft_radius_m=0.019, segments=36, levels=12)
        self.assertGreaterEqual(meta["bore_radius_m"], 0.019)
        self.assertLessEqual(meta["bore_clearance_m"], 0.001)
        self.assertFalse(meta["shaft_intersection"])

    def test_four_finger_ridges_remain_visible_on_front_quadrant(self):
        centers = [-0.027, -0.009, 0.009, 0.027]
        peaks = [profile_radius(z, angle_rad=3.141592653589793) for z in centers]
        valleys = [profile_radius((a + b) / 2, angle_rad=3.141592653589793) for a, b in zip(centers, centers[1:])]
        self.assertEqual(len(peaks), 4)
        self.assertTrue(all(peak > valley + 0.002 for peak, valley in zip(peaks[1:], valleys)))


if __name__ == "__main__":
    unittest.main()
