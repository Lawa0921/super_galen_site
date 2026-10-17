"""Physical shell and hinge-envelope regressions for the original armor module."""
import unittest
from collections import Counter

import numpy as np

from original_guard_articulated_armor import build_module, module_skin_matrices
from original_guard_arm_hinge import strict_triangle_crossings, rotation


class ArticulatedArmorTest(unittest.TestCase):
    def setUp(self):
        self.rest = np.array([[.2537, 0, 1.3741], [.3513, 0, 1.1009], [.4294, 0, .8472]])

    def pose(self, angle):
        lengths = np.linalg.norm(np.diff(self.rest, axis=0), axis=1)
        theta = np.deg2rad(angle)
        return np.array([[0., 0, lengths[0]], [0, 0, 0], [0, lengths[1]*np.sin(theta), -lengths[1]*np.cos(theta)]])

    def test_lod_preserves_wrist_lap_clearance_when_cuff_and_plate_have_different_roll(self):
        axis = self.rest[2]-self.rest[1]
        def triangles(part, transform=None):
            points = np.array(part['points'])
            if transform is not None:
                points = (points-self.rest[1]) @ transform.T+self.rest[1]
            return points[np.array([[f[0], f[k], f[k+1]] for f in part['faces'] for k in range(1, len(f)-1)])]
        for lod in (0, 1):
            parts = build_module(self.rest, lod, include_interfaces=True)
            fore = triangles(parts['ForearmArmor'])
            for angle in (7.5, 37.5, 82.5, 127.5):
                cuff = triangles(parts['WristCuff'], rotation(axis, angle))
                with self.subTest(lod=lod, roll=angle):
                    self.assertEqual(len(strict_triangle_crossings(fore, cuff)), 0)

    def test_every_lod_is_a_closed_oriented_shell_with_explicit_surface_identity(self):
        for lod in (0, 1):
            for name, part in build_module(self.rest, lod, include_interfaces=True).items():
                points, faces = np.array(part['points']), part['faces']
                edges, directed = Counter(), Counter()
                for face in faces:
                    for a, b in zip(face, face[1:]+face[:1]):
                        edges[tuple(sorted((a, b)))] += 1
                        directed[(a, b)] += 1
                    area = np.linalg.norm(np.cross(points[face[1]]-points[face[0]], points[face[2]]-points[face[0]]))
                    self.assertGreater(area, 1e-10, (lod, name, face))
                self.assertEqual(set(edges.values()), {2})
                self.assertTrue(all(directed[e] == directed[e[::-1]] for e in directed))
                self.assertEqual(len(part['surface_ids']), len(points))
                self.assertEqual(len(set(map(tuple, part['surface_ids']))), len(points))
                count = part['outer_count']
                self.assertEqual(len(points), 2*count)
                np.testing.assert_allclose(np.linalg.norm(points[:count]-points[count:], axis=1), .0025, atol=1e-12)
                self.assertEqual(len(part['materials']), len(faces))

    def test_125_degree_flexor_relief_stays_on_its_own_side_of_joint_bisector(self):
        parts = build_module(self.rest, 0)
        for bend in (58., 90., 110., 125.):
            pose = self.pose(bend)
            transforms = module_skin_matrices(self.rest, pose)
            u, f = np.diff(pose, axis=0)
            u, f = u/np.linalg.norm(u), f/np.linalg.norm(f)
            normal = (u+f)/np.linalg.norm(u+f)
            for index, sign in ((0, -1), (1, 1)):
                name = ('UpperArmArmor', 'ForearmArmor')[index]
                points = np.array(parts[name]['points'])
                skin = transforms[index]
                posed = points @ skin[:3, :3].T + skin[:3, 3]
                self.assertGreater(np.min(sign*((posed-pose[1]) @ normal)), .0015, (bend, name))

    def test_couter_frame_is_rigid_and_follows_actual_extensor_bisector(self):
        rest_axis = np.diff(self.rest, axis=0)
        rest_axis /= np.linalg.norm(rest_axis, axis=1)[:, None]
        for bend in (58., 90., 125.):
            pose = self.pose(bend)
            matrix = module_skin_matrices(self.rest, pose)[2]
            np.testing.assert_allclose(matrix[:3, :3].T @ matrix[:3, :3], np.eye(3), atol=1e-12)
            self.assertAlmostEqual(np.linalg.det(matrix[:3, :3]), 1.)
            np.testing.assert_allclose((matrix @ np.append(self.rest[1], 1))[:3], pose[1], atol=1e-12)
            axis = np.diff(pose, axis=0)
            axis /= np.linalg.norm(axis, axis=1)[:, None]
            inner = axis[1]-axis[0]
            inner /= np.linalg.norm(inner)
            np.testing.assert_allclose(matrix[:3, :3] @ np.array([0., 1, 0]), inner, atol=1e-12)

    def test_invalid_lod_and_degenerate_hinge_fail_without_silent_fallback(self):
        with self.assertRaises(ValueError):
            build_module(self.rest, 2)
        with self.assertRaises(ValueError):
            module_skin_matrices(self.rest, np.zeros((3, 3)))


if __name__ == '__main__':
    unittest.main()
