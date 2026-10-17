import unittest
from rubble_contact_geometry import segment_distance

class ContactDistance(unittest.TestCase):
 def test_crossing_edge_interiors(self):
  self.assertAlmostEqual(segment_distance((-1,0,0),(1,0,0),(0,-1,.002),(0,1,.002)),.002)
 def test_parallel_segments(self):
  self.assertAlmostEqual(segment_distance((0,0,0),(1,0,0),(0,.3,0),(1,.3,0)),.3)
 def test_closest_endpoint(self):
  self.assertAlmostEqual(segment_distance((0,0,0),(1,0,0),(2,1,0),(2,2,0)),2**.5)
 def test_degenerate_endpoint(self):
  self.assertAlmostEqual(segment_distance((0,0,0),(0,0,0),(1,0,0),(2,0,0)),1)
if __name__=='__main__':unittest.main()
