import unittest
import numpy as np
from original_guard_portrait_study_math import portrait_weights, portrait_motion

class PortraitTests(unittest.TestCase):
    def test_helmet_is_rigid_but_shoulders_stay_on_chest(self):
        points=np.array([[0,.1,1.7],[.11,.02,1.65],[.3,0,1.6],[0,0,1.32],[0,0,1.56]])
        w=portrait_weights(points)
        np.testing.assert_allclose(w.sum(axis=1),1)
        np.testing.assert_allclose(w[:2,1],1)
        np.testing.assert_allclose(w[2:4,1],0)
        self.assertGreater(w[4,1],0);self.assertLess(w[4,1],1)

    def test_weights_reject_invalid_geometry(self):
        for points in [[[0,0]],[[0,float('nan'),1.5]]]:
            with self.assertRaises(ValueError):portrait_weights(points)

    def test_original_motion_loops_and_has_independent_head_turn(self):
        for name in ['chest','head']:
            np.testing.assert_allclose(portrait_motion(0)[name],portrait_motion(120)[name],atol=1e-12)
        self.assertGreater(abs(portrait_motion(30)['head'][2]),.1)
        self.assertLess(np.linalg.norm(portrait_motion(30)['chest']),.01)
        self.assertNotEqual(portrait_motion(30)['head'],portrait_motion(90)['head'])

    def test_motion_rejects_invalid_timebase(self):
        for frame,period in [(0,0),(float('nan'),120),(0,-1)]:
            with self.assertRaises(ValueError):portrait_motion(frame,period)

if __name__=='__main__':unittest.main()
