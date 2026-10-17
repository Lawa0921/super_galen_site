import unittest
from guard_sleeve_comparison_connectivity import exterior_connected

class BackgroundConnectivityTests(unittest.TestCase):
    def test_open_v_notch_is_external(self):
        misses={(2,0),(2,1),(2,2)}
        self.assertEqual(exterior_connected(misses,[0,0,4,4],1),misses)
    def test_internal_hole_is_not_external(self):
        misses={(0,0),(1,0),(0,1),(2,2)}
        self.assertEqual(exterior_connected(misses,[0,0,4,4],1),misses-{(2,2)})
    def test_diagonal_contact_does_not_bridge_closed_edge(self):
        self.assertEqual(exterior_connected({(0,0),(1,1)},[0,0,2,2],1),{(0,0)})
    def test_actual_two_pixel_sampling_step(self):
        self.assertEqual(exterior_connected({(4,1),(4,3),(4,5)},[0,1,8,9],2),{(4,1),(4,3),(4,5)})
if __name__=='__main__':unittest.main()
