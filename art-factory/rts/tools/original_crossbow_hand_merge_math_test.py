import unittest
import numpy as np
from original_crossbow_hand_merge_math import frame_map

def rigid(rotation,translation):
    result=np.eye(4);result[:3,:3]=rotation;result[:3,3]=translation;return result

class HandAttachmentTests(unittest.TestCase):
    def test_attachment_preserves_rest_roll_and_relative_point(self):
        source=rigid([[0,-1,0],[1,0,0],[0,0,1]],[1,2,3])
        target=rigid([[1,0,0],[0,0,-1],[0,1,0]],[-2,4,1])
        # The source point lies two units along its local +Y, including roll.
        point=np.array([-1,2,3,1]);expected=np.array([-2,4,3,1])
        np.testing.assert_allclose(frame_map(source,target)@point,expected,atol=1e-12)
    def test_attached_multibone_skin_matches_source_motion(self):
        source_anchor=rigid(np.eye(3),[.1,.2,.3])
        body_rest=rigid([[0,0,1],[0,1,0],[-1,0,0]],[.4,-.2,1])
        body_pose=rigid([[0,-1,0],[1,0,0],[0,0,1]],[-.1,.3,1.4])
        bind_a=rigid(np.eye(3),[.1,.2,.4]);bind_b=rigid(np.eye(3),[.1,.2,.5])
        posed_a=rigid([[1,0,0],[0,0,-1],[0,1,0]],[.1,.2,.4])
        posed_b=rigid([[0,-1,0],[1,0,0],[0,0,1]],[.1,.2,.5])
        point=np.array([.12,.19,.47,1]);rest_map=frame_map(source_anchor,body_rest);pose_map=frame_map(source_anchor,body_pose)
        source=.35*(posed_a@np.linalg.inv(bind_a)@point)+.65*(posed_b@np.linalg.inv(bind_b)@point)
        merged=sum(w*((pose_map@pose)@np.linalg.inv(rest_map@bind)@(rest_map@point)) for w,bind,pose in [(.35,bind_a,posed_a),(.65,bind_b,posed_b)])
        np.testing.assert_allclose(merged,pose_map@source,atol=1e-12)
    def test_reflection_or_scale_is_not_silently_attached(self):
        for factor in [-1,1.1,0]:
            bad=np.eye(4);bad[0,0]=factor
            with self.assertRaises(ValueError):frame_map(np.eye(4),bad)
    def test_invalid_or_nonfinite_frames_are_rejected(self):
        for bad in [np.eye(3),np.full((4,4),np.nan),np.zeros((4,4))]:
            with self.assertRaises(ValueError):frame_map(bad,np.eye(4))
if __name__=='__main__':unittest.main()
