"""Anatomical roll must follow the elbow plane without moving the joints."""
import unittest
import numpy as np

from elbow_hinge_frame import hinge_skin_matrices


class ElbowHingeFrameTest(unittest.TestCase):
    def setUp(self):
        self.rest = np.array([[.2537, 0, 1.3741], [.3513, 0, 1.1009], [.4294, 0, .8472]])

    def check_pose(self, rest, posed):
        skins = hinge_skin_matrices(rest, posed)
        u = posed[1] - posed[0]
        f = posed[2] - posed[1]
        u /= np.linalg.norm(u)
        f /= np.linalg.norm(f)
        expected = [f - np.dot(f, u) * u, -u + np.dot(f, u) * f]
        for j, skin in enumerate(skins):
            np.testing.assert_allclose(skin[:3, :3].T @ skin[:3, :3], np.eye(3), atol=1e-12)
            self.assertAlmostEqual(np.linalg.det(skin[:3, :3]), 1.)
            for k in (j, j + 1):
                np.testing.assert_allclose((skin @ np.append(rest[k], 1))[:3], posed[k], atol=1e-12)
            inner = skin[:3, :3] @ np.array([0., 1., 0.])
            np.testing.assert_allclose(inner, expected[j] / np.linalg.norm(expected[j]), atol=1e-12)
        return skins

    def test_current_negative_y_bend_keeps_joint_positions_and_faces_the_flexor(self):
        lengths = np.linalg.norm(np.diff(self.rest, axis=0), axis=1)
        posed = np.array([[.2, .1, 1.4], [.2, .1, 1.4-lengths[0]], [.2, .1-lengths[1], 1.4-lengths[0]]])
        self.check_pose(self.rest, posed)

    def test_mirrored_deep_bend_is_a_proper_rotation_not_a_reflection(self):
        rest = self.rest * [-1, 1, 1]
        lengths = np.linalg.norm(np.diff(rest, axis=0), axis=1)
        u = np.array([0., 0., -1.])
        f = np.array([0., np.sin(np.deg2rad(123)), -np.cos(np.deg2rad(123))])
        a = np.array([-.2, .1, 1.4])
        self.check_pose(rest, np.array([a, a+u*lengths[0], a+u*lengths[0]+f*lengths[1]]))

    def test_rigid_world_rotation_does_not_change_relative_hinge(self):
        lengths = np.linalg.norm(np.diff(self.rest, axis=0), axis=1)
        pose = np.array([[0., 0, 0], [0, 0, -lengths[0]], [0, lengths[1], -lengths[0]]])
        first = hinge_skin_matrices(self.rest, pose)
        rotation = np.array([[0., -1, 0], [0, 0, 1], [-1, 0, 0]])
        translated = pose @ rotation.T + [.7, .2, -.4]
        second = self.check_pose(self.rest, translated)
        for a, b in zip(first, second):
            np.testing.assert_allclose(b[:3, :3], rotation @ a[:3, :3], atol=1e-12)

    def test_collinear_or_nonfinite_pose_fails_closed(self):
        for pose in (np.zeros((3, 3)), np.full((3, 3), np.nan), np.array([[0.,0,0], [0,0,1], [0,0,2]])):
            with self.assertRaises(ValueError):
                hinge_skin_matrices(self.rest, pose)

    def test_stretch_is_rejected_instead_of_hiding_a_joint_gap(self):
        pose = self.rest.copy()
        pose[2, 2] -= .02
        with self.assertRaisesRegex(ValueError, 'length'):
            hinge_skin_matrices(self.rest, pose)


if __name__ == '__main__':
    unittest.main()
