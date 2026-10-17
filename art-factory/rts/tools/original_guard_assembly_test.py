import math
import unittest

from original_guard_assembly_math import (
    CLIP_DURATIONS_S,
    motion_extras,
    primary_bone_for_point,
    body_weights_for_point,
    inner_layer_weights_for_point,
    tabard_drape_fraction,
    fit_leg_profile_radii,
    leg_armor_patch_for_face,
    shoulder_cut_fragment_face,
    replace_source_leg_shell_face,
    rigid_leg_armor_bone,
    boot_heading_yaw_degrees,
    old_arm_residual_face,
    replaced_front_tabard_face,
    validate_contact_metrics,
    validate_source_bounds,
)


class OriginalGuardAssemblyTests(unittest.TestCase):
    def test_motion_extras_are_runtime_contract_and_match_authored_clip_timing(self):
        extras = motion_extras()
        self.assertEqual(extras, {
            "version": 1,
            "locomotion": {"clip": "Walk", "strideMeters": 2.0, "cycleSeconds": 2 / 3},
            "attack": {"clip": "Attack", "durationSeconds": 1.2, "contactSeconds": 16 / 30},
        })
        self.assertEqual(CLIP_DURATIONS_S["Walk"], extras["locomotion"]["cycleSeconds"])
        self.assertEqual(CLIP_DURATIONS_S["Attack"], extras["attack"]["durationSeconds"])

    def test_contact_gate_rejects_missed_target_even_if_sword_is_long_enough(self):
        metrics = {
            "blade_reach_m": 0.91,
            "blade_target_distance_m": 0.58,
            "blade_speed_mps": 4.0,
            "left_foot_lift_m": 0.012,
            "right_foot_lift_m": 0.009,
        }
        with self.assertRaisesRegex(ValueError, "target"):
            validate_contact_metrics(metrics)

    def test_contact_gate_rejects_non_finite_measurements(self):
        metrics = {
            "blade_reach_m": 0.91,
            "blade_target_distance_m": float("nan"),
            "blade_speed_mps": 4.1,
            "left_foot_lift_m": 0.012,
            "right_foot_lift_m": 0.009,
        }
        with self.assertRaisesRegex(ValueError, "finite"):
            validate_contact_metrics(metrics)

    def test_contact_gate_accepts_reached_contact_with_grounded_feet(self):
        metrics = {
            "blade_reach_m": 0.91,
            "blade_target_distance_m": 0.03,
            "blade_speed_mps": 4.1,
            "left_foot_lift_m": 0.012,
            "right_foot_lift_m": 0.009,
        }
        self.assertTrue(validate_contact_metrics(metrics)["passed"])

    def test_rigid_armor_assignments_follow_real_joint_segments(self):
        self.assertEqual(primary_bone_for_point(0.14, 0.28), "Shin_R")
        self.assertEqual(primary_bone_for_point(-0.16, 0.62), "Thigh_L")
        self.assertEqual(primary_bone_for_point(0.32, 1.24), "SpineUpper")
        self.assertEqual(primary_bone_for_point(-0.33, 0.96), "Pelvis")
        self.assertEqual(primary_bone_for_point(0.18, 0.62, 0.03), "Thigh_R")
        self.assertEqual(primary_bone_for_point(0.31, 0.82, 0.03), "Pelvis")
        self.assertNotIn("Arm", primary_bone_for_point(0.30, 1.40))
        self.assertNotIn("Hand", primary_bone_for_point(-0.32, 0.82))

    def test_leg_joint_weights_keep_hard_kneecap_rigid_and_blend_only_inner_gambeson(self):
        self.assertEqual(body_weights_for_point(0.16, 0.42, 0.12), {"Thigh_R": 1.0})
        cases = [
            (body_weights_for_point(0.12, 0.41, 0.02), {"Thigh_R": 0.5, "Shin_R": 0.5}),
            (body_weights_for_point(0.10, 0.16, 0.02), {"Foot_R": 0.5, "Shin_R": 0.5}),
            (body_weights_for_point(0.10, 0.72, 0.02), {"Thigh_R": 0.5, "Pelvis": 0.5}),
        ]
        for actual, expected in cases:
            self.assertEqual(set(actual), set(expected))
            for bone, expected_weight in expected.items():
                self.assertAlmostEqual(actual[bone], expected_weight, places=8)

    def test_side_rear_fauld_stays_on_pelvis_and_knee_seam_blends_across_source_rim(self):
        self.assertEqual(body_weights_for_point(0.22, 0.43, -0.115), {"Pelvis": 1.0})
        knee = body_weights_for_point(0.279, 0.412, 0.067)
        self.assertEqual(set(knee), {"Thigh_R", "Shin_R"})
        self.assertGreater(knee["Thigh_R"], 0.0)
        self.assertGreater(knee["Shin_R"], 0.0)
        self.assertAlmostEqual(sum(knee.values()), 1.0, places=8)

    def test_front_knee_cap_is_rigid_while_ankle_underlayer_blends(self):
        self.assertEqual(body_weights_for_point(0.279, 0.412, 0.067, 0.82), {"Thigh_R": 1.0})
        ankle = body_weights_for_point(0.10, 0.16, 0.085)
        self.assertEqual(set(ankle), {"Foot_R", "Shin_R"})
        self.assertAlmostEqual(sum(ankle.values()), 1.0, places=8)

    def test_precise_trim_rois_remove_only_replaced_front_and_old_arm_residuals(self):
        self.assertTrue(replaced_front_tabard_face(0.001, 0.215, 0.532))
        self.assertTrue(replaced_front_tabard_face(-0.015, 0.215, 0.533))
        self.assertFalse(replaced_front_tabard_face(0.279, 0.067, 0.412))
        self.assertTrue(old_arm_residual_face(0.46, -0.08, 0.90))
        self.assertTrue(old_arm_residual_face(-0.43, -0.12, 0.89))
        self.assertFalse(old_arm_residual_face(0.22, -0.115, 0.43))
        self.assertEqual(body_weights_for_point(0.001, 0.532, 0.215), {"Pelvis": 1.0})
        self.assertEqual(body_weights_for_point(-0.015, 0.533, 0.215), {"Pelvis": 1.0})

    def test_boot_reorientation_keeps_measured_cuff_pivot_and_aligns_to_plus_y(self):
        for side, dx, dy in (("R", 0.065064, -0.204866), ("L", -0.065465, -0.208165)):
            angle = math.radians(boot_heading_yaw_degrees(side))
            rotated_x = math.cos(angle) * dx - math.sin(angle) * dy
            rotated_y = math.sin(angle) * dx + math.cos(angle) * dy
            self.assertAlmostEqual(rotated_x, 0.0, delta=0.006)
            self.assertGreater(rotated_y, 0.20)

    def test_leg_armor_control_surfaces_are_rigidly_bound_by_joint(self):
        self.assertEqual(rigid_leg_armor_bone("thigh_armor", "R"), "Thigh_R")
        self.assertEqual(rigid_leg_armor_bone("shin_armor", "L"), "Shin_L")
        self.assertEqual(rigid_leg_armor_bone("knee_cap", "R"), "KneeSupport_R")

    def test_replace_source_leg_shell_removes_fused_armor_but_preserves_faulds(self):
        self.assertTrue(replace_source_leg_shell_face(0.20, 0.08, 0.41))
        self.assertTrue(replace_source_leg_shell_face(-0.20, -0.08, 0.60))
        self.assertFalse(replace_source_leg_shell_face(0.22, -0.115, 0.43))
        self.assertFalse(replace_source_leg_shell_face(0.36, 0.08, 0.55))
        self.assertFalse(replace_source_leg_shell_face(0.20, 0.08, 0.80))

    def test_shoulder_cut_fragment_selector_is_narrow_and_preserves_neck_and_chest(self):
        self.assertTrue(shoulder_cut_fragment_face(0.23, 0.10, 1.43))
        self.assertTrue(shoulder_cut_fragment_face(-0.24, 0.11, 1.41))
        self.assertTrue(shoulder_cut_fragment_face(0.21, 0.08, 1.54))
        self.assertFalse(shoulder_cut_fragment_face(0.08, 0.10, 1.43))
        self.assertFalse(shoulder_cut_fragment_face(0.31, 0.10, 1.54))
        self.assertFalse(shoulder_cut_fragment_face(0.23, -0.10, 1.43))
        self.assertFalse(shoulder_cut_fragment_face(0.23, 0.10, 1.33))

    def test_hard_leg_armor_is_split_by_joint_and_fauld_faces_are_not_misclassified(self):
        self.assertEqual(leg_armor_patch_for_face(0.20, 0.08, 0.41, 0.82), ("knee_cap", "R"))
        self.assertEqual(leg_armor_patch_for_face(-0.20, 0.08, 0.55, 0.70), ("thigh_armor", "L"))
        self.assertEqual(leg_armor_patch_for_face(0.20, 0.08, 0.28, 0.55), ("shin_armor", "R"))
        self.assertEqual(leg_armor_patch_for_face(0.20, 0.08, 0.41, 0.10), ("joint_liner", "R"))
        self.assertIsNone(leg_armor_patch_for_face(0.22, -0.115, 0.43, -0.5))
        self.assertIsNone(leg_armor_patch_for_face(0.39, 0.08, 0.55, 0.6))

    def test_source_leg_cross_section_fit_is_complete_and_bounded(self):
        points = [
            (0.10 * math.cos(2 * math.pi * index / 32),
             0.08 * math.sin(2 * math.pi * index / 32), 0.005)
            for index in range(32)
        ]
        radii = fit_leg_profile_radii(
            points, (0.0, 0.0, 0.0), (0.0, 0.0, 1.0),
            (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), bins=16, band_m=0.01,
        )
        self.assertEqual(len(radii), 16)
        self.assertTrue(all(0.079 <= radius <= 0.101 for radius in radii))
        outlier_radii = fit_leg_profile_radii(
            points + [(0.14, 0.0, 0.005)], (0.0, 0.0, 0.0), (0.0, 0.0, 1.0),
            (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), bins=16, band_m=0.01,
        )
        self.assertLess(max(outlier_radii) - min(outlier_radii), 0.05)

    def test_tabard_gravity_bake_releases_lower_cloth_during_death(self):
        self.assertEqual(tabard_drape_fraction("Idle", 0.5), 0.0)
        self.assertLess(tabard_drape_fraction("Death", 0.1), 0.01)
        self.assertGreater(tabard_drape_fraction("Death", 0.55), 0.25)
        self.assertAlmostEqual(tabard_drape_fraction("Death", 0.9), 0.85, places=5)
        self.assertEqual(tabard_drape_fraction("Walk", 0.5), 0.08)

    def test_source_derived_inner_layer_follows_leg_and_bends_only_at_knee(self):
        inner = inner_layer_weights_for_point(0.20, 0.412, 0.08)
        self.assertEqual(set(inner), {"Thigh_R", "Shin_R"})
        self.assertAlmostEqual(sum(inner.values()), 1.0, places=8)
        self.assertEqual(inner_layer_weights_for_point(0.20, 0.69, -0.11), {"Thigh_R": 1.0})
        self.assertEqual(inner_layer_weights_for_point(-0.20, 0.69, 0.11), {"Thigh_L": 1.0})

    def test_source_bounds_reject_missing_lower_body_and_placeholder_scale(self):
        with self.assertRaisesRegex(ValueError, "height"):
            validate_source_bounds({"height_m": 0.4, "torso_width_m": 0.8, "leg_height_m": 0.01})
        with self.assertRaisesRegex(ValueError, "leg"):
            validate_source_bounds({"height_m": 1.8, "torso_width_m": 0.6, "leg_height_m": 0.2})

    def test_source_bounds_accept_full_scale_armored_character(self):
        result = validate_source_bounds({"height_m": 1.84, "torso_width_m": 0.56, "leg_height_m": 0.68})
        self.assertTrue(result["passed"])
        self.assertGreater(result["height_m"], 1.7)


if __name__ == "__main__":
    unittest.main()
