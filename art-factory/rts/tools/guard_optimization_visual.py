"""Compare imported production guard v1/v2 renders and build pose grids."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


FRAMES = (
    ("Idle", "idle-00.png"), ("Walk 10", "walk-10.png"),
    ("Walk 20", "walk-20.png"), ("Attack 13", "attack-13.png"),
    ("Attack 22", "attack-22.png"), ("Hurt 14", "hurt-14.png"),
    ("Death 36", "death-36.png"), ("Death 50", "death-50.png"),
    ("Blue team", "team-blue.png"), ("Red team", "team-red.png"),
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def posegrid(source: Path, out: Path, tile: int) -> None:
    label_height = 25 if tile > 64 else 0
    sheet = Image.new("RGB", (tile * 5, (tile + label_height) * 2), (36, 43, 48))
    draw = ImageDraw.Draw(sheet)
    for index, (title, filename) in enumerate(FRAMES):
        with Image.open(source / filename) as preview:
            rgba = preview.convert("RGBA").resize((tile, tile), Image.Resampling.LANCZOS)
        background = Image.new("RGBA", rgba.size, (75, 85, 87, 255))
        background.alpha_composite(rgba)
        x, y = (index % 5) * tile, (index // 5) * (tile + label_height)
        sheet.paste(background.convert("RGB"), (x, y))
        if tile > 64:
            draw.text((x + 7, y + tile + 5), title, fill=(232, 236, 232))
    sheet.save(out, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate-run", type=Path, required=True)
    args = parser.parse_args()
    qa = args.candidate_run / "qa"
    old = qa / "roundtrip" / "v1" / "lod0"
    new = qa / "roundtrip" / "v2" / "lod0"
    old_files = sorted(old.glob("*.png"))
    new_files = sorted(new.glob("*.png"))
    if len(old_files) != 10 or {p.name for p in old_files} != {p.name for p in new_files}:
        raise AssertionError("Expected ten matching imported render frames")
    rows = []
    for baseline in old_files:
        candidate = new / baseline.name
        with Image.open(baseline) as source, Image.open(candidate) as target:
            a = np.asarray(source.convert("RGBA"), dtype=np.int16)
            b = np.asarray(target.convert("RGBA"), dtype=np.int16)
        if a.shape != b.shape:
            raise AssertionError("Frame dimensions differ")
        difference = np.abs(a - b)
        delta = float(difference.mean())
        max_channel_delta = int(difference.max())
        changed_channels = int(np.count_nonzero(difference))
        if max_channel_delta > 1 or changed_channels > 10:
            raise AssertionError(f"Visual regression in {baseline.name}: MAE {delta}, max {max_channel_delta}, channels {changed_channels}")
        rows.append({"frame": baseline.name, "v1_sha256": sha256(baseline),
                     "v2_sha256": sha256(candidate), "mean_abs_rgba_pixel_delta": delta,
                     "max_channel_delta_8bit": max_channel_delta,
                     "changed_channel_samples": changed_channels})
    posegrid(new, qa / "posegrid-256.png", 256)
    posegrid(new, qa / "posegrid-64.png", 64)
    (qa / "visual-diff.json").write_text(json.dumps({
        "status": "pass_with_single_lsb_tolerance", "frames_compared": len(rows),
        "all_exact_pixel_match": all(row["changed_channel_samples"] == 0 for row in rows),
        "max_channel_delta_8bit": max(row["max_channel_delta_8bit"] for row in rows),
        "max_changed_channel_samples_per_frame": max(row["changed_channel_samples"] for row in rows),
        "frames": rows, "runtime_publish_allowed": False,
    }, indent=2) + "\n", encoding="utf-8")
    print(f"{len(rows)} guard GLB roundtrip frames differ by at most one 8-bit level in six channel samples")


if __name__ == "__main__":
    main()
