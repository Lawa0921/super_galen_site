"""Controlled armor roll: preserve anchors and all poses outside its window."""
import unittest

import numpy as np

from armor_twist_track import TwistWindow, correct_module_skins, signed_twist
from original_guard_arm_hinge import rotation


class ArmorTwistTrackTest(unittest.TestCase):
    def test_signed_roll_and_unwrap_cross_the_pi_branch_without_reversing(self):
        axis = np.array([0., 0., 1.])
        angles = np.deg2rad([165., 175., 185., 195.])
        measured = [signed_twist(rotation(axis, np.rad2deg(a)), np.eye(3), axis) for a in angles]
        np.testing.assert_allclose(np.unwrap(measured), angles, atol=1e-12)

    def test_window_preserves_endpoints_outside_and_central_endpoint_velocity(self):
        times = np.arange(0., 4.125, .125)
        values = np.column_stack((.1*times**3, .2*times**2))
        track = TwistWindow(times, values, 1., 3.)
        for t in (0., .5, 1., 3., 3.5, 4.):
            row = np.array([np.interp(t, times, values[:, c]) for c in range(2)])
            np.testing.assert_allclose(track.correction(t, row), [0., 0.], atol=1e-12)
        for t, sign in ((1., 1), (3., -1)):
            eps = 1e-6
            finite = (track.target(t+sign*eps)-track.target(t))/(sign*eps)
            i = int(t*8)
            expected = (values[i+1]-values[i-1])/.25
            np.testing.assert_allclose(finite, expected, atol=2e-6)
        # The sample's principal-angle branch must not change the correction.
        raw = values[16]
        np.testing.assert_allclose(track.correction(2., raw-2*np.pi), track.correction(2., raw), atol=1e-12)

    def test_correction_is_rigid_preserves_all_anchors_and_averages_couter_roll(self):
        rest = np.array([[0., 0., 1.], [0., 0., 0.], [0., .8, -.6]])
        posed = rest + [2., 3., 4.]
        raw = np.repeat(np.eye(4)[None], 3, axis=0)
        raw[:, :3, 3] = [2., 3., 4.]
        out = correct_module_skins(rest, posed, raw, [.3, -.1])
        for i, anchor in enumerate((0, 1, 1)):
            np.testing.assert_allclose(out[i, :3, :3].T @ out[i, :3, :3], np.eye(3), atol=1e-12)
            np.testing.assert_allclose(out[i, :3, :3] @ rest[anchor]+out[i, :3, 3], posed[anchor], atol=1e-12)
        axes = np.diff(posed, axis=0)
        axes /= np.linalg.norm(axes, axis=1)[:, None]
        np.testing.assert_allclose(out[2, :3, :3], rotation(axes.sum(axis=0), np.rad2deg(.1)), atol=1e-12)

    def test_invalid_window_and_nonfinite_values_fail_explicitly(self):
        times = np.arange(5.)
        for start, end in ((0., 3.), (1., 4.), (2., 1.), (1.25, 3.)):
            with self.assertRaises(ValueError):
                TwistWindow(times, np.zeros((5, 2)), start, end)
        with self.assertRaises(ValueError):
            TwistWindow(times, np.full((5, 2), np.nan), 1., 3.)


if __name__ == '__main__':
    unittest.main()
