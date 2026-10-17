import unittest
import numpy as np
from original_crossbow_cuff_corrective_math import area_jacobian

class CorrectiveTest(unittest.TestCase):
    def test_gradient_matches_actual_perturbed_surface(self):
        p=np.array([[0.,0,0],[1,0,.1],[0,1,.2],[1,1,.1]])
        tri=np.array([[0,1,2],[1,3,2]]);group=np.array([-1,0,1,1]);area,jac=area_jacobian(p,tri,group,2)
        for g in range(2):
            for axis in range(3):
                q=p.copy();q[group==g,axis]+=1e-7
                actual=(area_jacobian(q,tri,group,2)[0]-area)/1e-7
                np.testing.assert_allclose(actual,jac[:,g,axis],atol=1e-7)
    def test_whole_triangle_translation_has_zero_area_derivative(self):
        _,jac=area_jacobian(np.array([[0.,0,0],[1,0,0],[0,1,0]]),np.array([[0,1,2]]),np.array([0,0,0]),1)
        np.testing.assert_allclose(jac,0,atol=1e-12)

if __name__=='__main__':unittest.main()
