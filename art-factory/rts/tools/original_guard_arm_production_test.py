"""Source correspondence and sweep checks for the original arm production pass."""
import unittest

import numpy as np

from original_guard_solid_arm import source_geometry
from original_guard_arm_production import (build_continuous_control_surface,
                                           verify_source_correspondence,
                                           feature_boundary, build_candidate,
                                           verify_outer_roi_preservation,
                                           pose_components)


class ProductionArmTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source_vertices, cls.source_faces = source_geometry()

    def test_control_surface_uses_connected_original_quad_faces(self):
        surface = build_continuous_control_surface(self.source_vertices, self.source_faces)
        self.assertGreater(len(surface["faces"]), 200)
        self.assertGreater(sum(len(face) == 4 for face in surface["faces"]), 150)
        self.assertEqual(len(surface["source_face_ids"]), len(surface["faces"]))
        self.assertTrue(verify_source_correspondence(surface, self.source_vertices,
                                                     self.source_faces)["all_exact"])

    def test_correspondence_detects_boundary_tamper(self):
        surface = build_continuous_control_surface(self.source_vertices, self.source_faces)
        changed = dict(surface)
        changed["vertices"] = np.asarray(surface["vertices"]).copy()
        changed["vertices"][0, 0] += .001
        self.assertFalse(verify_source_correspondence(changed, self.source_vertices,
                                                      self.source_faces)["all_exact"])

    def test_feature_boundary_is_single_ordered_curve(self):
        surface = build_continuous_control_surface(self.source_vertices, self.source_faces)
        edge = feature_boundary(surface, .48)
        self.assertGreater(len(edge), 8)
        self.assertEqual(len(set(edge)), len(edge))

    def test_three_rigid_armor_parts_keep_original_outside_roi(self):
        candidate = build_candidate(self.source_vertices, self.source_faces)
        self.assertEqual(set(candidate["components"]),
                         {"UpperArmArmor", "ElbowArmor", "ForearmArmor", "FlexibleSleeve"})
        self.assertTrue(verify_outer_roi_preservation(candidate, self.source_vertices,
                                                       self.source_faces)["all_exact"])
        for name in ("UpperArmArmor", "ElbowArmor", "ForearmArmor"):
            part = candidate["components"][name]
            self.assertTrue(part["qa"]["closed"])
            self.assertGreater(part["qa"]["feature_edge_length_m"], .05)

    def test_cloth_weights_and_rigid_motion_are_finite(self):
        candidate = build_candidate(self.source_vertices, self.source_faces)
        cloth = candidate["components"]["FlexibleSleeve"]
        weights = np.asarray(cloth["weights"])
        self.assertTrue(np.allclose(weights.sum(axis=1), 1))
        self.assertGreater(np.count_nonzero(weights[:, 1] > .1), 10)
        posed = pose_components(candidate, 75, 30)
        self.assertEqual(set(posed), set(candidate["components"]))
        self.assertTrue(all(np.isfinite(p).all() for p in posed.values()))

    def test_couter_is_a_source_quad_side_patch_with_continuous_return(self):
        candidate = build_candidate(self.source_vertices, self.source_faces)
        part = candidate["components"]["ElbowArmor"]
        self.assertEqual(part["design"]["geometry"], "source_quad_side_patch")
        self.assertGreater(part["design"]["source_quad_faces"], 100)
        self.assertEqual(part["design"]["boundary_loops"], 1)
        self.assertTrue(part["qa"]["closed"])


if __name__ == "__main__":
    unittest.main()
