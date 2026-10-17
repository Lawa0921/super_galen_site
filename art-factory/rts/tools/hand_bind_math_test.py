import unittest
import numpy as np
from hand_bind_math import canonical_hand_binding


class CanonicalHandBindingTests(unittest.TestCase):
    def test_rebase_preserves_posed_geometry_and_moves_joint_to_actual_wrist(self):
        old_rest = np.eye(4)
        old_rest[:3, 3] = [.42, 0, .85]
        skin = np.array([[0., -1., 0., .5], [1., 0., 0., -.3], [0., 0., 1., .1], [0., 0., 0., 1.]])
        old_pose = skin @ old_rest
        actual_wrist = np.array([.39, .083, .936])
        points = np.array([[.45, .075, .904], [.47, .08, 1.0], [.41, .02, .2]])
        new_points, new_pose = canonical_hand_binding(points, old_rest, old_pose, actual_wrist)
        old_world = (skin @ np.column_stack((points, np.ones(len(points)))).T).T
        new_world = (new_pose @ np.linalg.inv(old_rest) @ np.column_stack((new_points, np.ones(len(points)))).T).T
        np.testing.assert_allclose(new_world, old_world, atol=1e-12)
        np.testing.assert_allclose(new_pose[:3, 3], (skin @ np.r_[actual_wrist, 1])[:3], atol=1e-12)
        np.testing.assert_allclose(new_pose[:3, :3], old_pose[:3, :3], atol=1e-12)

    def test_already_canonical_is_unchanged(self):
        rest = np.eye(4)
        rest[:3, 3] = [.4, .1, .8]
        points = np.array([[.2, .3, .4]])
        actual, pose = canonical_hand_binding(points, rest, rest, rest[:3, 3])
        np.testing.assert_array_equal(actual, points)
        np.testing.assert_array_equal(pose, rest)

    def test_nonfinite_input_rejected(self):
        with self.assertRaisesRegex(ValueError, 'finite'):
            canonical_hand_binding([[np.nan, 0, 0]], np.eye(4), np.eye(4), [0, 0, 0])

    def test_nonrigid_rest_transform_rejected(self):
        rest = np.eye(4)
        rest[0, 0] = 2
        with self.assertRaisesRegex(ValueError, 'rigid'):
            canonical_hand_binding([[0, 0, 0]], rest, np.eye(4), [0, 0, 0])


if __name__ == '__main__':
    unittest.main()
