"""Build a repeatable visual review sheet from imported siege GLB renders."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


RUN = Path(__file__).resolve().parents[1] / "runs" / "kingdom-siege" / "2026-10-04-original"
RENDERS = RUN / "qa" / "roundtrip"
OUTPUT = RUN / "qa" / "siege-contact.png"
PANELS = [
    ("siege-lod0-idle-quarter.png", "LOD0 · front quarter / Idle"),
    ("siege-lod0-idle-side.png", "LOD0 · side / Idle"),
    ("siege-lod0-attack-release.png", "LOD0 · Attack release"),
    ("siege-lod0-death.png", "LOD0 · Death collapse"),
    ("siege-lod1-idle-quarter.png", "LOD1 · front quarter / Idle"),
    ("siege-lod0-walk-quarter.png", "LOD0 · Walk wheel turn"),
]


def main() -> None:
    tile_w, tile_h, gap = 560, 600, 16
    columns = 3
    rows = (len(PANELS) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * tile_w + (columns + 1) * gap, rows * tile_h + (rows + 1) * gap), "#172331")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for index, (filename, label) in enumerate(PANELS):
        src = Image.open(RENDERS / filename).convert("RGBA")
        x = gap + (index % columns) * (tile_w + gap)
        y = gap + (index // columns) * (tile_h + gap)
        draw.rounded_rectangle((x, y, x + tile_w, y + tile_h), radius=12, fill="#d3d7d5")
        preview = Image.new("RGBA", src.size, "#d3d7d5")
        preview.alpha_composite(src)
        preview_rgb = preview.convert("RGB")
        fitted = preview_rgb.resize((540, 540), Image.Resampling.LANCZOS)
        sheet.paste(fitted, (x + 10, y + 12))
        draw.text((x + 12, y + 565), label, fill="#182330", font=font)
        if index in (0, 4):
            icon = preview_rgb.resize((64, 64), Image.Resampling.LANCZOS)
            icon.save(RUN / "qa" / ("siege-lod0-64.png" if index == 0 else "siege-lod1-64.png"))
            draw.rectangle((x + tile_w - 88, y + 10, x + tile_w - 8, y + 90), fill="#172331")
            sheet.paste(icon, (x + tile_w - 80, y + 18))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUTPUT, optimize=True)
    print(OUTPUT)


if __name__ == "__main__":
    main()
