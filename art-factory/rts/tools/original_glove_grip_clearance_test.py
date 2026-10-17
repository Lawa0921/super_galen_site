"""Regression: vertices can clear a convex grip while their triangle cuts it."""
import unittest
import numpy as np
from original_glove_grip_clearance import triangle_clearance

BOX=np.array([[1,0,0,-1],[-1,0,0,-1],[0,1,0,-1],[0,-1,0,-1],[0,0,1,-1],[0,0,-1,-1]],float)
class TriangleClearanceTests(unittest.TestCase):
    def test_vertices_outside_do_not_prove_triangle_safe(self):
        p=np.array([[-2,0,0],[2,0,0],[0,2,0]],float)
        self.assertTrue(np.all((p@BOX[:,:3].T+BOX[:,3]).max(axis=1)>0))
        self.assertLess(triangle_clearance(p,np.array([[0,1,2]]),BOX)[0],0)
    def test_whole_triangle_clear_on_one_separating_plane(self):
        p=np.array([[1.2,-.2,0],[1.3,.2,0],[1.4,0,.2]])
        self.assertAlmostEqual(triangle_clearance(p,np.array([[0,1,2]]),BOX)[0],.2)
    def test_boundary_contact_has_zero_clearance(self):
        p=np.array([[1,-.2,0],[1.3,.2,0],[1.4,0,.2]])
        self.assertAlmostEqual(triangle_clearance(p,np.array([[0,1,2]]),BOX)[0],0)
if __name__=='__main__':unittest.main()
