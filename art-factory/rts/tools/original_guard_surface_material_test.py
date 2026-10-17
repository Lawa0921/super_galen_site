"""Contract tests for the original guard material surface crop and tiling rules."""

import unittest

from PIL import Image

from original_guard_surface_material import centered_quadrant_crop, mirrored_tile


class SurfaceMaterialTest(unittest.TestCase):
    def test_quadrant_crop_and_exact_repeat_edges(self):
        self.assertEqual(centered_quadrant_crop((1024, 1024), "steel"), (128, 128, 384, 384))
        self.assertEqual(centered_quadrant_crop((1024, 1024), "brass"), (640, 128, 896, 384))
        self.assertEqual(centered_quadrant_crop((1024, 1024), "cloth"), (128, 640, 384, 896))
        self.assertEqual(centered_quadrant_crop((1024, 1024), "leather"), (640, 640, 896, 896))
        self.assertEqual(centered_quadrant_crop((1254, 1254), "steel"), (157, 157, 470, 470))
        self.assertEqual(centered_quadrant_crop((1254, 1254), "leather"), (784, 784, 1097, 1097))
        self.assertEqual(centered_quadrant_crop((1254, 1254), "cloth"), (157, 873, 470, 1186))
        patch = Image.new("RGB", (256, 256))
        for y in range(256):
            for x in range(256):
                patch.putpixel((x, y), (x % 256, y % 256, (x + y) % 256))
        tile = mirrored_tile(patch)
        self.assertEqual(tile.size, (512, 512))
        for i in range(512):
            self.assertEqual(tile.getpixel((0, i)), tile.getpixel((511, i)))
            self.assertEqual(tile.getpixel((i, 0)), tile.getpixel((i, 511)))

    def test_rejects_invalid_source_shape_and_material(self):
        with self.assertRaises(ValueError):
            centered_quadrant_crop((1024, 900), "steel")
        with self.assertRaises(ValueError):
            centered_quadrant_crop((512, 512), "steel")
        with self.assertRaises(ValueError):
            centered_quadrant_crop((1024, 1024), "unknown")


if __name__ == "__main__":
    unittest.main()
