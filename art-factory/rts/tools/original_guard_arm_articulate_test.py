"""Regression tests for the original right-arm articulation method."""
import importlib.util
from pathlib import Path
import unittest

import numpy as np

SPEC = importlib.util.spec_from_file_location(
    "arm_articulate", Path(__file__).with_name("original_guard_arm_articulate.py")
)
arm = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(arm)


class ArticulationTests(unittest.TestCase):
    def test_rigid_plate_keeps_every_edge_length_at_combined_pose(self):
        plate = np.array([[.10, 0, 0], [.18, 0, 0], [.15, .04, -.12], [.10, -.03, -.14]])
        moved = arm.rigid_transform(plate, np.array([0., 0., 0.]),
                                    np.array([.02, -.01, .03]), 90, 45)
        edges = ((0, 1), (0, 2), (1, 2), (2, 3), (3, 0))
        for a, b in edges:
            self.assertAlmostEqual(np.linalg.norm(plate[a] - plate[b]),
                                   np.linalg.norm(moved[a] - moved[b]), places=12)

    def test_forearm_control_rolls_rigid_plate_45_degrees_about_distal_axis(self):
        r = arm.control_rotation(np.array([0., 0., -1.]), np.array([1., 0., 0.]), 0, 45)
        radial = r @ np.array([1., 0., 0.])
        self.assertAlmostEqual(radial[0], np.sqrt(.5), places=12)
        self.assertAlmostEqual(radial[1], -np.sqrt(.5), places=12)

    def test_sleeve_inner_longitudes_keep_forward_spacing_at_90_bend(self):
        # A 55 mm sleeve around a 140 mm flex band must not fold its inner contour.
        centers = np.column_stack((np.zeros(13), np.zeros(13), -np.linspace(0, .14, 13)))
        angles = np.arange(24) * 2 * np.pi / 24
        rings = centers[:, None, :] + .055 * np.stack(
            (np.cos(angles), np.sin(angles), np.zeros_like(angles)), axis=1)[None, :, :]
        posed = arm.pose_sleeve(rings, centers, np.linspace(.4, .7, 13), 90, 45)
        self.assertGreater(arm.minimum_longitudinal_spacing(posed), 0)
        self.assertGreater(posed[-1].mean(axis=0)[1], .055)  # 90° goes toward +Y/front.
        self.assertTrue(np.isfinite(posed).all())

    def test_source_fit_shell_has_closed_nondegenerate_faces(self):
        angles = np.arange(24) * 2 * np.pi / 24
        rings = np.array([np.stack((.06 * np.cos(angles), .05 * np.sin(angles),
                                    np.full(24, z)), axis=1) for z in (0., -.03, -.06)])
        vertices, faces = arm.closed_shell(rings, angular_start=2, angular_stop=19,
                                           inner_scale=.90)
        checks = arm.mesh_checks(vertices, faces)
        self.assertTrue(checks["watertight"])
        self.assertTrue(checks["winding_consistent"])
        self.assertGreater(checks["minimum_double_area"], 1e-10)

    def test_rigid_plate_vertices_all_map_to_one_bone(self):
        groups = arm.vertex_bone_assignments(60, ["ForearmArmor"], 3)
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups["ForearmArmor"], list(range(60)))

    def test_normal_offset_makes_thin_closed_shell_on_irregular_rings(self):
        angles = np.arange(32) * 2 * np.pi / 32
        rings = np.array([np.stack(((0.07 + .008 * np.cos(4 * angles + i)) * np.cos(angles),
                                    .055 * np.sin(angles), np.full(32, -.025 * i)), axis=1)
                          for i in range(4)])
        vertices, faces = arm.closed_shell(rings, inner_offset_m=.0015)
        half = len(vertices) // 2
        gap = np.linalg.norm(vertices[:half] - vertices[half:], axis=1)
        self.assertLess(np.max(abs(gap - .0015)), 1e-9)
        self.assertTrue(arm.mesh_checks(vertices, faces)["watertight"])


if __name__ == "__main__":
    unittest.main()
