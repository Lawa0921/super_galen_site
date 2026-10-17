import unittest

import numpy as np

from human_units_prepare import blue_cloth_mask, neutralize_blue


class MaterialPrepTest(unittest.TestCase):
    def test_blue_cloth_excludes_steel_gold_and_skin(self):
        pixels = np.array([[[24, 42, 113], [165, 123, 42], [157, 163, 169], [143, 93, 72]]], dtype=np.uint8)
        self.assertEqual(blue_cloth_mask(pixels).tolist(), [[True, False, False, False]])

    def test_neutralization_keeps_noncloth_unchanged(self):
        pixels = np.array([[[24, 42, 113, 255], [165, 123, 42, 255]]], dtype=np.uint8)
        result = neutralize_blue(pixels)
        self.assertEqual(result[0, 0, 0], result[0, 0, 1])
        self.assertEqual(result[0, 0, 1], result[0, 0, 2])
        self.assertEqual(result[0, 1].tolist(), pixels[0, 1].tolist())


if __name__ == '__main__':
    unittest.main()
