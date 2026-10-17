import unittest

import numpy as np

from sleeve_relief_math import relief_weights


class ReliefWeightsTests(unittest.TestCase):
    def test_fixed_boundary_and_harmonic_transition(self):
        points = np.array([[0, 1, 0]] * 7, float)
        edges = [(i, i + 1) for i in range(6)]
        weights = relief_weights(points, edges, list(range(7)), {1, 2, 3, 4, 5}, {3})
        np.testing.assert_allclose(weights, [0, 0, .5, 1, .5, 0, 0])
        self.assertEqual(float(weights.max()), 1.)

    def test_boundary_core_does_not_move(self):
        points = np.array([[0, 1, 0]] * 7, float)
        weights = relief_weights(points, [(i, i + 1) for i in range(6)], list(range(7)), {1, 2, 3, 4, 5}, {1, 3, 5})
        self.assertEqual(weights[1], 0)
        self.assertEqual(weights[5], 0)

    def test_rejects_missing_source_id_and_no_active_core(self):
        points = np.array([[0, 1, 0]] * 3, float)
        with self.assertRaises(ValueError):
            relief_weights(points, [(0, 1), (1, 2)], [0, 1, 2], {1, 9}, {1})
        with self.assertRaises(ValueError):
            relief_weights(points, [(0, 1), (1, 2)], [0, 1, 2], {1}, {1})


if __name__ == '__main__':
    unittest.main()
