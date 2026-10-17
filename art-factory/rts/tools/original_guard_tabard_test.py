"""Topology and attachment regressions for source-derived cloth retopology."""
import unittest
from collections import Counter
import numpy as np
from original_guard_tabard_math import closed_cloth, cloth_weights

class ClothTests(unittest.TestCase):
    def test_curved_grid_is_closed_positive_volume_without_degenerate_faces(self):
        rows,cols=7,5
        p=np.array([[(x-.5)*.2,.1+.02*np.cos(x*3),1-z*.5]
                    for z in np.linspace(0,1,rows) for x in np.linspace(0,1,cols)])
        vertices,faces=closed_cloth(p,rows,cols,.003)
        edges=Counter(tuple(sorted((f[i],f[(i+1)%len(f)]))) for f in faces for i in range(len(f)))
        self.assertEqual(set(edges.values()),{2})
        triangles=np.array([[f[0],f[i],f[i+1]] for f in faces for i in range(1,len(f)-1)])
        a,b,c=vertices[triangles].transpose(1,0,2)
        self.assertGreater(np.min(np.linalg.norm(np.cross(b-a,c-a),axis=1)),1e-8)
        self.assertGreater(np.sum(np.einsum('ij,ij->i',a,np.cross(b,c)))/6,0)
        np.testing.assert_array_equal(vertices[:len(p)],p)

    def test_invalid_grid_or_thickness_is_rejected(self):
        for rows,cols,thick in [(1,4,.003),(4,1,.003),(2,2,0),(2,2,-.1)]:
            with self.assertRaises(ValueError): closed_cloth(np.zeros((rows*cols,3)),rows,cols,thick)
        with self.assertRaises(ValueError): closed_cloth(np.zeros((5,3)),2,2,.003)

    def test_thin_warped_sheet_has_matching_front_back_diagonals(self):
        # Independent automatic triangulation of warped quads can choose
        # opposite diagonals and cross a back only 3 mm behind the front.
        p=np.array([[-.1,.1,1],[.1,.13,1],[-.1,.12,.8],[.1,.1,.8]])
        v,faces=closed_cloth(p,2,2,.003)
        front=[f for f in faces if all(i<4 for i in f)]
        back=[f for f in faces if all(i>=4 for i in f)]
        self.assertTrue(all(len(f)==3 for f in front+back))
        self.assertEqual({tuple(sorted(f)) for f in front},
                         {tuple(sorted(i-4 for i in f)) for f in back})

    def test_attachment_is_rigid_and_all_weights_are_normalized(self):
        t=np.linspace(0,1,101)
        w=cloth_weights(t)
        np.testing.assert_array_equal(w[:9],np.tile([1,0,0],(9,1)))
        np.testing.assert_allclose(w.sum(axis=1),1)
        self.assertTrue(np.all(w>=0))
        np.testing.assert_array_equal(w[-1],[0,0,1])

    def test_outside_parameter_range_is_rejected(self):
        for t in [[-.01],[1.01],[float('nan')]]:
            with self.assertRaises(ValueError): cloth_weights(np.array(t))

if __name__=='__main__': unittest.main()
