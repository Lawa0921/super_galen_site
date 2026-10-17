"""Exact v2/v3 imported-render regression and compact knight pose grids."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


FRAMES = (
    ("Idle", "knight-lod0-idle-quarter.png"),
    ("Walk 01", "knight-walk-01.png"),
    ("Walk 20", "knight-walk-20.png"),
    ("Walk 40", "knight-walk-40.png"),
    ("Attack 16", "knight-attack-16.png"),
    ("Death 48", "knight-death-48.png"),
    ("Blue team", "knight-blue-640.png"),
    ("Red team", "knight-red-640.png"),
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def posegrid(source: Path, out: Path, tile: int) -> None:
    label_height = 25 if tile > 64 else 13
    sheet = Image.new("RGB", (tile * 4, (tile + label_height) * 2), (36, 43, 48))
    draw = ImageDraw.Draw(sheet)
    for index, (title, file) in enumerate(FRAMES):
        with Image.open(source / file) as preview:
            rgba = preview.convert("RGBA").resize((tile, tile), Image.Resampling.LANCZOS)
        background = Image.new("RGBA", rgba.size, (75, 85, 87, 255))
        background.alpha_composite(rgba)
        x, y = (index % 4) * tile, (index // 4) * (tile + label_height)
        sheet.paste(background.convert("RGB"), (x, y))
        if tile > 64:
            draw.text((x + 7, y + tile + 5), title, fill=(232, 236, 232))
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline-run", type=Path, required=True)
    parser.add_argument("--candidate-run", type=Path, required=True)
    args = parser.parse_args()
    old = args.baseline_run / "qa" / "roundtrip"
    new = args.candidate_run / "qa" / "roundtrip"
    files = sorted(new.glob("*.png"))
    if len(files) != 24 or {file.name for file in files} != {file.name for file in old.glob("*.png")}:
        raise AssertionError("Both runs must have the same 24 imported preview frames")
    rows = []
    for file in files:
        baseline = old / file.name
        with Image.open(file) as new_image, Image.open(baseline) as old_image:
            a = np.asarray(old_image.convert("RGBA"), dtype=np.int16)
            b = np.asarray(new_image.convert("RGBA"), dtype=np.int16)
        if a.shape != b.shape:
            raise AssertionError(f"Image dimensions changed: {file.name}")
        difference = np.abs(a - b)
        mae = float(difference.mean())
        if mae > 0:
            raise AssertionError(f"Visual regression {file.name}: mean abs pixel difference {mae}")
        rows.append({"frame": file.name, "v2_sha256": sha256(baseline),
                     "v3_sha256": sha256(file), "mean_abs_rgba_pixel_delta": mae})
    qa = args.candidate_run / "qa"
    posegrid(new, qa / "posegrid-320.png", 320)
    posegrid(new, qa / "posegrid-64.png", 64)
    report = {"status": "pass", "source": "Blender GLB roundtrip using unchanged v2 verification lighting/cameras",
              "frames_compared": len(rows), "all_exact_pixel_match": True, "frames": rows,
              "runtime_publish_allowed": False}
    (qa / "visual-diff.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"{len(rows)} Blender-imported frames are pixel-identical; pose grids created")


if __name__ == "__main__":
    main()
