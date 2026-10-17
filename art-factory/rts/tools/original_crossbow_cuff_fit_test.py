import unittest
import numpy as np
from original_crossbow_cuff_fit_math import boundary_point, palm_weight


class CuffFitTest(unittest.TestCase):
    def test_actual_polygon_edge_not_circle(self):
        ring=np.array([[-2,-1,.1],[2,-1,.1],[2,1,.3],[-2,1,.3]])
        np.testing.assert_allclose(boundary_point(ring,[1,1]),[1,1,.3])
        np.testing.assert_allclose(boundary_point(ring,[1,0]),[2,0,.2])

    def test_terminal_and_outside_remain_exact(self):
        self.assertEqual(palm_weight(0,.12),1)
        self.assertEqual(palm_weight(.12,.12),0)
        self.assertEqual(palm_weight(.2,.12),0)
        self.assertAlmostEqual(palm_weight(.06,.12),.5)

    def test_invalid_open_section_rejected(self):
        with self.assertRaises(ValueError):boundary_point([[1,1,0],[2,1,0],[1,2,0]],[-1,0])
        with self.assertRaises(ValueError):boundary_point([[1,1,0],[2,1,0],[1,2,0]],[0,0])


if __name__=='__main__':unittest.main()
