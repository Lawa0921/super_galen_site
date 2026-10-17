import math,unittest
from original_crossbow_fullbody_math import joint_position,stages

class FullBodyTests(unittest.TestCase):
    def test_two_segment_joint_preserves_both_lengths(self):
        p=joint_position((0,0,1),(0,.2,.4),.35,.35,(0,1,1))
        self.assertAlmostEqual(math.dist(p,(0,0,1)),.35)
        self.assertAlmostEqual(math.dist(p,(0,.2,.4)),.35)
        self.assertGreater(p[1],0)

    def test_unreachable_and_collinear_inputs_are_rejected(self):
        for args in [((0,0,0),(0,1,0),.3,.3,(0,0,1)),((0,0,0),(0,.1,0),.4,.1,(0,0,1)),((0,0,0),(0,.4,0),.3,.3,(0,1,0))]:
            with self.assertRaises(ValueError):joint_position(*args)

    def test_foot_anchor_can_stay_fixed_during_pelvis_shift(self):
        foot=(-.23,0,.112)
        for i in range(101):
            t=i/100;hip=(-.18+.035*t,.02*t,.80-.07*t)
            knee=joint_position(hip,foot,.345,.3475,(-.2,.6,.5))
            self.assertAlmostEqual(math.dist(hip,knee),.345)
            self.assertAlmostEqual(math.dist(knee,foot),.3475)

    def test_distinct_shoot_draw_and_loading_stages(self):
        self.assertEqual(stages(11)['draw'],1)
        self.assertEqual(stages(13)['draw'],0)
        self.assertEqual(stages(31)['draw'],0)
        self.assertTrue(0<stages(36)['draw']<1)
        self.assertEqual(stages(40)['draw'],1)
        self.assertEqual(stages(48)['bolt'],'quiver')
        self.assertEqual(stages(52)['bolt'],'hand')
        self.assertEqual(stages(63)['bolt'],'rail')

    def test_stowed_cycle_boundaries(self):
        self.assertEqual(stages(-1),stages(0))
        self.assertEqual(stages(72),stages(0))
        self.assertEqual(stages(75),stages(72))
        self.assertEqual(stages(26)['deploy'],0)
        self.assertEqual(stages(32)['deploy'],1)
        self.assertEqual(stages(46)['deploy'],0)

if __name__=='__main__':unittest.main()
