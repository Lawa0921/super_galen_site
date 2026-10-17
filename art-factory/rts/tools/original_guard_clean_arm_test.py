"""Acceptance checks for a new authored arm cage, not source-face preservation."""
import unittest
import numpy as np

from original_guard_clean_arm import build_arm, pose_points, AXIS_START, AXIS_END, PIVOT, ELBOW_T, center, FRONT, HINGE, FOREARM_LENGTH


class CleanArmTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.parts = build_arm(high_detail=True)

    def test_authored_quad_cages_and_separate_joint(self):
        self.assertEqual(set(self.parts), {
            "ShoulderSpaulder", "UpperArmArmor", "ElbowArmor",
            "ForearmArmor", "WristCuff", "FlexibleSleeve"})
        for name, part in self.parts.items():
            points = np.asarray(part["vertices"])
            self.assertTrue(np.isfinite(points).all())
            self.assertGreater(len(part["faces"]), 100)
            if name != "FlexibleSleeve":
                self.assertTrue(all(len(face) == 4 for face in part["faces"]))
            else:
                self.assertEqual(sorted(len(face) for face in part["faces"])[-2:], [48,48])
            self.assertGreater(len(points), 100)
            self.assertLess(np.max(np.linalg.norm(points[1:] - points[:-1], axis=1)), .2)
        self.assertEqual(self.parts["ElbowArmor"]["bone"], "ElbowSupport_R")
        self.assertEqual(self.parts["ForearmArmor"]["bone"], "Forearm_R")

    def test_elbow_couter_is_extensor_side_and_gambeson_is_closed(self):
        from collections import Counter
        from original_guard_clean_arm import surface, FRONT, segment_weights
        center = surface("ElbowArmor", .5, .5)
        joint = PIVOT
        self.assertLess(float(np.dot(center - joint, FRONT)), -.05)
        tip_width = np.linalg.norm(surface("ElbowArmor", 0., 0.) - surface("ElbowArmor", 0., 1.))
        middle_width = np.linalg.norm(surface("ElbowArmor", .5, 0.) - surface("ElbowArmor", .5, 1.))
        self.assertLess(tip_width, .06)
        self.assertGreater(middle_width, .11)
        self.assertGreater(segment_weights(ELBOW_T)[1], .90)
        self.assertEqual(len(segment_weights(ELBOW_T)), 3)
        self.assertEqual(self.parts["ElbowArmor"]["bone"], "ElbowSupport_R")
        sleeve = self.parts["FlexibleSleeve"]
        edge_use = Counter(tuple(sorted((face[i], face[(i+1)%len(face)])))
                           for face in sleeve["faces"] for i in range(len(face)))
        self.assertTrue(all(count == 2 for count in edge_use.values()))

    def test_arm_axis_and_bend_roll_envelope(self):
        axis = (AXIS_END - AXIS_START) / np.linalg.norm(AXIS_END - AXIS_START)
        self.assertTrue(np.allclose(AXIS_START, [.2537, 0., 1.3741]))
        self.assertTrue(np.allclose(PIVOT, [.3513, 0., 1.1009]))
        self.assertTrue(np.allclose(AXIS_END, [.4294, 0., .8472]))
        self.assertTrue(np.allclose(center(0), AXIS_START))
        self.assertTrue(np.allclose(center(ELBOW_T), PIVOT))
        self.assertTrue(np.allclose(center(1), AXIS_END))
        self.assertTrue(np.allclose(FRONT, [0., 1., 0.]))
        self.assertAlmostEqual(float(np.dot(HINGE, (PIVOT-AXIS_START)/np.linalg.norm(PIVOT-AXIS_START))), 0., delta=.03)
        neutral = pose_points(self.parts, 0, 0)
        bent = pose_points(self.parts, 90, 0)
        rolled = pose_points(self.parts, 90, 45)
        self.assertTrue(np.allclose(neutral["UpperArmArmor"], bent["UpperArmArmor"]))
        self.assertTrue(np.allclose(bent["UpperArmArmor"], rolled["UpperArmArmor"]))
        self.assertGreater(np.linalg.norm(bent["ForearmArmor"] - neutral["ForearmArmor"], axis=1).max(), .12)
        self.assertGreater(np.linalg.norm(rolled["ForearmArmor"] - bent["ForearmArmor"], axis=1).max(), .012)
        self.assertTrue(all(np.isfinite(p).all() for p in rolled.values()))

    def test_shoulder_shell_and_elbow_bridge_keep_assembly_endpoints(self):
        self.assertIn("ShoulderSpaulder", self.parts)
        shoulder = self.parts["ShoulderSpaulder"]
        self.assertEqual(shoulder["bone"], "UpperArm_R")
        sleeve = self.parts["FlexibleSleeve"]
        sleeve_points = np.asarray(sleeve["vertices"])
        axis = (AXIS_END - AXIS_START) / np.linalg.norm(AXIS_END - AXIS_START)
        t = ((sleeve_points - AXIS_START) @ axis) / np.linalg.norm(AXIS_END - AXIS_START)
        self.assertLess(t.min(), .40)
        self.assertGreater(t.max(), .86)
        cuff=np.asarray(self.parts["WristCuff"]["vertices"])
        fore=(AXIS_END-PIVOT)/FOREARM_LENGTH
        self.assertGreater(np.max((cuff-PIVOT)@fore), FOREARM_LENGTH+.006)
        for pose in (90, 120):
            posed = pose_points(self.parts, pose, 0)
            self.assertEqual(set(posed), set(self.parts))
            self.assertTrue(all(np.isfinite(points).all() for points in posed.values()))
            self.assertTrue(np.allclose(posed["ShoulderSpaulder"], shoulder["vertices"]))

    def test_cloth_blend_and_invalid_pose(self):
        weights = np.asarray(self.parts["FlexibleSleeve"]["weights"])
        self.assertTrue(np.allclose(weights.sum(axis=1), 1))
        self.assertGreater(np.count_nonzero((weights[:, 0] > .1) & (weights[:, 1] > .1)), 10)
        self.assertEqual(weights.shape[1], 3)
        self.assertGreater(np.count_nonzero(weights[:, 1] > .90), 80)
        lod0=build_arm()
        lod0_tris=sum(sum(len(face)-2 for face in part["faces"]) for part in lod0.values())
        self.assertLess(lod0_tris, 2100)
        with self.assertRaises(ValueError):
            pose_points(self.parts, float("nan"), 0)


if __name__ == "__main__":
    unittest.main()
