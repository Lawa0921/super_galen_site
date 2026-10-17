"""Compare paired Blender import renders and build a compact review sheet."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", type=Path, required=True)
    args = parser.parse_args()
    run = args.run
    folder = run / "qa" / "roundtrip"
    rows = []
    contact = Image.new("RGBA", (256 * 5, 256 * 4), (25, 28, 33, 255))
    draw = ImageDraw.Draw(contact)
    for lod in (0, 1):
        baseline = folder / "baseline" / f"lod{lod}"
        candidate = folder / "candidate" / f"lod{lod}"
        names = sorted(path.name for path in baseline.glob("*.png"))
        if not set(names).issubset({path.name for path in candidate.glob("*.png")}) or len(names) < 10:
            raise AssertionError(f"Missing paired renders LOD{lod}")
        for name in names:
            old = np.asarray(Image.open(baseline / name).convert("RGBA"), dtype=np.int16)
            new = np.asarray(Image.open(candidate / name).convert("RGBA"), dtype=np.int16)
            difference = np.abs(old - new)
            row = {"lod": lod, "frame": name,
                   "max_abs_rgba": int(difference.max()),
                   "mean_abs_rgba": float(difference.mean()),
                   "pixels_gt1": int((difference.max(axis=2) > 1).sum()),
                   "pixels_gt8": int((difference.max(axis=2) > 8).sum())}
            rows.append(row)
        sequence = ["idle-01.png", "walk-05.png", "attack-10.png", "hurt-04.png", "death-24.png"]
        for version_index, version in enumerate(("baseline", "candidate")):
            for column, name in enumerate(sequence):
                source = folder / version / f"lod{lod}" / name
                tile = Image.open(source).convert("RGBA")
                x = column * 256
                y = (lod * 2 + version_index) * 256
                contact.alpha_composite(tile, (x, y))
                draw.text((x + 5, y + 4), f"L{lod} {version[0]} {name[:-4]}", fill=(255, 255, 255, 255))
    contact.convert("RGB").save(run / "qa" / "roundtrip-contact.jpg", quality=92)
    team_sheet = Image.new("RGBA", (640 * 2, 640 * 2), (25, 28, 33, 255))
    for row, version in enumerate(("baseline", "candidate")):
        for column, color in enumerate(("blue", "red")):
            tile = Image.open(folder / version / "lod0" / f"team-{color}-640.png").convert("RGBA")
            team_sheet.alpha_composite(tile, (640 * column, 640 * row))
    team_sheet.convert("RGB").save(run / "qa" / "team-comparison.jpg", quality=92)
    small = Image.new("RGBA", (64 * 5, 64 * 2), (25, 28, 33, 255))
    for lod in (0, 1):
        for column, name in enumerate(sequence):
            tile = Image.open(folder / "candidate" / f"lod{lod}" / name).convert("RGBA")
            small.alpha_composite(tile.resize((64, 64), Image.Resampling.LANCZOS), (64 * column, 64 * lod))
    small.convert("RGB").save(run / "qa" / "posegrid-64.png")
    summary = {"lods": {}, "frames": rows,
               "contact": str(run / "qa" / "roundtrip-contact.jpg"),
               "teams": str(run / "qa" / "team-comparison.jpg"),
               "posegrid_64": str(run / "qa" / "posegrid-64.png")}
    for lod in (0, 1):
        subset = [row for row in rows if row["lod"] == lod]
        summary["lods"][str(lod)] = {
            "frames": len(subset), "max_abs_rgba": max(row["max_abs_rgba"] for row in subset),
            "mean_abs_rgba": sum(row["mean_abs_rgba"] for row in subset) / len(subset),
            "pixels_gt1_total": sum(row["pixels_gt1"] for row in subset),
            "pixels_gt8_total": sum(row["pixels_gt8"] for row in subset),
        }
    (run / "qa" / "visual-differential.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary["lods"], indent=2))


if __name__ == "__main__":
    main()
