"""Behavior checks for a bounded original-source outer-surface patch."""
import importlib.util
from pathlib import Path
import unittest

import numpy as np

spec = importlib.util.spec_from_file_location(
    "patch", Path(__file__).with_name("original_guard_arm_surface_patch.py"))
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)


class SurfacePatchTests(unittest.TestCase):
    def test_fairs_folded_interior_while_fixing_patch_boundary(self):
        rows, width = 5, 7
        outer = np.array([[j * .01, i * .01, 0.] for i in range(rows) for j in range(width)])
        outer[2 * width + 3, 2] = .005
        source = outer.copy()
        source[2 * width + 3, 2] = 0.
        interior = [i * width + j for i in (1, 2, 3) for j in (2, 3, 4)]
        moved = patch.fair_outer_patch(outer, rows, width, interior, source, .006)
        fixed = sorted(set(range(len(outer))) - set(interior))
        self.assertTrue(np.array_equal(moved[fixed], outer[fixed]))
        self.assertLess(abs(moved[2 * width + 3, 2]), .003)
        self.assertLessEqual(np.max(np.linalg.norm(moved - outer, axis=1)), .006000001)

    def test_rejects_nonfinite_or_out_of_range_patch(self):
        outer = np.zeros((12, 3))
        with self.assertRaises(ValueError):
            patch.fair_outer_patch(outer, 3, 4, [12], outer, .006)
        bad = outer.copy()
        bad[0, 0] = np.nan
        with self.assertRaises(ValueError):
            patch.fair_outer_patch(bad, 3, 4, [5], outer, .006)


if __name__ == "__main__":
    unittest.main()
