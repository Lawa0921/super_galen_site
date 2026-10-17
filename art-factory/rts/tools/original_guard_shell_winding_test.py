import unittest
import numpy as np
from original_guard_shell_winding_math import winding_numbers, closed_consistent_shell, classify_shell_samples

V=np.array([[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],float)
F=np.array([[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]])

class WindingTests(unittest.TestCase):
    def test_boundary_is_classified_by_distance_even_when_winding_is_zero(self):
        inside,boundary=classify_shell_samples([0,1,1,0],[0,0,1e-3,1e-3])
        np.testing.assert_array_equal(boundary,[True,True,False,False])
        np.testing.assert_array_equal(inside,[False,False,True,False])

    def test_closed_cube_inside_outside_and_reverse_orientation(self):
        points=np.array([[0,0,0],[2,0,0],[-3,2,4],[.99,.1,.2]])
        self.assertTrue(closed_consistent_shell(F))
        np.testing.assert_allclose(np.abs(winding_numbers(points,V,F)),[1,0,0,1],atol=1e-12)
        np.testing.assert_allclose(winding_numbers(points,V,F[:,::-1]),-winding_numbers(points,V,F),atol=1e-12)

    def test_overlapping_closed_shells_use_union_not_odd_even(self):
        points=np.array([[.6,0,0],[1.4,0,0],[3,0,0]])
        a=np.abs(winding_numbers(points,V,F))>.5
        b=np.abs(winding_numbers(points,V+[.5,0,0],F))>.5
        np.testing.assert_array_equal(a|b,[True,True,False])
        self.assertTrue(a[0] and b[0])

    def test_open_or_inconsistently_oriented_shell_is_rejected(self):
        self.assertFalse(closed_consistent_shell(F[:-1]))
        bad=F.copy();bad[0]=bad[0,::-1];self.assertFalse(closed_consistent_shell(bad))
        with self.assertRaises(ValueError):winding_numbers([[0,0,0]],V,F[:-1])

if __name__=='__main__':unittest.main()
