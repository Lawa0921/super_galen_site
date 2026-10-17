import unittest

import numpy as np

from human_units_team_mask import blue_fabric_mask, recolor_preview


class TeamMaskTest(unittest.TestCase):
    def test_blue_fabric_selected_without_skin_metal_gold_or_black(self):
        pixels = np.array([[[28, 56, 119], [38, 67, 133], [150, 158, 165],
                            [204, 151, 74], [184, 125, 103], [0, 0, 0]]], dtype=np.uint8)
        mask = blue_fabric_mask(pixels)
        self.assertEqual(mask[0, :2].tolist(), [255, 255])
        self.assertEqual(mask[0, 2:].tolist(), [0, 0, 0, 0])

    def test_recolor_preserves_nonfabric_and_luminance_variation(self):
        pixels = np.array([[[28, 56, 119], [40, 74, 146], [150, 158, 165], [204, 151, 74]]], dtype=np.uint8)
        mask = np.array([[255, 255, 0, 0]], dtype=np.uint8)
        red = recolor_preview(pixels, mask, (135, 56, 45))
        self.assertTrue(np.array_equal(red[0, 2:], pixels[0, 2:]))
        self.assertGreater(int(red[0, 0, 0]), int(red[0, 0, 2]))
        self.assertGreater(int(red[0, 1].sum()), int(red[0, 0].sum()))


if __name__ == '__main__':
    unittest.main()
