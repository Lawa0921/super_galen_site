"""Behavior gates for an actual shot/load cycle, independent of Blender export."""
import unittest
from original_crossbow_complete_motion import mechanism, finger_opening, DURATION_FRAMES, RELEASE_FRAME

class OriginalMechanismTests(unittest.TestCase):
    def test_loaded_bolt_and_string_are_ready_before_release(self):
        for t in [-2,0,RELEASE_FRAME-.001]:
            state=mechanism(t)
            self.assertEqual(state['draw'],1)
            self.assertEqual(state['bolt_visible'],1)
        self.assertEqual(mechanism(RELEASE_FRAME)['draw'],1)

    def test_string_fires_before_reload_and_cannot_reset_early(self):
        self.assertEqual(mechanism(RELEASE_FRAME+1)['draw'],0)
        self.assertEqual(mechanism(RELEASE_FRAME+1)['bolt_visible'],0)
        self.assertEqual(mechanism(21)['draw'],0)
        self.assertGreater(mechanism(27)['draw'],0)
        self.assertLess(mechanism(27)['draw'],1)
        self.assertEqual(mechanism(30)['draw'],1)

    def test_bolt_is_not_loaded_until_string_is_latched(self):
        self.assertEqual(mechanism(28)['bolt_visible'],0)
        self.assertEqual(mechanism(33)['bolt_visible'],1)
        self.assertEqual(mechanism(38)['bolt_on_rail'],1)

    def test_cycle_boundaries_and_continuity(self):
        self.assertEqual(mechanism(0),mechanism(DURATION_FRAMES))
        self.assertEqual(mechanism(DURATION_FRAMES+9),mechanism(DURATION_FRAMES))
        rows=[mechanism(i/100) for i in range(DURATION_FRAMES*100+1)]
        self.assertTrue(all(0<=s[k]<=1 for s in rows for k in s))
        # A fast release is intentional; drawing the string must be continuous.
        draw=[mechanism(i/100)['draw'] for i in range(2200,3001)]
        self.assertTrue(all(b>=a for a,b in zip(draw,draw[1:])))
        self.assertLess(max(abs(b-a) for a,b in zip(draw,draw[1:])),.004)

    def test_hand_does_not_pop_between_release_draw_and_loading(self):
        self.assertEqual(finger_opening(20),0)
        self.assertEqual(finger_opening(22),1)
        self.assertEqual(finger_opening(24),.35)
        self.assertEqual(finger_opening(38),0)
        samples=[finger_opening(i/1000) for i in range(20000,40001)]
        self.assertLess(max(abs(a-b) for a,b in zip(samples,samples[1:])),.002)

if __name__=='__main__':unittest.main()
