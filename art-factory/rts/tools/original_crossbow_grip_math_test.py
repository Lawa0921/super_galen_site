import math
import unittest
from original_crossbow_grip_math import solve_two_bone

class TwoBoneIKTests(unittest.TestCase):
    def test_reachable_target_preserves_both_bone_lengths(self):
        shoulder=(0.0,0.0,1.35); target=(0.02,0.25,1.12); pole=(0.0,1.0,0.0)
        upper,lower=0.19,0.21
        elbow,actual=solve_two_bone(shoulder,target,pole,upper,lower)
        self.assertLess(math.dist(shoulder,elbow),upper+1e-6)
        self.assertAlmostEqual(math.dist(shoulder,elbow),upper,places=6)
        self.assertAlmostEqual(math.dist(elbow,actual),lower,places=6)
        self.assertAlmostEqual(math.dist(actual,target),0.0,places=6)

    def test_unreachable_target_is_clamped_to_arm_reach(self):
        shoulder=(0.0,0.0,1.3); target=(0.0,1.0,1.3); pole=(0.0,0.0,1.0)
        upper,lower=0.18,0.20
        elbow,actual=solve_two_bone(shoulder,target,pole,upper,lower)
        self.assertAlmostEqual(math.dist(shoulder,elbow),upper,places=6)
        self.assertAlmostEqual(math.dist(elbow,actual),lower,places=6)
        self.assertLessEqual(math.dist(shoulder,actual),upper+lower+1e-6)
        self.assertGreater(math.dist(actual,target),0.1)

    def test_collinear_pole_uses_stable_fallback(self):
        shoulder=(0.0,0.0,0.0); target=(0.0,0.0,0.2); pole=(0.0,0.0,1.0)
        elbow,actual=solve_two_bone(shoulder,target,pole,0.15,0.15)
        self.assertTrue(all(math.isfinite(v) for v in (*elbow,*actual)))
        self.assertAlmostEqual(math.dist(shoulder,elbow),0.15,places=6)
        self.assertAlmostEqual(math.dist(elbow,actual),0.15,places=6)

    def test_arm_section_frame_is_orthonormal_for_diagonal_forearm(self):
        from original_crossbow_grip_math import arm_section_frame
        axis,u,v=arm_section_frame((0.2,0.0,1.2),(0.4,0.03,0.9))
        self.assertAlmostEqual(math.dist(axis,(0,0,0)),1.0,places=6)
        self.assertAlmostEqual(sum(a*b for a,b in zip(axis,u)),0.0,places=6)
        self.assertAlmostEqual(sum(a*b for a,b in zip(axis,v)),0.0,places=6)
        self.assertAlmostEqual(sum(a*b for a,b in zip(u,v)),0.0,places=6)
        self.assertAlmostEqual(math.dist(u,(0,0,0)),1.0,places=6)
        self.assertAlmostEqual(math.dist(v,(0,0,0)),1.0,places=6)

    def test_sleeve_weights_are_normalized_and_transition_across_elbow(self):
        from original_crossbow_grip_math import arm_skin_weights
        start=arm_skin_weights(0.0); elbow=arm_skin_weights(0.63); end=arm_skin_weights(1.0)
        for weights in (start,elbow,end):
            self.assertAlmostEqual(sum(weights),1.0,places=7)
            self.assertTrue(all(0.0<=w<=1.0 for w in weights))
        self.assertGreater(start[0],0.9)
        self.assertGreater(elbow[1]+elbow[2],0.95)
        self.assertGreater(end[3],0.9)

if __name__=='__main__':
    unittest.main()
