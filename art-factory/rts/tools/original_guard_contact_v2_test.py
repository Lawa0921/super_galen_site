"""Retime constraints and physical-contact acceptance must fail closed."""
import unittest
from original_guard_contact_v2_math import source_frame, contact_failures

class ContactRetimeTests(unittest.TestCase):
    def test_authored_contact_maps_to_existing_strike_pose(self):
        self.assertAlmostEqual(source_frame(16),18)
    def test_anticipation_recovery_endpoints_unchanged(self):
        for t in (0,2,8,24,30,36):self.assertEqual(source_frame(t),t)
    def test_time_never_runs_backwards(self):
        ts=[source_frame(i/100) for i in range(3601)]
        self.assertTrue(all(b>a for a,b in zip(ts,ts[1:])))
    def test_derivative_is_continuous_at_knots(self):
        for t in (8,16,24):
            h=1e-5
            self.assertAlmostEqual((source_frame(t+h)-source_frame(t))/h,(source_frame(t)-source_frame(t-h))/h,places=4)
    def test_rejects_prior_damage_gap_and_authored_gap(self):
        self.assertTrue(contact_failures([.016859],.098884))
    def test_accepts_actual_intersection(self):
        self.assertEqual(contact_failures([0,0,0],0),[])
    def test_missing_or_nonfinite_geometry_is_not_pass(self):
        self.assertTrue(contact_failures([],None))
        self.assertTrue(contact_failures([float('nan')],0))

if __name__=='__main__':unittest.main()
