"""Surface repair removes a fold while preserving a position-fixed collar."""
import unittest
import numpy as np
from original_glove_surface_fairing import fair_patch

class SurfaceFairingTest(unittest.TestCase):
    def grid(self):
        n=25
        x,z=np.meshgrid(np.linspace(-1,1,n),np.linspace(-1,1,n))
        points=np.column_stack([x.ravel(),np.zeros(n*n),z.ravel()])
        faces=[]
        for row in range(n-1):
            for col in range(n-1):
                a=row*n+col
                faces.extend([[a,a+1,a+n],[a+1,a+n+1,a+n]])
        return points,np.asarray(faces),n

    def test_removes_fold_with_steep_walls_and_preserves_collar(self):
        points,faces,n=self.grid()
        source=points.copy()
        source[:,1]=.18*np.exp(-((source[:,0]/.50)**2+(source[:,2]/.10)**2))
        # Tangent collar belongs to a flat original surface; the bump is local.
        roi=(abs(source[:,0])<.85)&(abs(source[:,2])<.85)
        source[(abs(source[:,0])>.70)|(abs(source[:,2])>.70),1]=0
        result,info=fair_patch(source,faces,roi)
        np.testing.assert_array_equal(result[~roi],source[~roi])
        np.testing.assert_array_equal(result[~info['free_mask']],source[~info['free_mask']])
        self.assertLess(abs(result[:,1]).max(),1e-8)
        np.testing.assert_allclose(result[:,[0,2]],points[:,[0,2]],atol=1e-8)
        self.assertEqual(info['components'],1)

    def test_empty_patch_is_rejected(self):
        points,faces,_=self.grid()
        with self.assertRaisesRegex(ValueError,'empty'):
            fair_patch(points,faces,np.zeros(len(points),dtype=bool))

    def test_disconnected_collar_only_island_is_rejected(self):
        points,faces,_=self.grid()
        roi=(abs(points[:,0])<.7)&(abs(points[:,2])<.7)
        roi[0]=True
        with self.assertRaisesRegex(ValueError,'disconnected'):
            fair_patch(points,faces,roi)

if __name__=='__main__':unittest.main()
