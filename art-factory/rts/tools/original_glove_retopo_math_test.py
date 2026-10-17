import unittest
import numpy as np
from original_glove_retopo_math import radial_samples

class SectionTest(unittest.TestCase):
    def test_preserves_asymmetric_source_section(self):
        theta=np.linspace(0,2*np.pi,1001)
        loop=np.column_stack([.23*np.cos(theta),.11*np.sin(theta)])
        angles=np.linspace(0,2*np.pi,10,endpoint=False)
        samples=radial_samples(loop,angles)
        self.assertEqual(samples.shape,(10,2))
        np.testing.assert_allclose((samples[:,0]/.23)**2+(samples[:,1]/.11)**2,1,atol=2e-5)
        self.assertAlmostEqual(samples[0,0],.23)

    def test_rejects_non_enclosing_section(self):
        loop=np.array([[1,1],[2,1],[2,2],[1,2],[1,1]],dtype=float)
        with self.assertRaisesRegex(ValueError,'ray'):
            radial_samples(loop,np.array([np.pi]))

if __name__=='__main__':unittest.main()
