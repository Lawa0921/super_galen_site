"""Exact Blender near-edge predicate and power-of-two scale regression tests."""

import unittest
from pathlib import Path

import numpy as np

from original_guard_quadri_scaled_math import (blender_near_edge_mask,
                                               scaled_edge_diagnostic,
                                               scale_float32_exact)


ROOT = Path(__file__).resolve().parents[3]
PREPARED = ROOT / "art-factory/rts/runs/original-guard-quadri/2026-10-05/candidate/source-primary-exact.npz"


class BlenderNearEdgeTest(unittest.TestCase):
    def test_componentwise_boundary_is_inclusive_and_not_l2(self):
        threshold = np.float32(1e-4)
        beyond = np.nextafter(threshold, np.float32(np.inf))
        origin = np.zeros((4, 3), dtype=np.float32)
        other = np.array([[threshold, 0, 0],
                          [threshold, threshold, threshold],
                          [beyond, 0, 0],
                          [-beyond, 0, 0]], dtype=np.float32)
        self.assertEqual(blender_near_edge_mask(origin, other).tolist(),
                         [True, True, False, False])

    def test_real_source_1024_fails_and_2048_passes_exact_roundtrip(self):
        source = np.load(PREPARED)
        points, faces = source["vertices"], source["triangles"]
        at_native = scaled_edge_diagnostic(points, faces, 1)
        at_1024 = scaled_edge_diagnostic(points, faces, 1024)
        at_2048 = scaled_edge_diagnostic(points, faces, 2048)
        self.assertEqual(at_native["near_edge_count"], 4632)
        self.assertEqual(at_1024["near_edge_count"], 4)
        self.assertEqual(at_2048["near_edge_count"], 0)
        self.assertAlmostEqual(at_2048["minimum_linf_edge"],
                               1.678466796875e-4, delta=1e-10)
        scaled = scale_float32_exact(points, 2048)
        self.assertTrue(np.array_equal((scaled / np.float32(2048)).view(np.uint32),
                                       points.view(np.uint32)))

    def test_reject_non_power_of_two_or_overflow(self):
        points = np.array([[np.finfo(np.float32).max, 0, 0]], dtype=np.float32)
        with self.assertRaisesRegex(ValueError, "power of two"):
            scale_float32_exact(points, 1000)
        with self.assertRaisesRegex(ValueError, "roundtrip"):
            scale_float32_exact(points, 2048)


if __name__ == "__main__":
    unittest.main()
