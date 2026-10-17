"""Triangle SAT regressions, including coplanar and crossing finger faces."""
import unittest
import numpy as np
from original_glove_self_contact import triangle_pair_gaps
class TrianglePairTests(unittest.TestCase):
    def gap(self,a,b):
        return triangle_pair_gaps(np.array(a+b,float),np.array([[0,1,2],[3,4,5]]),np.array([[0,1]]))[0]
    def test_crossing_faces_are_not_separated(self):
        self.assertLess(self.gap([[-1,-1,0],[1,-1,0],[0,1,0]],[[0,-.5,-1],[0,-.5,1],[0,.5,0]]),0)
    def test_parallel_faces_have_measured_clearance(self):
        self.assertAlmostEqual(self.gap([[0,0,0],[1,0,0],[0,1,0]],[[0,0,.2],[1,0,.2],[0,1,.2]]),.2)
    def test_coplanar_disjoint_faces_use_in_plane_axes(self):
        self.assertGreater(self.gap([[0,0,0],[1,0,0],[0,1,0]],[[2,0,0],[3,0,0],[2,1,0]]),.7)
    def test_coplanar_overlapping_faces_have_no_positive_gap(self):
        self.assertLessEqual(self.gap([[0,0,0],[2,0,0],[0,2,0]],[[.1,.1,0],[.4,.1,0],[.1,.4,0]]),0)
    def test_empty_pair_list_is_valid(self):
        self.assertEqual(triangle_pair_gaps(np.zeros((3,3)),np.array([[0,1,2]]),np.empty((0,2),int)).shape,(0,))
if __name__=='__main__':unittest.main()
