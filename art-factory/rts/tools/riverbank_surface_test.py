import unittest
import numpy as np
from riverbank_surface import surface

class RiverbankSurfaceTest(unittest.TestCase):
    def test_ground_edges_and_repeatable_module_ends(self):
        height=np.tile(np.linspace(.2,.8,16),(16,1))
        for t in np.linspace(0,1,9):
            self.assertAlmostEqual(surface(0,t,height)[2],0)
            self.assertAlmostEqual(surface(1,t,height)[2],0)
        for u in np.linspace(0,1,9):
            a=surface(u,0,height);b=surface(u,1,height)
            self.assertAlmostEqual(a[0],b[0]);self.assertAlmostEqual(a[2],b[2]);self.assertAlmostEqual(b[1]-a[1],4)
    def test_relief_stays_within_local_footprint(self):
        height=np.arange(256).reshape(16,16)/255
        p=np.array([surface(u,v,height) for u in np.linspace(0,1,33) for v in np.linspace(0,1,65)])
        self.assertTrue(np.isfinite(p).all());self.assertGreater(p[:,2].max(),.25)
        self.assertGreaterEqual(p[:,0].min(),-.5);self.assertLessEqual(p[:,0].max(),.5)
        self.assertGreaterEqual(p[:,2].min(),0);self.assertLess(p[:,2].max(),.45)
    def test_invalid_inputs_rejected(self):
        for u,v,h in [(2,0,np.ones((3,3))),(0,float('nan'),np.ones((3,3))),(0,0,np.zeros((1,1)))]:
            with self.assertRaises(ValueError):surface(u,v,h)

if __name__=='__main__':unittest.main()
