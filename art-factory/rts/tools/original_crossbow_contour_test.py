import unittest
import numpy as np
from original_crossbow_contour import fractions

class ContourTest(unittest.TestCase):
    def test_irregular_spacing_preserves_short_edge(self):
        ring=[[0,0,0],[.01,0,0],[2,0,0],[2,1,0],[0,1,0]]
        np.testing.assert_allclose(fractions(ring),[0,.01/6,2/6,3/6,5/6])
    def test_uniform_square(self):
        np.testing.assert_allclose(fractions([[0,0,0],[1,0,0],[1,1,0],[0,1,0]]),[0,.25,.5,.75])
    def test_rejects_degenerate_and_nonfinite(self):
        for ring in [[[0,0,0]]*3,[[0,0,0],[0,0,0],[1,0,0]],[[0,0,0],[1,0,0],[0,float('nan'),0]]]:
            with self.assertRaises(ValueError):fractions(ring)

if __name__=='__main__':unittest.main()
