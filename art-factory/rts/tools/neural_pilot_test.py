import tempfile
import unittest
from pathlib import Path

from PIL import Image

from neural_pilot import prepare_input
from neural_pilot import install_isosurface_shim


class PrepareInputTests(unittest.TestCase):
    def test_transparent_guard_is_centered_on_gray_without_background_download(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "source.png"
            target = Path(temporary) / "prepared.png"
            image = Image.new("RGBA", (80, 100), (0, 0, 0, 0))
            for y in range(10, 90):
                for x in range(20, 60):
                    image.putpixel((x, y), (160, 80, 40, 255))
            image.save(source)

            metadata = prepare_input(source, target, size=100, foreground_ratio=0.8)

            output = Image.open(target)
            self.assertEqual(output.size, (100, 100))
            self.assertEqual(output.getpixel((0, 0)), (127, 127, 127))
            self.assertEqual(output.getpixel((50, 50)), (160, 80, 40))
            self.assertEqual(metadata["source_bbox"], [20, 10, 60, 90])
            self.assertEqual(metadata["prepared_bbox"], [30, 10, 70, 90])

    def test_fully_transparent_input_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "empty.png"
            target = Path(temporary) / "prepared.png"
            Image.new("RGBA", (20, 20), (0, 0, 0, 0)).save(source)

            with self.assertRaisesRegex(ValueError, "visible pixels"):
                prepare_input(source, target)
            self.assertFalse(target.exists())


class MarchingCubesTests(unittest.TestCase):
    def test_cpu_mesh_vertices_match_model_float32_dtype(self):
        import sys
        import torch

        install_isosurface_shim()
        vertices, faces = sys.modules["torchmcubes"].marching_cubes(
            torch.arange(4, dtype=torch.float32)[:, None, None].expand(4, 4, 4).contiguous(),
            1.5,
        )
        self.assertEqual(vertices.dtype, torch.float32)
        self.assertEqual(faces.dtype, torch.int64)

    def test_opaque_rgb_source_is_rejected_before_inference(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "opaque.png"
            target = Path(temporary) / "prepared.png"
            Image.new("RGB", (20, 20), (255, 255, 255)).save(source)

            with self.assertRaisesRegex(ValueError, "alpha channel"):
                prepare_input(source, target)
            self.assertFalse(target.exists())


if __name__ == "__main__":
    unittest.main()
