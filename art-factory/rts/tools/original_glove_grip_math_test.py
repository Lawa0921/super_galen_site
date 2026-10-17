import unittest
import numpy as np
from original_glove_grip_math import deform

class ContactKinematicsTests(unittest.TestCase):
 def fixture(self):
  return {'points':[[0,0,0],[1,3,0],[1,1,0]],'bones':{'Hand_L':{'head':[0,0,0],'tail':[0,1,0],'axis':[]},**{f'Index{i}_L':{'head':[1,i-1,0],'tail':[1,i,0],'axis':[0,0,1]} for i in [1,2,3]}},'weights':[{'Hand_L':1},{'Index3_L':1},{'Hand_L':.5,'Index1_L':.5}]}
 def test_root_rotation_preserves_chain_length_and_stationary_wrist(self):
  actual=deform(self.fixture(),{'Index':[90,0,0]})
  np.testing.assert_allclose(actual,[[0,0,0],[-2,0,0],[.5,.5,0]],atol=1e-12)
 def test_distal_hinge_keeps_proximal_point_at_rest(self):
  actual=deform(self.fixture(),{'Index':[0,0,90]})
  np.testing.assert_allclose(actual,[[0,0,0],[0,2,0],[1,1,0]],atol=1e-12)
 def test_zero_pose_retains_all_original_points(self):
  data=self.fixture();np.testing.assert_array_equal(deform(data,{}),data['points'])
 def test_root_swing_rotates_connected_chain_without_moving_root(self):
  actual=deform(self.fixture(),{}, {'Index':{'axis':[1,0,0],'degrees':90}})
  np.testing.assert_allclose(actual,[[0,0,0],[1,0,3],[1,.5,.5]],atol=1e-12)
 def test_zero_swing_does_not_change_existing_curl(self):
  data=self.fixture();angles={'Index':[30,40,20]}
  np.testing.assert_allclose(deform(data,angles,{'Index':{'axis':[1,0,0],'degrees':0}}),deform(data,angles),atol=1e-12)

if __name__=='__main__':unittest.main()
