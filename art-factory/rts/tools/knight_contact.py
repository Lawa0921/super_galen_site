"""Build factual review sheets from the imported GLB renders."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
RUN = ROOT / "runs" / "kingdom-knight" / "2026-10-05-v2"
PREVIOUS = ROOT / "runs" / "kingdom-knight" / "2026-10-05-v1"
RENDER = RUN / "qa" / "roundtrip"
VIEWS = [
    ("knight-blue-640.png", "Blue team"),
    ("knight-red-640.png", "Red team"),
    ("knight-lod0-idle-side.png", "Side / Idle"),
    ("knight-lod0-idle-front.png", "Front / Idle"),
    ("knight-lod0-idle-back.png", "Rear / Idle"),
    ("knight-walk-01.png", "Walk / frame 1"),
    ("knight-walk-20.png", "Walk / frame 20"),
    ("knight-attack-08.png", "Attack / windup"),
    ("knight-attack-16.png", "Attack / strike"),
    ("knight-death-48.png", "Death / final"),
    ("knight-lod1-idle-quarter.png", "LOD1 / Idle"),
]


def sheet(tile_size, columns, title, destination):
    cell_w = tile_size + (28 if tile_size == 64 else 20)
    cell_h = tile_size + 32
    rows = (len(VIEWS) + columns - 1) // columns
    output = Image.new("RGB", (cell_w * columns + 24, cell_h * rows + 48), "#d3d7d5")
    draw = ImageDraw.Draw(output)
    font = ImageFont.load_default()
    draw.text((12, 12), title, fill="#202e36", font=font)
    for index, (filename, caption) in enumerate(VIEWS):
        source = Image.open(RENDER / filename).convert("RGBA")
        source = source.resize((tile_size, tile_size), Image.Resampling.LANCZOS)
        x = 12 + index % columns * cell_w
        y = 36 + index // columns * cell_h
        background = Image.new("RGBA", source.size, "#d3d7d5")
        background.alpha_composite(source)
        output.paste(background.convert("RGB"), (x, y))
        draw.text((x, y + tile_size + 5), caption, fill="#202e36", font=font)
    output.save(destination, optimize=True)


def comparison(names, destination, title):
    tile = 320
    output = Image.new("RGB", (2 * (tile + 16) + 16, len(names) * (tile + 34) + 42), "#d3d7d5")
    draw = ImageDraw.Draw(output)
    font = ImageFont.load_default()
    draw.text((12, 12), title, fill="#202e36", font=font)
    for row, (filename, label) in enumerate(names):
        for col, run in enumerate((PREVIOUS, RUN)):
            source = Image.open(run / "qa" / "roundtrip" / filename).convert("RGBA").resize((tile, tile), Image.Resampling.LANCZOS)
            background = Image.new("RGBA", source.size, "#d3d7d5")
            background.alpha_composite(source)
            x, y = 12 + col * (tile + 16), 36 + row * (tile + 34)
            output.paste(background.convert("RGB"), (x, y))
            draw.text((x, y + tile + 5), f"{'v1' if col == 0 else 'v2'} / {label}", fill="#202e36", font=font)
    output.save(destination, optimize=True)


def walk_cycle(tile, destination):
    frames = (1, 5, 10, 15, 20, 25, 30, 35, 40)
    output = Image.new("RGB", (3 * (tile + 16) + 16, 3 * (tile + 30) + 42), "#d3d7d5")
    draw = ImageDraw.Draw(output)
    font = ImageFont.load_default()
    draw.text((12, 12), f"Walk full cycle / imported v2 GLB / {tile} px", fill="#202e36", font=font)
    for index, frame in enumerate(frames):
        source = Image.open(RENDER / f"knight-walk-{frame:02d}.png").convert("RGBA").resize((tile, tile), Image.Resampling.LANCZOS)
        background = Image.new("RGBA", source.size, "#d3d7d5")
        background.alpha_composite(source)
        x = 12 + index % 3 * (tile + 16)
        y = 36 + index // 3 * (tile + 30)
        output.paste(background.convert("RGB"), (x, y))
        draw.text((x, y + tile + 5), f"frame {frame}", fill="#202e36", font=font)
    output.save(destination, optimize=True)


if __name__ == "__main__":
    sheet(300, 3, "Mounted knight candidate / imported GLB / 640 px source", RUN / "qa" / "knight-contact-640.png")
    sheet(64, 4, "Mounted knight / actual 64 px reductions", RUN / "qa" / "knight-contact-64.png")
    walk_cycle(220, RUN / "qa" / "knight-walk-cycle.png")
    walk_cycle(64, RUN / "qa" / "knight-walk-cycle-64.png")
    comparison((("knight-walk-01.png", "Walk frame 1"), ("knight-walk-20.png", "Walk frame 20"), ("knight-death-48.png", "Death final")), RUN / "qa" / "knight-before-after.png", "Mounted knight / v1 versus v2 GLB roundtrip")
