import unittest

from human_units_spec import BONE_NAMES, UNITS, clip_frames, derive_landmarks, skirt_weights


class HumanUnitSpecTest(unittest.TestCase):
    def test_landmarks_are_unit_specific_and_grounded(self):
        worker = derive_landmarks(UNITS['worker'], 0.45, 0.11)
        commander = derive_landmarks(UNITS['commander'], 0.55, 0.14)
        self.assertEqual(set(worker['bones']), set(BONE_NAMES))
        self.assertEqual(len(BONE_NAMES), 20)
        self.assertEqual(worker['bones']['Root'][0][2], 0)
        self.assertGreater(commander['bones']['Hand_R'][0][0], worker['bones']['Hand_R'][0][0])
        self.assertGreater(commander['height_m'], worker['height_m'])

    def test_five_exact_clips_have_joint_motion(self):
        clips = clip_frames('worker')
        self.assertEqual(list(clips), ['Idle', 'Walk', 'Attack', 'Hurt', 'Death'])
        self.assertNotEqual(clips['Walk'][0][1]['Thigh_L'], clips['Walk'][2][1]['Thigh_L'])
        self.assertIn('UpperArm_R', clips['Attack'][1][1])

    def test_priest_skirt_weights_are_continuous_at_center(self):
        center = skirt_weights(0.0, 0.35, 1.83)
        near_left = skirt_weights(0.001, 0.35, 1.83)
        self.assertAlmostEqual(sum(center.values()), 1)
        self.assertGreater(center['Pelvis'], 0.45)
        self.assertLess(abs(center['Thigh_L'] - near_left['Thigh_L']), 0.01)


if __name__ == '__main__':
    unittest.main()
