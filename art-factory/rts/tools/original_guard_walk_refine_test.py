import math
import unittest
try:
    from original_guard_walk_refine_math import solve_two_link, transition_correction
except ImportError:
    solve_two_link = transition_correction = None

class WalkRefineMathTests(unittest.TestCase):
    def test_full_3d_anchor_keeps_true_link_lengths_and_source_knee_side(self):
        self.assertTrue(callable(solve_two_link), '3D IK solver not implemented')
        hip=(-.117,-.012,.614); ankle=(-.195,-.30,.135); old_knee=(-.14,.12,.34)
        l1=.33306384086608887; l2=.27392247319221497
        solved=solve_two_link(hip,ankle,old_knee,l1,l2)
        knee=solved['knee']
        self.assertAlmostEqual(math.dist(hip,knee),l1,places=10)
        self.assertAlmostEqual(math.dist(knee,ankle),l2,places=10)
        axis=tuple(ankle[i]-hip[i] for i in range(3));d2=sum(x*x for x in axis)
        def rejection(p):
            v=tuple(p[i]-hip[i] for i in range(3));u=sum(v[i]*axis[i] for i in range(3))/d2
            return tuple(v[i]-u*axis[i] for i in range(3))
        a,b=rejection(knee),rejection(old_knee)
        self.assertGreater(sum(x*y for x,y in zip(a,b)),0)
    def test_unreachable_target_is_rejected_instead_of_stretching_or_clamping(self):
        self.assertTrue(callable(solve_two_link), '3D IK solver not implemented')
        with self.assertRaisesRegex(ValueError,'unreachable'):
            solve_two_link((0,0,0),(0,0,.7),(0,.2,.3),.333,.274)
    def test_transition_preserves_boundary_position_and_velocity_without_endpoint_residual(self):
        self.assertTrue(callable(transition_correction), 'C1 transition not implemented')
        d=(.05,-.02,.001);v=(.3,-3,-.9);span=.08;eps=1e-7
        self.assertEqual(transition_correction(d,v,0,span),d)
        a=transition_correction(d,v,eps,span)
        for i in range(3):self.assertAlmostEqual((a[i]-d[i])/eps,v[i],places=5)
        end=transition_correction(d,v,span,span)
        self.assertTrue(all(abs(x)<1e-12 for x in end))
        before=transition_correction(d,v,span-eps,span)
        self.assertTrue(all(abs(x/eps)<1e-5 for x in before))
if __name__=='__main__':unittest.main()
