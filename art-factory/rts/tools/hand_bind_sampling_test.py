import unittest
import numpy as np
from hand_bind_sampling import adaptive_linear_keys


class AdaptiveKeysTests(unittest.TestCase):
    def test_exact_linear_track_needs_only_endpoints(self):
        self.assertEqual(adaptive_linear_keys([0, .2, .5, 1], [[0, 0], [.2, .4], [.5, 1], [1, 2]], 1e-8), [0, 3])

    def test_interior_peak_is_retained_even_when_endpoints_match(self):
        self.assertEqual(adaptive_linear_keys([0, .5, 1], [[0], [1], [0]], .01), [0, 1, 2])

    def test_all_measured_samples_respect_error_budget(self):
        times = np.linspace(0, 1, 129)
        values = np.column_stack((np.sin(times * 5), times ** 2))
        keys = adaptive_linear_keys(times, values, .0001)
        rebuilt = np.column_stack([np.interp(times, times[keys], values[keys, i]) for i in range(2)])
        self.assertLessEqual(np.linalg.norm(values - rebuilt, axis=1).max(), .0001)
        self.assertLess(len(keys), len(times))

    def test_nonincreasing_time_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'increasing'):
            adaptive_linear_keys([0, 0, 1], [[0], [1], [2]], .01)

    def test_nonfinite_values_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'finite'):
            adaptive_linear_keys([0, 1], [[0], [float('nan')]], .01)


if __name__ == '__main__':
    unittest.main()
