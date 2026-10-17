import unittest
import numpy as np
from original_crossbow_cuff_frame import rigid_fit

class CuffFrameTest(unittest.TestCase):
    def test_recovers_rotation_translation_of_planar_contour(self):
        p=np.array([[1,0,0],[0,2,0],[-1,0,0],[0,-2,0]],float)
        r=np.array([[0,-1,0],[1,0,0],[0,0,1]],float);q=p@r.T+[3,4,5]
        m,error=rigid_fit(p,q)
        np.testing.assert_allclose(m[:3,:3],r,atol=1e-12)
        np.testing.assert_allclose(m[:3,3],[3,4,5],atol=1e-12);self.assertLess(error,1e-12)
    def test_rejects_line_and_mismatched_points(self):
        for p,q in [([[0,0,0],[1,0,0],[2,0,0]],[[0,0,0],[1,0,0],[2,0,0]]),([[0,0,0]]*3,[[0,0,0]]*4)]:
            with self.assertRaises(ValueError):rigid_fit(p,q)
    def test_fit_never_returns_reflection(self):
        p=np.array([[0,0,0],[1,0,0],[0,1,0],[0,0,1]],float)
        m,error=rigid_fit(p,p*[-1,1,1]);self.assertAlmostEqual(np.linalg.det(m[:3,:3]),1);self.assertGreater(error,.1)

if __name__=='__main__':unittest.main()
