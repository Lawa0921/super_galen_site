"""Slice a generated 2x2 surface atlas into source-pixel-only repeatable tiles."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-surface-materials/2026-10-05"
MATERIALS = ("steel", "brass", "cloth", "leather")
SELECTED_CROP_OVERRIDES = {
    # The central navy swatch gave a visible dark line in the 2x2 repeat review.
    ((1254, 1254), "cloth"): (157, 873, 470, 1186),
}


def centered_quadrant_crop(size: tuple[int, int], material: str) -> tuple[int, int, int, int]:
    width, height = size
    if material not in MATERIALS:
        raise ValueError(f"unknown material: {material}")
    if width != height or width < 1024 or width % 2:
        raise ValueError("source atlas must be square, at least 1024 pixels, and divisible by two")
    if (size, material) in SELECTED_CROP_OVERRIDES:
        return SELECTED_CROP_OVERRIDES[(size, material)]
    half = width // 2
    quarter = width // 4
    x_quadrant = 0 if material in ("steel", "cloth") else half
    y_quadrant = 0 if material in ("steel", "brass") else half
    offset = (half - quarter) // 2
    left, top = x_quadrant + offset, y_quadrant + offset
    return (left, top, left + quarter, top + quarter)


def mirrored_tile(patch: Image.Image) -> Image.Image:
    if patch.size != (256, 256):
        raise ValueError("mirror patch must be 256x256")
    patch = patch.convert("RGB")
    tile = Image.new("RGB", (512, 512))
    tile.paste(patch, (0, 0))
    tile.paste(ImageOps.mirror(patch), (256, 0))
    tile.paste(ImageOps.flip(patch), (0, 256))
    tile.paste(ImageOps.flip(ImageOps.mirror(patch)), (256, 256))
    return tile


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def metrics(tile: Image.Image) -> dict:
    rgb = np.asarray(tile, dtype=np.float32)
    mean = rgb.mean(axis=(0, 1))
    luminance = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    edge_x = np.max(np.abs(rgb[:, 0] - rgb[:, -1]))
    edge_y = np.max(np.abs(rgb[0] - rgb[-1]))
    # A mirrored edge can be pixel-perfect yet form a broad contrasting band.
    band = max(
        abs(float(luminance[:16].mean() - luminance.mean())),
        abs(float(luminance[248:264].mean() - luminance.mean())),
    )
    return {
        "mean_rgb": [round(float(v), 2) for v in mean],
        "luminance_std": round(float(luminance.std()), 2),
        "min_rgb": [int(v) for v in rgb.min(axis=(0, 1))],
        "max_rgb": [int(v) for v in rgb.max(axis=(0, 1))],
        "edge_max_channel_difference": [int(edge_x), int(edge_y)],
        "horizontal_repeat_band_deviation": round(band, 2),
        "opaque": True,
        "pixel_mode": tile.mode,
    }


def color_gate(material: str, m: dict) -> tuple[bool, list[str]]:
    r, g, b = m["mean_rgb"]
    std = m["luminance_std"]
    findings = []
    if not 2 <= std <= 45:
        findings.append("microtexture luminance variation outside 2..45")
    if material == "steel" and not (75 <= (r + g + b) / 3 <= 220 and max(r, g, b) - min(r, g, b) <= 26):
        findings.append("steel does not read as restrained neutral silver")
    if material == "brass" and not (r > g > b and 8 <= r - b <= 90 and 55 <= (r + g + b) / 3 <= 190):
        findings.append("brass color or saturation outside muted warm range")
    if material == "cloth" and not (b > r * 1.15 and b > g * 1.03 and (r + g + b) / 3 < 125):
        findings.append("cloth does not read as deep navy blue")
    if material == "cloth" and m["horizontal_repeat_band_deviation"] > 3:
        findings.append("cloth repeat has a broad horizontal contrast band")
    if material == "leather" and not (r > g > b and (r + g + b) / 3 < 140 and r - b >= 10):
        findings.append("leather does not read as dark brown")
    return not findings, findings


def build(source: Path) -> dict:
    source = source.resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    image = Image.open(source)
    if image.mode not in ("RGB", "RGBA"):
        raise ValueError(f"source must be RGB/RGBA, got {image.mode}")
    if image.mode == "RGBA" and image.getchannel("A").getextrema() != (255, 255):
        raise ValueError("source atlas is not fully opaque")
    size = image.size
    centered_quadrant_crop(size, "steel")
    candidate = RUN / "candidate"
    qa = RUN / "qa"
    candidate.mkdir(parents=True, exist_ok=True)
    qa.mkdir(parents=True, exist_ok=True)
    report = {"source": source.relative_to(ROOT).as_posix(), "source_sha256": sha256(source), "source_dimensions": list(size), "tiles": {}, "qa_pass": True, "review_limitations": ["Color-domain gates are heuristic; inspect the repeat montage for motifs, lighting, and material credibility.", "These RGB tiles are not measured PBR maps. Roughness and metalness are later author settings."]}
    montage = Image.new("RGB", (1024, 1024))
    for material in MATERIALS:
        crop = centered_quadrant_crop(size, material)
        patch = image.crop(crop).convert("RGB")
        if patch.size != (256, 256):
            patch = patch.resize((256, 256), Image.Resampling.LANCZOS)
        tile = mirrored_tile(patch)
        tile_path = candidate / f"{material}-512.png"
        tile.save(tile_path, optimize=True)
        m = metrics(tile)
        passed, findings = color_gate(material, m)
        m.update({"crop_xyxy": list(crop), "file": tile_path.relative_to(ROOT).as_posix(), "sha256": sha256(tile_path), "color_gate_pass": passed, "findings": findings})
        report["tiles"][material] = m
        report["qa_pass"] &= passed and m["edge_max_channel_difference"] == [0, 0]
        repeat = Image.new("RGB", (512, 512))
        small = tile.resize((256, 256), Image.Resampling.LANCZOS)
        for y in (0, 256):
            for x in (0, 256):
                repeat.paste(small, (x, y))
        index = MATERIALS.index(material)
        montage.paste(repeat, ((index % 2) * 512, (index // 2) * 512))
    montage_path = qa / "tile-repeat-montage.png"
    montage.save(montage_path, optimize=True)
    report["repeat_montage"] = montage_path.relative_to(ROOT).as_posix()
    report["repeat_montage_sha256"] = sha256(montage_path)
    report_path = qa / "surface-qa.json"
    report_path.write_bytes((json.dumps(report, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    tile_map = {
        "asset_id": "original-guard-surface-materials",
        "status": "candidate",
        "runtime_publish_allowed": False,
        "source_path": report["source"],
        "source_sha256": report["source_sha256"],
        "tiles": [
            {"id": material, "path": report["tiles"][material]["file"], "sha256": report["tiles"][material]["sha256"], "crop_xyxy": report["tiles"][material]["crop_xyxy"]}
            for material in MATERIALS
        ],
    }
    (qa / "tiles.json").write_bytes((json.dumps(tile_map, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    args = parser.parse_args()
    print(json.dumps(build(args.source), ensure_ascii=False, indent=2))
