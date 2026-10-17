"""Assemble labeled review sheets from deterministic Blender shape renders."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


BG = (29, 32, 38, 255)
FG = (238, 241, 246, 255)


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    path = Path("C:/Windows/Fonts/segoeui.ttf")
    return ImageFont.truetype(str(path), size) if path.exists() else ImageFont.load_default()


def cell(path: Path, label: str, size: tuple[int, int]) -> Image.Image:
    canvas = Image.new("RGBA", size, BG)
    image = Image.open(path).convert("RGBA")
    fitted = ImageOps.contain(image, (size[0], size[1] - 48), Image.Resampling.LANCZOS)
    canvas.alpha_composite(fitted, ((size[0] - fitted.width) // 2, 48))
    ImageDraw.Draw(canvas).text((16, 12), label, font=font(24), fill=FG)
    return canvas


def grid(rows: list[list[tuple[Path, str]]], cell_size: tuple[int, int], output: Path) -> None:
    width = max(len(row) for row in rows) * cell_size[0]
    height = len(rows) * cell_size[1]
    sheet = Image.new("RGBA", (width, height), BG)
    for row_index, row in enumerate(rows):
        for column_index, (path, label) in enumerate(row):
            sheet.alpha_composite(cell(path, label, cell_size), (column_index * cell_size[0], row_index * cell_size[1]))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(output, quality=95)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dir", type=Path)
    args = parser.parse_args()
    renders = args.run_dir / "qa" / "renders"
    grid(
        [
            [(renders / f"hunyuan-{view}.png", f"Hunyuan cleaned — {view}") for view in ("front", "side", "back")],
            [(renders / f"tripo-v3-{view}.png", f"Old Tripo v3 — {view}") for view in ("front", "side", "back")],
        ],
        (600, 790),
        args.run_dir / "qa" / "comparison-front-side-back.jpg",
    )
    grid(
        [
            [(renders / "hunyuan-head-shoulders.png", "Head / shoulders"),
             (renders / "hunyuan-left-hand.png", "Left hand — front"),
             (renders / "hunyuan-left-hand-back.png", "Left hand — back"),
             (renders / "hunyuan-left-hand-outer.png", "Left hand — outer")],
            [(renders / "hunyuan-front.png", "Cleaned body — front"),
             (renders / "hunyuan-right-hand.png", "Right hand — front"),
             (renders / "hunyuan-right-hand-back.png", "Right hand — back"),
             (renders / "hunyuan-right-hand-outer.png", "Right hand — outer")],
        ],
        (520, 560),
        args.run_dir / "qa" / "hunyuan-detail-sheet.jpg",
    )


if __name__ == "__main__":
    main()
