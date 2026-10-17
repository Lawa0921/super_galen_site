import unittest
import numpy as np
from original_guard_portrait_material_math import project_pixels, sample_rgba, view_weights


class PortraitMaterialTests(unittest.TestCase):
    def test_separate_head_and_torso_landmarks_and_front_orientation(self):
        spec={'right':[-1,0,0], 'head':{'anchor':[0,1.86],'pixel':[512,20],'scale':[800,800]},
              'torso':{'anchor':[0,1.56],'pixel':[512,260],'scale':[750,700]}}
        p=project_pixels([[.1,0,1.76],[.1,0,1.46]],spec,[True,False])
        np.testing.assert_allclose(p,[[432,100],[437,330]])

    def test_transparent_rgb_does_not_bleed_and_outside_is_invalid(self):
        im=np.array([[[255,0,255,0],[100,140,180,255]]],float)/255
        colors,alpha=sample_rgba(im,[[.5,0],[-1,0]])
        np.testing.assert_allclose(colors[0],[100,140,180]/np.array(255),atol=1e-8)
        self.assertAlmostEqual(alpha[0],.5)
        self.assertEqual(alpha[1],0)

    def test_semantic_vertical_landmarks_preserve_visor_alignment(self):
        spec={'right':[-1,0,0],'head':{'anchor':[0,1.86],'pixel':[512,20],'scale':[790,790],
              'z_landmarks':[[1.53,230],[1.69,125],[1.86,20]]},'torso':{'anchor':[0,1.54],'pixel':[512,260],'scale':[790,550]}}
        pixels=project_pixels([[0,0,1.69],[0,0,1.53]],spec,[True,True])
        np.testing.assert_allclose(pixels[:,1],[125,230])

    def test_invisible_backfacing_and_transparent_sources_get_no_weight(self):
        normals=np.array([[0,1,0],[0,-1,0]])
        directions=np.array([[0,1,0],[0,-1,0]])
        w=view_weights(normals,directions,[[1,1],[1,0]],[[1,1],[1,1]])
        np.testing.assert_array_equal(w,[[1,0],[0,0]])


if __name__=='__main__':unittest.main()
