"""Assemble source-render QA without changing the actual 32/64 px samples."""
import sys
from pathlib import Path

from PIL import Image, ImageDraw


def main():
    qa = Path(sys.argv[1])
    columns = ("front", "side", "top", "64px", "32px")
    width, height, label = 300, 300, 34
    sheet = Image.new("RGB", (width * len(columns), (height + label) * 2), (24, 28, 34))
    draw = ImageDraw.Draw(sheet)
    for row, name in enumerate(("bolt", "heavy-bolt")):
        for col, view in enumerate(columns):
            with Image.open(qa / f"{name}-{view}.png") as source:
                background = Image.new("RGBA", (width, height), (24, 28, 34, 255))
                if view in ("32px", "64px"):
                    # Original files remain native size; nearest-neighbor only magnifies QA pixels.
                    zoom = 8 if view == "32px" else 4
                    sample = source.convert("RGBA").resize((source.width * zoom, source.height * zoom), Image.Resampling.NEAREST)
                    x = (width - sample.width) // 2
                    y = (height - sample.height) // 2
                    background.alpha_composite(sample, (x, y))
                else:
                    background.alpha_composite(source.convert("RGBA").resize((width, height), Image.Resampling.LANCZOS))
                sheet.paste(background.convert("RGB"), (col * width, row * (height + label)))
            suffix = " native / nearest zoom" if view in ("32px", "64px") else ""
            draw.text((col * width + 12, row * (height + label) + height + 8), f"{name} / {view}{suffix}", fill=(234, 237, 240))
    sheet.save(qa / "projectiles-contact.png")
    print(qa / "projectiles-contact.png")


if __name__ == "__main__":
    main()
