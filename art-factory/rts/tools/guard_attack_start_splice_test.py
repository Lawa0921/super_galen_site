"""Actual saved-Blender regression for the frame4 exterior-tangent defect.

Finite-difference tolerances include the protected body's existing key kink
and float32 evaluation; these tests do not assert mathematical exact C1.
"""
import json
import math
import sys
import unittest
from pathlib import Path

import bpy
import numpy as np

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from guard_attack_boundary_verify import angular
from guard_attack_author import BASE, PARTS

RUN_NAME = sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else '2026-10-08-v28-authored-attack-start-arc'


class SavedAttackStartSpliceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        run = BASE/RUN_NAME
        bpy.ops.wm.open_mainfile(filepath=str(run/'candidate/guard-authored-attack.blend'))
        cls.rig, cls.scene = bpy.data.objects['GuardRig20'], bpy.context.scene
        cls.rig.animation_data.action = bpy.data.actions['Attack']
        cls.info = json.loads((run/'qa/authoring.json').read_text(encoding='utf-8'))

    def test_frame4_saved_pose_velocity_joins_the_unchanged_outgoing_curve(self):
        h = 1/128
        poses = []
        for t in (4-h, 4, 4+h):
            self.scene.frame_set(math.floor(t), subframe=t % 1)
            poses.append({n: self.rig.pose.bones[n].matrix.copy() for n in PARTS})
        for name in PARTS:
            left = np.array(poses[1][name].translation-poses[0][name].translation)/(h/30)
            right = np.array(poses[2][name].translation-poses[1][name].translation)/(h/30)
            angular_error = np.linalg.norm(angular(poses[0][name], poses[1][name], h/30)-angular(poses[1][name], poses[2][name], h/30))
            with self.subTest(bone=name):
                self.assertLess(np.linalg.norm(right-left), .05)
                self.assertLess(angular_error, .20)

    def test_unmodified_window_and_geometry_remain_protected(self):
        self.assertTrue(self.info['meshes_unchanged'])
        self.assertEqual(self.info['maximum_outside_window_point_bound_m'], 0)
        self.assertLessEqual(self.info['maximum_joint_gap_m'], .00005)


if __name__ == '__main__':
    result = unittest.TextTestRunner(stream=sys.stdout, verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(SavedAttackStartSpliceTest))
    if not result.wasSuccessful():
        raise RuntimeError('Saved attack-start splice regression failed')
