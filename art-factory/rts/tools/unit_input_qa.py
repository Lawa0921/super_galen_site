"""Mechanical checks for the five non-runtime RTS character reference pairs."""

import argparse
import hashlib
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image


EXPECTED_SIZE = (1024, 1536)
UNITS = ("worker", "crossbow", "priest", "commander", "neutral-raider")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def identical_source(first: Path, second: Path) -> bool:
    return sha256(first) == sha256(second)


def inspect_png(path: Path) -> dict:
    result = {"path": str(path), "issues": []}
    if not path.is_file():
        result["issues"].append("missing file")
        return result
    result["bytes"] = path.stat().st_size
    result["sha256"] = sha256(path)
    with Image.open(path) as image:
        result["format"] = image.format
        result["mode"] = image.mode
        result["size"] = list(image.size)
        if image.format != "PNG":
            result["issues"].append("not PNG")
        if image.size != EXPECTED_SIZE:
            result["issues"].append("wrong dimensions")
        if image.mode != "RGBA":
            result["issues"].append("not RGBA")
            return result
        alpha = image.getchannel("A")
        visible = alpha.point(lambda value: 255 if value > 8 else 0)
        bbox = visible.getbbox()
        result["alpha_bbox"] = list(bbox) if bbox else None
        result["alpha_extrema"] = list(alpha.getextrema())
        if not bbox:
            result["issues"].append("empty alpha")
            return result
        left, top, right, bottom = bbox
        if left == 0 or top == 0 or right == image.width or bottom == image.height:
            result["issues"].append("alpha touches canvas edge")
        result["clear_margin_px"] = [left, top, image.width - right, image.height - bottom]
        # RGB values under transparent pixels do not count as painted background.
        histogram = alpha.histogram()
        result["transparent_pixels"] = histogram[0]
        result["opaque_pixels"] = histogram[255]
        result["partial_alpha_pixels"] = sum(histogram[1:255])
    return result


def inspect_unit(root: Path, unit: str) -> dict:
    run = root / unit / "v1"
    front = run / "raw" / "front.png"
    back = run / "raw" / "back.png"
    result = {"unit": unit, "status": "raw_generated", "runtime_publish_allowed": False,
              "front": inspect_png(front), "back": inspect_png(back), "issues": []}
    if front.is_file() and back.is_file() and identical_source(front, back):
        result["issues"].append("front and back are byte-identical")
    for other in UNITS:
        if other == unit:
            continue
        other_front = root / other / "v1" / "raw" / "front.png"
        if front.is_file() and other_front.is_file() and identical_source(front, other_front):
            result["issues"].append(f"front duplicates {other}")
    if result["front"]["issues"] or result["back"]["issues"]:
        result["issues"].append("one or more image mechanical checks failed")
    result["mechanical_pass"] = not result["issues"]
    result["visual_review"] = "pending manual inspection of hands, feet, true view, costume match and class difference"
    report = run / "qa" / "report.json"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return result


class UnitInputQATest(unittest.TestCase):
    def test_accepts_centered_transparent_rgba(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "front.png"
            image = Image.new("RGBA", (1024, 1536), (0, 0, 0, 0))
            image.paste((120, 80, 40, 255), (200, 100, 800, 1400))
            image.save(path)
            self.assertEqual(inspect_png(path)["issues"], [])

    def test_rejects_opaque_background_edge(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "front.png"
            Image.new("RGBA", (1024, 1536), (20, 20, 20, 255)).save(path)
            self.assertIn("alpha touches canvas edge", inspect_png(path)["issues"])

    def test_detects_identical_images(self):
        with TemporaryDirectory() as directory:
            first = Path(directory) / "first.png"
            second = Path(directory) / "second.png"
            Image.new("RGBA", (1024, 1536), (0, 0, 0, 0)).save(first)
            second.write_bytes(first.read_bytes())
            self.assertTrue(identical_source(first, second))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--unit", choices=UNITS)
    parser.add_argument("--root", type=Path, default=Path("art-factory/rts/runs/unit-inputs"))
    args, remainder = parser.parse_known_args()
    if args.unit:
        outcome = inspect_unit(args.root, args.unit)
        print(json.dumps({"unit": args.unit, "mechanical_pass": outcome["mechanical_pass"],
                          "issues": outcome["issues"]}, ensure_ascii=False))
        raise SystemExit(0 if outcome["mechanical_pass"] else 1)
    unittest.main(argv=[__file__, *remainder])
