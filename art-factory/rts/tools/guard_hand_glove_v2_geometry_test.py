import unittest
from guard_hand_glove_v2_geometry import directed_boundary_loops,equal_ring_bridge,patch_offset,proximal_cuff_release
from guard_hand_foundation_math import edge_uses

class CleanupTests(unittest.TestCase):
    def test_face_directed_boundary_preserves_existing_uses(self):
        faces=[[0,1,2],[0,2,3]]
        self.assertEqual(directed_boundary_loops(faces),[[0,1,2,3]])
        self.assertEqual(directed_boundary_loops([list(reversed(f)) for f in faces]),[[0,3,2,1]])

    def test_one_to_one_collar_opposes_every_inner_edge(self):
        faces=[[0,1,2],[0,2,3]]
        bridge=equal_ring_bridge([0,1,2,3],[4,5,6,7])
        self.assertEqual(len(bridge),4)
        for (a,b),uses in edge_uses(faces+bridge).items():
            if len(uses)==2:self.assertEqual(uses[0][:2],tuple(reversed(uses[1][:2])))
        self.assertEqual(directed_boundary_loops(faces+bridge),[[4,5,6,7]])

    def test_refuses_nonmanifold_same_use_and_wrong_count(self):
        with self.assertRaises(ValueError):directed_boundary_loops([[0,1,2],[0,1,3]])
        with self.assertRaises(ValueError):equal_ring_bridge([0,1,2],[3,4,5,6])

    def test_patch_preserves_outside_and_disabled_back(self):
        self.assertEqual(patch_offset((0,0,0),(0,0,0),(1,1,1),(.1,0,0)),(.1,0,0))
        self.assertEqual(patch_offset((1,0,0),(0,0,0),(1,1,1),(.1,0,0)),(1,0,0))
        self.assertEqual(patch_offset((0,0,0),(0,0,0),(1,1,1),(.1,0,0),False),(0,0,0))
        with self.assertRaises(ValueError):patch_offset((0,0,0),(0,0,0),(0,1,1),(.1,0,0))

    def test_measured_cuff_patch_keeps_digit_outside_and_moves_root_only(self):
        p=(.014,.028,.037);q=proximal_cuff_release(p,.008,.051,-.955779)
        self.assertEqual(p[:2],q[:2]);self.assertLess(q[2],p[2]);self.assertGreater(.008+(q[2]-p[2])*(-.955779),.0148)
        for point,h,r in [((-.014,.028,.028),.020,.060),((.014,.028,.018),.008,.051),(p,.025,.051),(p,.008,.040)]:
            self.assertEqual(proximal_cuff_release(point,h,r,-.955779),point)
        with self.assertRaises(ValueError):proximal_cuff_release(p,.008,.051,0)

if __name__=='__main__':unittest.main()
