import unittest
import numpy as np
from arm_pole_motion import transport_pole_basis, replace_angle_span, hermite_track, sample_derivative, pole_direction_track


class ArmPoleMotionTest(unittest.TestCase):
    def test_explicit_sides_keep_distinct_tangents_at_a_source_key_kink(self):
        def sample(i):
            return 2*i if i <= 3 else 6+5*(i-3)
        self.assertEqual(sample_derivative(sample, 3, 1., 6, 'backward'), 2.)
        self.assertEqual(sample_derivative(sample, 3, 1., 6, 'forward'), 5.)
        self.assertEqual(sample_derivative(sample, 3, 1., 6), 3.5)

    def test_explicit_side_cannot_fall_back_across_an_endpoint_or_accept_a_typo(self):
        for index, side in ((0, 'backward'), (8, 'forward'), (4, 'outside')):
            with self.assertRaises(ValueError):
                sample_derivative(lambda i: float(i), index, .125, 8, side)

    def test_authored_pole_turn_uses_an_arc_without_collapsing_toward_reach_axis(self):
        t = np.linspace(0, 4, 129)
        axes = np.tile([0., 0., 1.], (len(t), 1))
        angle = 2.5
        directions, angles = pole_direction_track(t, axes, [1, 0, 0], [np.cos(angle), np.sin(angle), 0], [angle/4, angle/4])
        np.testing.assert_allclose(np.linalg.norm(directions, axis=1), 1, atol=1e-12)
        np.testing.assert_allclose(directions[:, 2], 0, atol=1e-12)
        np.testing.assert_allclose(angles, angle*t/4, atol=1e-12)

    def test_pole_track_rejects_collinear_endpoint_and_ambiguous_half_turn(self):
        for end in ([0, 0, 1], [-1, 0, 0]):
            with self.assertRaises(ValueError):
                pole_direction_track([0, 1], [[0, 0, 1], [0, 0, 1]], [1, 0, 0], end, [0, 0])

    def test_endpoint_derivatives_do_not_wrap_to_the_opposite_clip_end(self):
        step = .125
        def sample(i):
            self.assertGreaterEqual(i, 0)
            self.assertLessEqual(i, 8)
            t = i*step
            return np.array([t*t+3*t, 2*t])
        for i in (0, 4, 8):
            np.testing.assert_allclose(sample_derivative(sample, i, step, 8), [2*i*step+3, 2], atol=1e-12)

    def test_derivative_rejects_insufficient_or_invalid_sampling_domain(self):
        for index, step, last in ((0, .125, 1), (-1, .125, 8), (9, .125, 8), (0, 0, 8)):
            with self.assertRaises(ValueError):
                sample_derivative(lambda i: float(i), index, step, last)

    def test_authored_position_track_reproduces_a_cubic_and_endpoint_velocities(self):
        knots = np.array([0., 2., 5.])
        values = np.column_stack((knots**3, 2*knots))
        derivatives = np.column_stack((3*knots**2, np.full_like(knots, 2)))
        times = np.linspace(0, 5, 101)
        result = hermite_track(times, knots, values, derivatives)
        np.testing.assert_allclose(result, np.column_stack((times**3, 2*times)), atol=1e-11)

    def test_authored_track_rejects_extrapolation_and_mismatched_tangents(self):
        with self.assertRaises(ValueError):
            hermite_track([-1], [0,1], [[0],[1]], [[0],[0]])
        with self.assertRaises(ValueError):
            hermite_track([.5], [0,1], [[0],[1]], [[0]])

    def test_basis_follows_moving_reach_axis_without_a_sign_jump(self):
        t = np.linspace(0, 1, 401)
        axes = np.column_stack((np.sin(t*2), np.zeros_like(t), np.cos(t*2)))
        first, second = transport_pole_basis(axes, [0, 1, 0])
        np.testing.assert_allclose(np.sum(first*axes, axis=1), 0, atol=1e-12)
        np.testing.assert_allclose(np.linalg.norm(first, axis=1), 1, atol=1e-12)
        np.testing.assert_allclose(np.cross(axes, first), second, atol=1e-12)
        self.assertGreater(np.sum(first[:-1]*first[1:], axis=1).min(), .999)

    def test_antipodal_reach_axis_is_rejected_explicitly(self):
        with self.assertRaises(ValueError):
            transport_pole_basis([[0, 0, 1], [0, 0, -1]], [0, 1, 0])

    def test_local_spike_is_smoothed_and_outside_values_are_exactly_retained(self):
        t = np.linspace(0, 20, 2561)
        source = .1*t + 2*np.exp(-((t-13)/.14)**2)
        result = replace_angle_span(t, source, 9, 18, blend_frames=2)
        outside = (t <= 9) | (t >= 18)
        np.testing.assert_array_equal(result[outside], source[outside])
        self.assertLess(np.max(abs(np.diff(result))), np.max(abs(np.diff(source)))*.05)
        np.testing.assert_allclose(result[(t>=11)&(t<=16)], .1*t[(t>=11)&(t<=16)], atol=1e-10)

    def test_endpoint_first_and_second_derivatives_are_preserved(self):
        t = np.linspace(0, 20, 20001)
        source = np.sin(t*.3)
        result = replace_angle_span(t, source, 9, 18, blend_frames=2)
        diff = result - source
        for endpoint in (9, 18):
            i = np.argmin(abs(t-endpoint))
            self.assertLess(abs((diff[i+1]-diff[i-1])/.002), 1e-6)
            self.assertLess(abs((diff[i+1]-2*diff[i]+diff[i-1])/1e-6), .003)

    def test_invalid_or_unsampled_boundaries_fail_closed(self):
        for start, end, blend in ((2,1,.2), (.15,1,.2), (0,1,0), (0,1,.6)):
            with self.assertRaises(ValueError):
                replace_angle_span(np.linspace(0,2,21), np.zeros(21), start,end,blend)


if __name__ == '__main__':
    unittest.main()
