"""Pure motion-contract tests for the original guard animation rebuild."""

import math
import unittest

from original_guard_motion_spec import (
    ATTACK_CONTACT_S,
    ATTACK_DURATION_S,
    CLIP_DURATIONS_S,
    JOG_CYCLE_S,
    JOG_SPEED_MPS,
    JOG_STRIDE_M,
    guarded_jog_foot,
)


class GuardedJogContractTest(unittest.TestCase):
    def test_stance_foot_cancels_three_metre_per_second_translation(self):
        """Catches a stance curve whose slope no longer matches runtime speed."""

        for side in ("L", "R"):
            samples = []
            for frame in range(41):
                time_s = frame / 60.0
                foot = guarded_jog_foot(time_s, side)
                if foot.stance and 1e-6 < foot.stance_phase < 1.0 - 1e-6:
                    samples.append(foot.forward_m + JOG_SPEED_MPS * time_s)
                    self.assertAlmostEqual(foot.lift_m, 0.0, places=9)
            self.assertGreaterEqual(len(samples), 4)
            self.assertLess(max(samples) - min(samples), 1e-8)

    def test_cycle_speed_and_loop_seam_are_exact(self):
        """Catches duration/stride drift and a visible foot pop at the loop seam."""

        self.assertAlmostEqual(JOG_STRIDE_M / JOG_CYCLE_S, 3.0, places=9)
        for side in ("L", "R"):
            start = guarded_jog_foot(0.0, side)
            end = guarded_jog_foot(JOG_CYCLE_S, side)
            self.assertAlmostEqual(start.forward_m, end.forward_m, places=9)
            self.assertAlmostEqual(start.lift_m, end.lift_m, places=9)

    def test_swing_has_clearance_and_attack_timing_matches_gameplay(self):
        """Catches a flat swing arc or a return to the obsolete 1.6667 s attack."""

        peak = max(guarded_jog_foot(i * JOG_CYCLE_S / 240.0, "L").lift_m for i in range(241))
        self.assertGreaterEqual(peak, 0.12)
        self.assertEqual(CLIP_DURATIONS_S["Attack"], ATTACK_DURATION_S)
        self.assertAlmostEqual(ATTACK_DURATION_S, 1.2, places=9)
        self.assertGreater(ATTACK_CONTACT_S, 0.35)
        self.assertLess(ATTACK_CONTACT_S, 0.75)
        self.assertTrue(math.isfinite(ATTACK_CONTACT_S))


if __name__ == "__main__":
    unittest.main()
