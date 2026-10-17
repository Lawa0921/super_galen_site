"""Behavior checks for the source-bound articulated elbow rebuild."""
import unittest

import numpy as np

from original_guard_articulated_elbow import build_candidate, pose_components, source_boundary_fingerprint
from original_guard_articulated_elbow_qa import triangle_data
from original_guard_arm_hinge import strict_triangle_crossings
from original_guard_solid_arm import AXIS, AXIS_LENGTH, AXIS_START, source_geometry, triangulate


class ArticulatedElbowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source_vertices, cls.source_faces = source_geometry()
        cls.candidate = build_candidate(cls.source_vertices, cls.source_faces)

    def test_preserves_source_surfaces_outside_rebuild_interval(self):
        before = source_boundary_fingerprint(self.source_vertices, self.source_faces, .37, .72)
        self.assertEqual(self.candidate["preserved_source_fingerprint"], before)
        self.assertEqual(self.candidate["source_sha256"], "7afee7965c9167299c5fa13df914acec97b83af2db4aa3d228d1b75622614542")
        self.assertFalse(self.candidate["runtime_publish_allowed"])

    def test_three_armor_solids_and_fabric_are_closed_without_zero_faces(self):
        import trimesh
        for name, part in self.candidate["components"].items():
            mesh = trimesh.Trimesh(vertices=part["vertices"], faces=triangulate(part["faces"]), process=False)
            self.assertTrue(mesh.is_watertight, name)
            self.assertTrue(mesh.is_winding_consistent, name)
            self.assertGreater(abs(mesh.volume), 1e-8, name)
            points = np.asarray(part["vertices"])[triangulate(part["faces"])]
            self.assertGreater(np.min(np.linalg.norm(np.cross(points[:, 1]-points[:, 0], points[:, 2]-points[:, 0]), axis=1)), 1e-9, name)

    def test_hard_armor_rigid_and_couter_ignores_roll(self):
        a = pose_components(self.candidate, 60, 0)
        b = pose_components(self.candidate, 60, 45)
        self.assertLess(np.max(abs(a["ElbowArmor"]-b["ElbowArmor"])), 1e-9)
        self.assertGreater(np.max(abs(a["ForearmArmor"]-b["ForearmArmor"])), .001)
        for name in ("UpperArmArmor", "ElbowArmor", "ForearmArmor"):
            faces = triangulate(self.candidate["components"][name]["faces"])
            edges = np.unique(np.sort(np.vstack([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]]), axis=1), axis=0)
            rest = np.asarray(self.candidate["components"][name]["vertices"])
            self.assertLess(np.max(abs(np.linalg.norm(rest[edges[:, 0]]-rest[edges[:, 1]], axis=1)-np.linalg.norm(b[name][edges[:, 0]]-b[name][edges[:, 1]], axis=1))), 1e-6)

    def test_cloth_has_nine_32_point_rings_and_gradual_three_bone_weights(self):
        sleeve = self.candidate["components"]["FlexibleSleeve"]
        self.assertEqual((len(sleeve["stations"]), sleeve["ring_size"]), (9, 32))
        weights = np.asarray(sleeve["weights"])
        self.assertEqual(weights.shape, (len(sleeve["vertices"]), 3))
        self.assertLess(np.max(abs(weights.sum(axis=1)-1)), 1e-9)
        self.assertEqual(weights[0].tolist(), [1., 0., 0.])
        self.assertEqual(weights[(len(sleeve["stations"])-1)*32].tolist(), [0., 0., 1.])
        self.assertTrue(np.any(np.all(weights > 0, axis=1)))

    def test_rejects_out_of_range_motion(self):
        with self.assertRaises(ValueError):
            pose_components(self.candidate, 91, 0)
        with self.assertRaises(ValueError):
            pose_components(self.candidate, 30, -1)

    def test_couter_and_forearm_presentation_clear_at_deep_bends(self):
        a, b = (self.candidate["components"][name] for name in ("ElbowArmor", "ForearmArmor"))
        fa, la = triangle_data(a); fb, lb = triangle_data(b)
        for bend in (60, 75):
            posed = pose_components(self.candidate, bend, 0)
            crossings = strict_triangle_crossings(posed["ElbowArmor"][fa], posed["ForearmArmor"][fb])
            visible = sum(la[i] == lb[j] == "presentation" for i, j in crossings)
            self.assertEqual(visible, 0, f"couter/forearm presentation crosses at {bend}")


if __name__ == "__main__":
    unittest.main()
