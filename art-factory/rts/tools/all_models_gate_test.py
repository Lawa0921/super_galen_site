import unittest
from all_models_gate import floor_failure


class FloorAcceptance(unittest.TestCase):
    def test_grounded_idle_and_small_contact_tolerance(self):
        self.assertIsNone(floor_failure({'clip': 'Idle', 'lowest': -.004}))
        self.assertIsNone(floor_failure({'clip': 'Idle', 'lowest': .002}))

    def test_floating_crossbow_is_rejected(self):
        self.assertIn('floats', floor_failure({'clip': 'Idle', 'lowest': .180573}))

    def test_death_below_ground_is_rejected(self):
        self.assertIn('crosses', floor_failure({'clip': 'Death', 'lowest': -.02}))

    def test_motion_height_is_not_confused_with_idle_contact(self):
        self.assertIsNone(floor_failure({'clip': 'Walk', 'lowest': .04}))


if __name__ == '__main__':
    unittest.main()
