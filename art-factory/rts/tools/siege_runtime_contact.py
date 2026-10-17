"""Review sheet and pixel metrics for the siege texture-only revision."""

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ORIGINAL = ROOT / "runs" / "kingdom-siege" / "2026-10-04-original"
RUN = ROOT / "runs" / "kingdom-siege" / "2026-10-04-runtime-v1"
QA = RUN / "qa"
PANELS = (
    (ORIGINAL / "qa" / "roundtrip" / "siege-lod0-idle-quarter.png", "Original v1 · reviewed blue"),
    (QA / "teams" / "siege-blue-640.png", "Runtime v1 · blue #28577d"),
    (QA / "teams" / "siege-red-640.png", "Runtime v1 · red #87382d"),
)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def composite(image):
    back = Image.new("RGBA", image.size, "#d3d7d5")
    back.alpha_composite(image)
    return back.convert("RGB")


def main():
    images = [Image.open(path).convert("RGBA") for path, _ in PANELS]
    assert all(image.size == (640, 640) for image in images)
    icon_images = []
    for label, image in (("blue", images[1]), ("red", images[2])):
        icon = composite(image).resize((64, 64), Image.Resampling.LANCZOS)
        icon.save(QA / "teams" / f"siege-{label}-64.png")
        icon_images.append(icon)
    strip = Image.new("RGB", (128, 64))
    strip.paste(icon_images[0], (0, 0))
    strip.paste(icon_images[1], (64, 0))
    strip.save(QA / "teams" / "siege-blue-red-64.png")

    width, height, pad = 520, 574, 16
    sheet = Image.new("RGB", (3 * width + 4 * pad, height + 2 * pad), "#172331")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for index, ((_, caption), image) in enumerate(zip(PANELS, images)):
        x = pad + index * (width + pad)
        draw.rounded_rectangle((x, pad, x + width, pad + height), radius=12, fill="#d3d7d5")
        tile = composite(image).resize((500, 500), Image.Resampling.LANCZOS)
        sheet.paste(tile, (x + 10, pad + 10))
        draw.text((x + 12, pad + 536), caption, fill="#182330", font=font)
        if index:
            icon = icon_images[index - 1].resize((96, 96), Image.Resampling.NEAREST)
            sheet.paste(icon, (x + width - 106, pad + 10))
    contact = QA / "siege-runtime-contact.png"
    sheet.save(contact, optimize=True)

    # Compare rendered model pixels; a different team tint is expected.
    old = np.asarray(composite(images[0]), dtype=np.int16)
    blue = np.asarray(composite(images[1]), dtype=np.int16)
    alpha = np.maximum(np.asarray(images[0].getchannel("A")), np.asarray(images[1].getchannel("A")))
    foreground = alpha > 10
    mae = np.abs(old - blue)
    report = {
        "contact": str(contact.relative_to(ROOT)),
        "contact_sha256": sha(contact),
        "team_64_side_by_side": str((QA / "teams" / "siege-blue-red-64.png").relative_to(ROOT)),
        "team_64_sha256": sha(QA / "teams" / "siege-blue-red-64.png"),
        "source_original_sha256": sha(PANELS[0][0]),
        "runtime_blue_sha256": sha(PANELS[1][0]),
        "runtime_red_sha256": sha(PANELS[2][0]),
        "original_vs_runtime_blue_foreground_rgb_mae": round(float(mae[foreground].mean()), 3),
        "original_vs_runtime_blue_foreground_rgb_p95": round(float(np.percentile(mae[foreground], 95)), 3),
        "note": "Render difference includes intentionally changed blue TeamCloth factor; visual contact is the detail gate.",
        "runtime_publish_allowed": False,
    }
    (QA / "detail-comparison.json").write_bytes(json.dumps(report, indent=2).encode("utf-8"))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
