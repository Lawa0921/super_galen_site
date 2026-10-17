"""Regression checks for embedded projectile texture provenance and neutrality."""
import json
import struct
import unittest
from pathlib import Path

from PIL import Image


RUN = Path(__file__).resolve().parents[1] / "runs" / "projectiles" / "2026-10-05-v1"


def embedded_images(path):
    blob = path.read_bytes()
    json_size = struct.unpack_from("<I", blob, 12)[0]
    data = json.loads(blob[20:20 + json_size])
    bin_start = 20 + json_size + 8
    return {
        image["name"]: blob[bin_start + data["bufferViews"][image["bufferView"]]["byteOffset"]:
                            bin_start + data["bufferViews"][image["bufferView"]]["byteOffset"] + data["bufferViews"][image["bufferView"]]["byteLength"]]
        for image in data["images"]
    }


class ProjectileTextureTests(unittest.TestCase):
    def test_both_glbs_embed_exact_small_derivatives(self):
        textures = RUN / "candidate" / "textures"
        expected = {path.stem: path.read_bytes() for path in textures.glob("*-basecolor.jpg")}
        self.assertEqual(len(expected), 3)
        for label in ("bolt", "heavy-bolt"):
            with self.subTest(label=label):
                actual = embedded_images(RUN / "candidate" / f"{label}.glb")
                self.assertEqual(actual, expected)

    def test_feathers_are_neutral_gray_without_team_tint(self):
        with Image.open(RUN / "candidate" / "textures" / "neutral-linen-basecolor.jpg") as image:
            for red, green, blue in image.convert("RGB").get_flattened_data():
                self.assertEqual((red, green), (green, blue))


if __name__ == "__main__":
    unittest.main()
