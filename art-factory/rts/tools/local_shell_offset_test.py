import unittest
import numpy as np
from local_shell_offset import miter_offsets, repair_inner_layer


class LocalShellOffsetTest(unittest.TestCase):
    def test_planar_patch_has_exact_thickness(self):
        p=np.array([[0.,0,0],[1,0,0],[1,1,0],[0,1,0]])
        f=np.array([[0,1,2],[0,2,3]])
        offsets=miter_offsets(p,f,range(4),.002,.006)
        np.testing.assert_allclose(offsets,[[0,0,-.002]]*4,atol=1e-12)

    def test_corner_preserves_normal_thickness_on_both_faces(self):
        p=np.array([[0.,0,0],[0,1,0],[0,0,1],[1,0,0]])
        f=np.array([[0,1,2],[0,3,1]])
        offsets=miter_offsets(p,f,[0,1],.002,.006)
        np.testing.assert_allclose(offsets[:2],[[-.002,0,-.002]]*2,atol=1e-12)
        np.testing.assert_array_equal(offsets[2:],0)

    def test_impossible_opposed_normals_fail_without_reducing_thickness(self):
        p=np.array([[0.,0,0],[1,0,0],[0,1,0]])
        with self.assertRaisesRegex(ValueError,'feasible'):
            miter_offsets(p,np.array([[0,1,2],[0,2,1]]),[0],.002,.006)

    def test_repair_preserves_outer_and_unselected_inner_vertices(self):
        outer=np.array([[0.,0,0],[1,0,0],[0,1,0]])
        vertices=np.concatenate([outer,outer+[0,0,-.001]])
        fixed=repair_inner_layer(vertices,np.array([[0,1,2]]),[0],.002,.006)
        np.testing.assert_array_equal(fixed[:3],outer)
        np.testing.assert_array_equal(fixed[4:],vertices[4:])
        np.testing.assert_allclose(fixed[3],[0,0,-.002])

    def test_invalid_or_degenerate_input_is_rejected(self):
        p=np.array([[0.,0,0],[1,0,0],[0,1,0]])
        for thick,limit in [(0,.006),(.002,.001)]:
            with self.assertRaises(ValueError):miter_offsets(p,np.array([[0,1,2]]),[0],thick,limit)
        with self.assertRaisesRegex(ValueError,'degenerate'):
            miter_offsets(p,np.array([[0,0,1]]),[0],.002,.006)


if __name__=='__main__':unittest.main()
