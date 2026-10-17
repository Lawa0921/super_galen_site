import unittest
import numpy as np
from building_stage_normals import restore_triangle_normals

class PublishedNormalPreservationTests(unittest.TestCase):
    def test_restores_original_triangle_corners_and_orthogonal_tangent(self):
        before=np.array([[.004,0,.999992]]*3,dtype=np.float32)
        normals,tangents,report=restore_triangle_normals([('triangle',(0,1,2))],before,np.array([[1,0,.001,1]]*3,dtype=np.float32),{'triangle':[np.array([[0,0,1]]*3,dtype=np.float32)]})
        np.testing.assert_array_equal(normals,[[0,0,1]]*3)
        self.assertLess(abs(float(np.dot(normals[0],tangents[0,:3]))),1e-6)
        self.assertAlmostEqual(float(np.linalg.norm(tangents[0,:3])),1,places=6)
        self.assertEqual(tangents[0,3],1)
        self.assertEqual(report['vertices_restored'],3)
        self.assertEqual(report['matched_triangles'],1)
    def test_shared_position_uv_hard_edge_uses_directed_face_identity(self):
        first=(0,0,0,0,0)
        face_z=('stone',(first,(1,0,0,1,0),(0,1,0,0,1)))
        face_x=('stone',(first,(0,1,0,0,1),(0,0,1,1,0)))
        before=np.array([[0,0,1]]*3+[[1,0,0]]*3,dtype=np.float32)
        normals,_,_=restore_triangle_normals([(face_z,(0,1,2)),(face_x,(3,4,5))],before,None,{face_z:[before[:3]],face_x:[before[3:]]})
        np.testing.assert_array_equal(normals[0],[0,0,1]);np.testing.assert_array_equal(normals[3],[1,0,0])
    def test_ambiguous_duplicate_triangle_normals_are_rejected(self):
        with self.assertRaises(ValueError): restore_triangle_normals([('same',(0,1,2))],np.array([[0,0,1]]*3),None,{'same':[np.array([[0,0,1]]*3),np.array([[1,0,0]]*3)]})
    def test_unmatched_triangle_refuses_silent_fallback(self):
        with self.assertRaises(ValueError): restore_triangle_normals([('missing',(0,1,2))],np.array([[0,0,1]]*3),None,{})
    def test_large_source_drift_is_rejected(self):
        with self.assertRaises(ValueError): restore_triangle_normals([('triangle',(0,1,2))],np.array([[0,1,0]]*3),None,{'triangle':[np.array([[0,0,1]]*3)]})
    def test_merged_vertex_with_conflicting_original_normals_is_rejected(self):
        with self.assertRaises(ValueError): restore_triangle_normals([('a',(0,1,2)),('b',(0,3,4))],np.array([[0,0,1]]*5),None,{'a':[np.array([[0,0,1]]*3)],'b':[np.array([[.004,0,.999992]]*3)]})

if __name__=='__main__': unittest.main()
