"""Compose unaltered, same-camera walk/attack QA frames into a review grid."""

import sys
from pathlib import Path

from PIL import Image, ImageDraw


def main():
    qa = Path(sys.argv[1])
    rows = {"Walk": (0, 10, 20, 30), "Attack": (0, 6, 13, 22)}
    width, height, label = 512, 512, 34
    grid = Image.new("RGB", (width * 4, (height + label) * 2), (18, 20, 25))
    draw = ImageDraw.Draw(grid)
    for row, (name, frames) in enumerate(rows.items()):
        for column, frame in enumerate(frames):
            source = qa / f"{name.lower()}-contact-{frame:02d}.png"
            with Image.open(source) as image:
                rgba = image.convert("RGBA")
                canvas = Image.new("RGBA", (width, height), (18, 20, 25, 255))
                canvas.alpha_composite(rgba)
                grid.paste(canvas.convert("RGB"), (column * width, row * (height + label)))
            draw.text((column * width + 16, row * (height + label) + height + 8), f"{name}  frame {frame}", fill=(235, 235, 240))
    grid.save(qa / "motion-frame-grid.png")
    print("GUARD_MOTION_FRAME_GRID=" + str(qa / "motion-frame-grid.png"))


if __name__ == "__main__":
    main()
