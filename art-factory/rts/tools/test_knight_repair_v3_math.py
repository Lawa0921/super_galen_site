"""Red/green tests for the v3 geometry contracts."""

import unittest

from knight_repair_v3_math import (
    closed_grip_profile,
    horse_head_profile,
    lance_tip_profile,
    is_mouth_fragment_bounds,
    mouth_fragment_profile,
    select_bit_mouth_anchors,
    select_distinct_mouth_anchors,
    saddle_profile,
    stirrup_contact_profile,
    weapon_clearance_profile,
)


class KnightV3ContractsTest(unittest.TestCase):
    def test_stirrup_gate_uses_actual_surface_tolerances(self):
        gate = stirrup_contact_profile()
        self.assertLessEqual(gate["max_lateral_m"], 0.020)
        self.assertLessEqual(gate["max_fore_aft_m"], 0.020)
        self.assertEqual(gate["sole_to_pedal_min_m"], 0.0)
        self.assertLessEqual(gate["sole_to_pedal_max_m"], 0.010)
        self.assertEqual(gate["frame_clearance_m"], 0.0)

    def test_lance_requires_sleeve_overlap_and_no_gap(self):
        gate = lance_tip_profile()
        self.assertEqual(gate["max_gap_m"], 0.0)
        self.assertGreaterEqual(gate["min_overlap_m"], 0.002)
        self.assertLessEqual(gate["max_overlap_m"], 0.004)

    def test_saddle_keeps_authored_vertical_drop(self):
        profile = saddle_profile()
        self.assertGreaterEqual(profile["z_scale"], 0.90)
        self.assertEqual(profile["bottom_lift_m"], 0.0)
        self.assertLess(profile["y_scale"], 0.75)

    def test_surface_hand_and_continuous_head_contracts(self):
        self.assertEqual(closed_grip_profile()["finger_count"], 4)
        self.assertEqual(closed_grip_profile()["thumb_count"], 1)
        self.assertLessEqual(closed_grip_profile()["max_surface_gap_m"], 0.003)
        head = horse_head_profile()
        self.assertLess(head["mouth_start_y_m"], head["mouth_end_y_m"])
        self.assertGreater(head["neck_blend_m"], 0.0)

    def test_mouth_anchors_reject_throat_and_do_not_reuse_point(self):
        points = [
            (-0.2082, 0.9428, 1.5135),
            (-0.0613, 0.7783, 1.5232),
            (0.0537, 0.7233, 1.0559),  # old V5 throat target
            (-0.2082, 0.9428, 1.5135),  # duplicate evaluated point
        ]
        centers = [(0.230, 0.920, 1.510), (-0.230, 0.920, 1.510)]
        anchors = select_distinct_mouth_anchors(points, centers)
        self.assertEqual(len(anchors), 2)
        self.assertTrue(all(point[2] > 1.35 and point[1] > 0.77 for point in anchors))
        self.assertNotEqual(anchors[0], anchors[1])

    def test_mouth_fragment_classifier_keeps_jaw_and_cuts_only_dangling_strip(self):
        profile = mouth_fragment_profile()
        self.assertLess(profile["max_z_m"], 1.45)
        # LOD0/LOD1 dangling components measured from the evaluated source.
        self.assertTrue(is_mouth_fragment_bounds(
            (-0.348, 0.805, 1.118), (-0.167, 1.162, 1.326)))
        self.assertTrue(is_mouth_fragment_bounds(
            (-0.338, 0.889, 1.155), (-0.239, 1.099, 1.357)))
        # The authored lower jaw is continuous above the strip envelope.
        self.assertFalse(is_mouth_fragment_bounds(
            (-0.410, 0.859, 1.122), (-0.174, 1.242, 1.770)))
        # A lower neck/chest island must not be removed just because it is
        # near the mouth in world Y/Z.
        self.assertFalse(is_mouth_fragment_bounds(
            (-0.166, 0.704, 0.763), (0.023, 0.789, 1.254)))

    def test_bit_anchors_exclude_fragment_and_old_throat(self):
        points = [
            (-0.2082, 0.9428, 1.5135),  # left bit corner
            (-0.0613, 0.7783, 1.5232),  # right bit corner
            (-0.2082, 0.9428, 1.2180),  # dangling fragment surface
            (0.0537, 0.7233, 1.0559),   # old throat target
        ]
        centers = [(-0.230, 0.920, 1.510), (-0.061, 0.778, 1.510)]
        anchors = select_bit_mouth_anchors(points, centers)
        self.assertEqual(anchors, [points[0], points[1]])

    def test_weapon_clearance_keeps_cuff_cut_and_shield_rotation_explicit(self):
        profile = weapon_clearance_profile()
        self.assertGreater(profile["lance_body_cut_margin_m"], 0.0)
        self.assertGreaterEqual(profile["shield_rotation_x_deg"], 8.0)
        self.assertLessEqual(profile["shield_rotation_x_deg"], 35.0)
        self.assertGreaterEqual(profile["shield_rotation_y_deg"], 8.0)
        self.assertLessEqual(profile["shield_rotation_y_deg"], 35.0)
        self.assertEqual(profile["shield_rotation_axis"], "world_x_then_y_about_grip")


if __name__ == "__main__":
    unittest.main()
