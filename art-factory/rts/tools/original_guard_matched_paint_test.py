"""Regression tests for the limited, non-semantic paintover registration."""
import unittest
import numpy as np
from PIL import Image

from original_guard_matched_paint_postprocess import foreground_bbox, register_bbox


class PaintRegistrationTests(unittest.TestCase):
    def test_bright_subject_has_exclusive_bbox(self):
        pixels = np.full((40, 50, 3), 30, dtype=np.uint8)
        pixels[8:30, 10:35] = 180
        self.assertEqual(foreground_bbox(Image.fromarray(pixels))[0], (10, 8, 35, 30))

    def test_blue_cloth_is_included_without_unsigned_subtraction(self):
        pixels = np.full((40, 50, 3), 30, dtype=np.uint8)
        pixels[8:30, 10:35] = [25, 35, 80]
        self.assertEqual(foreground_bbox(Image.fromarray(pixels))[0], (10, 8, 35, 30))
        pixels[8:30, 10:35] = [80, 35, 25]
        with self.assertRaisesRegex(ValueError, 'foreground'):
            foreground_bbox(Image.fromarray(pixels))

    def test_empty_reference_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'foreground'):
            foreground_bbox(Image.new('RGB', (40, 40), (30, 30, 30)))

    def test_registration_preserves_target_canvas_and_background(self):
        target = Image.new('RGB', (50, 40), (30, 30, 30))
        target.paste((180, 180, 180), (10, 8, 35, 30))
        paint = Image.new('RGB', (100, 80), (20, 20, 20))
        paint.paste((200, 160, 100), (20, 16, 70, 60))
        result, report = register_bbox(target, paint)
        self.assertEqual(result.size, target.size)
        self.assertEqual(result.getpixel((0, 0)), (30, 30, 30))
        self.assertEqual(result.getpixel((20, 20)), (200, 160, 100))
        self.assertEqual(report['mask_iou_after_bbox_alignment'], 1.0)


if __name__ == '__main__':
    unittest.main()
