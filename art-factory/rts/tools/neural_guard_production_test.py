"""Pure production contract regressions before Blender assembly."""

import unittest

from neural_guard_production_spec import BONE_SPECS, CLIP_FRAMES, transformed_point, validate_bones
from neural_guard_prepare import blue_cloth_mask
import numpy as np


class RigContractTests(unittest.TestCase):
    def test_twenty_bone_tree_has_one_root_and_all_required_limbs(self):
        validate_bones(BONE_SPECS)
        self.assertEqual(len(BONE_SPECS), 20)
        self.assertEqual(sum(parent is None for _, parent, _, _ in BONE_SPECS), 1)
        names = {bone[0] for bone in BONE_SPECS}
        for name in ("Root", "Pelvis", "SpineLower", "SpineUpper", "Neck", "Head", "UpperArm_L", "Forearm_L", "Hand_L", "UpperArm_R", "Forearm_R", "Hand_R", "Thigh_L", "Shin_L", "Foot_L", "Thigh_R", "Shin_R", "Foot_R"):
            self.assertIn(name, names)

    def test_ground_normalization_and_forward_rotation(self):
        bottom = transformed_point((0, 0, -0.459102), -0.459102, 1.86 / (0.493954 + 0.459102))
        top = transformed_point((0, 0, 0.493954), -0.459102, 1.86 / (0.493954 + 0.459102))
        self.assertAlmostEqual(bottom[2], 0)
        self.assertAlmostEqual(top[2], 1.86)
        # Tripo front +X must become Blender +Y, thus glTF -Z.
        front = transformed_point((1, 0, 0), 0, 1)
        self.assertAlmostEqual(front[0], 0)
        self.assertAlmostEqual(front[1], 1)

    def test_five_clips_include_real_nonstatic_walk_and_attack_poses(self):
        self.assertEqual(set(CLIP_FRAMES), {"Idle", "Walk", "Attack", "Hurt", "Death"})
        self.assertTrue(all(len(frames) >= 3 for frames in CLIP_FRAMES.values()))
        self.assertNotEqual(CLIP_FRAMES["Walk"][0][1], CLIP_FRAMES["Walk"][1][1])
        self.assertNotEqual(CLIP_FRAMES["Attack"][0][1], CLIP_FRAMES["Attack"][1][1])

    def test_team_cloth_mask_rejects_steel_and_brass(self):
        colors = np.array([[50, 70, 135], [170, 170, 175], [130, 95, 33]], dtype=np.uint8)
        np.testing.assert_array_equal(blue_cloth_mask(colors), [True, False, False])


if __name__ == "__main__":
    unittest.main()
