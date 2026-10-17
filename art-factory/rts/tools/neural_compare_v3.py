"""Compare v2/v3 renders pixelwise, using exactly matched Blender cameras."""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def main():
    previous, current = [Path(value) for value in sys.argv[1:]]
    result = {}
    for name in ("front", "side", "back", "game-64px"):
        a = np.asarray(Image.open(previous / "qa" / f"{name}.png").convert("RGBA"))
        b = np.asarray(Image.open(current / "qa" / f"{name}.png").convert("RGBA"))
        if a.shape != b.shape:
            raise ValueError(f"Mismatched render shape for {name}")
        common = (a[:, :, 3] > 128) & (b[:, :, 3] > 128)
        delta = np.abs(a[:, :, :3].astype(np.int16) - b[:, :, :3].astype(np.int16))[common]
        result[name] = {
            "canvas": list(a.shape[:2][::-1]),
            "common_opaque_pixels": int(common.sum()),
            "mean_absolute_rgb_byte_change": round(float(delta.mean()), 3),
            "fraction_pixels_rgb_change_over_16": round(float((delta.max(axis=1) > 16).mean()), 4),
            "v2_median_rgb": np.median(a[:, :, :3][common], axis=0).astype(int).tolist(),
            "v3_median_rgb": np.median(b[:, :, :3][common], axis=0).astype(int).tolist(),
        }
    output = current / "qa" / "v2-v3-pixel-comparison.json"
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
