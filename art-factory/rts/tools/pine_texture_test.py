import unittest
from PIL import Image
import numpy as np
from pine_texture import pack,RUN

class PineTextureTest(unittest.TestCase):
    def test_generated_source_keeps_four_sprays_and_empty_gutters(self):
        a=np.asarray(pack(Image.open(RUN/'raw/needle-bough-atlas.png')))
        self.assertEqual(a.shape,(1024,1024,4))
        self.assertEqual(set(np.unique(a[:,:,3])),{0,255})
        for row in range(2):
            for col in range(2):
                alpha=a[row*512:(row+1)*512,col*512:(col+1)*512,3]
                self.assertGreater(np.count_nonzero(alpha),30000)
                self.assertFalse(alpha[:16].any() or alpha[-16:].any() or alpha[:,:16].any() or alpha[:,-16:].any())

    def test_solid_background_and_missing_cell_are_rejected(self):
        with self.assertRaisesRegex(ValueError,'alpha'):pack(Image.new('RGBA',(100,100),(0,100,0,255)))
        with self.assertRaisesRegex(ValueError,'spray'):pack(Image.new('RGBA',(100,100),(0,0,0,0)))

if __name__=='__main__':unittest.main()
