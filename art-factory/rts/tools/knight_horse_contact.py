"""Compose the horse reconstruction silhouette gate from four Blender renders."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


RUN = Path(__file__).resolve().parents[1] / "runs" / "kingdom-knight" / "2026-10-05-v1"
SOURCE = RUN / "qa" / "horse-fourview"
VIEWS = [
    ("horse-right-side.png", "Right side · head toward +Y"),
    ("horse-left-side.png", "Left side"),
    ("horse-front-plus-y.png", "Front +Y"),
    ("horse-rear-minus-y.png", "Rear -Y"),
]


def main():
    sheet = Image.new("RGB", (1136, 1208), "#182434")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for index, (name, label) in enumerate(VIEWS):
        source = Image.open(SOURCE / name).convert("RGBA")
        base = Image.new("RGBA", source.size, "#d3d7d5")
        base.alpha_composite(source)
        tile = base.convert("RGB").resize((540, 540), Image.Resampling.LANCZOS)
        x = 16 + (index % 2) * 568
        y = 16 + (index // 2) * 592
        sheet.paste(tile, (x, y))
        draw.text((x + 6, y + 551), label, fill="#f4efe7", font=font)
    dest = RUN / "qa" / "horse-fourview-contact.png"
    sheet.save(dest, optimize=True)
    print(dest)


if __name__ == "__main__":
    main()
