"""Small regression checks for exact browser/Blender point correspondence."""
import unittest
import sys
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from original_guard_clean_arm_parity import nearest_indices


class ParityIndexTests(unittest.TestCase):
    def test_spatial_hash_matches_points_with_float_export_noise(self):
        expected=np.array([[0.,0.,0.],[.001,0.,0.],[1.,2.,3.],[-.002,.004,.006]])
        queries=expected[[2,0,3,1]]+np.array([[2e-7,0.,0.],[0.,-1e-7,0.],
                                             [0.,0.,3e-7],[-1e-7,1e-7,0.]])
        indices,distance=nearest_indices(expected,queries)
        np.testing.assert_array_equal(indices,[2,0,3,1])
        self.assertLess(float(distance.max()),1e-6)

    def test_nearest_mapping_rejects_an_unmatched_point(self):
        with self.assertRaises(ValueError):
            nearest_indices(np.array([[0.,0.,0.]]),np.array([[.1,.1,.1]]))


if __name__ == "__main__":
    unittest.main()
