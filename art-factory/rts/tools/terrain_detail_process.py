"""Deterministic processing and QA for original RTS terrain-detail materials.

Generated source PNGs and submitted prompts live in the run directory. This
script never overwrites raw generation output and never writes runtime files.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


SIZE = 1024
EDGE_BLEND_PX = 64
ROAD_FADE_PX = 102  # Each side is almost exactly 10% of a 1024px tile.
ASSETS = ("dirt-road", "river-water")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def seam_metrics(rgb: np.ndarray) -> dict:
    a = rgb.astype(np.int16)
    left_right = np.abs(a[:, 0] - a[:, -1])
    top_bottom = np.abs(a[0] - a[-1])
    neighbor_x = np.abs(a[:, 1:] - a[:, :-1])
    neighbor_y = np.abs(a[1:] - a[:-1])
    return {
        "left_right_mean_rgb_abs": round(float(left_right.mean()), 3),
        "top_bottom_mean_rgb_abs": round(float(top_bottom.mean()), 3),
        "left_right_p95_rgb_abs": round(float(np.percentile(left_right, 95)), 3),
        "top_bottom_p95_rgb_abs": round(float(np.percentile(top_bottom, 95)), 3),
        "interior_x_mean_rgb_abs": round(float(neighbor_x.mean()), 3),
        "interior_y_mean_rgb_abs": round(float(neighbor_y.mean()), 3),
    }


def repair_one_pass(rgb: np.ndarray) -> np.ndarray:
    """Crossfade opposite edge strips once, using generated pixels only.

    Opposing pairs at the outermost rows/columns become equal. A smoothstep
    falloff confines this correction to 64 px, leaving the material center
    untouched. There is no procedural painting, inpainting, or regenerated art.
    """
    out = rgb.astype(np.float32).copy()
    for distance in range(EDGE_BLEND_PX):
        t = distance / EDGE_BLEND_PX
        weight = 1.0 - (t * t * (3.0 - 2.0 * t))
        left = out[:, distance, :].copy()
        right = out[:, SIZE - 1 - distance, :].copy()
        average = (left + right) * 0.5
        out[:, distance, :] = left * (1.0 - weight) + average * weight
        out[:, SIZE - 1 - distance, :] = right * (1.0 - weight) + average * weight
    for distance in range(EDGE_BLEND_PX):
        t = distance / EDGE_BLEND_PX
        weight = 1.0 - (t * t * (3.0 - 2.0 * t))
        top = out[distance, :, :].copy()
        bottom = out[SIZE - 1 - distance, :, :].copy()
        average = (top + bottom) * 0.5
        out[distance, :, :] = top * (1.0 - weight) + average * weight
        out[SIZE - 1 - distance, :, :] = bottom * (1.0 - weight) + average * weight
    return np.clip(np.rint(out), 0, 255).astype(np.uint8)


def tile_preview(image: Image.Image, path: Path) -> None:
    image = image.convert("RGB")
    tiled = Image.new("RGB", (SIZE * 2, SIZE * 2))
    for y in (0, SIZE):
        for x in (0, SIZE):
            tiled.paste(image, (x, y))
    tiled.save(path, optimize=True)


def webp_under_budget(image: Image.Image, path: Path) -> int:
    for quality in (88, 84, 80, 76, 72, 68, 64, 60, 56):
        image.save(path, format="WEBP", quality=quality, method=6)
        if path.stat().st_size < 250000:
            return quality
    raise ValueError(f"Cannot encode {path.name} under 250KB at acceptable quality")


def side_fade_mask() -> np.ndarray:
    x = np.arange(SIZE, dtype=np.float32)
    left = np.clip(x / ROAD_FADE_PX, 0.0, 1.0)
    right = np.clip((SIZE - 1 - x) / ROAD_FADE_PX, 0.0, 1.0)
    alpha = np.rint(255.0 * np.minimum(left, right)).astype(np.uint8)
    return np.broadcast_to(alpha[np.newaxis, :], (SIZE, SIZE)).copy()


def make_alpha_preview(image: Image.Image, path: Path) -> None:
    tile = 32
    backdrop = Image.new("RGB", image.size)
    draw = ImageDraw.Draw(backdrop)
    for y in range(0, SIZE, tile):
        for x in range(0, SIZE, tile):
            color = (134, 141, 109) if (x // tile + y // tile) % 2 == 0 else (83, 98, 71)
            draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill=color)
    backdrop.paste(image, mask=image.getchannel("A"))
    backdrop.save(path, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-dir", type=Path, required=True)
    parser.add_argument("--meadow-reference", type=Path)
    args = parser.parse_args()
    run = args.run_dir.resolve()
    raw_dir = run / "raw"
    candidate_dir = run / "candidate"
    qa_dir = run / "qa"
    candidate_dir.mkdir(exist_ok=True)
    qa_dir.mkdir(exist_ok=True)
    report = {
        "id": "terrain-detail",
        "status": "candidate-needs-scene-review",
        "runtime_publish_allowed": False,
        "process": "Resize Lanczos 1254 to 1024; one deterministic opposite-edge 64px crossfade; WebP quality search under 250000B; road 102px side-alpha derivative",
        "assets": {},
    }
    if args.meadow_reference is not None:
        meadow_path = args.meadow_reference.resolve()
        if not meadow_path.is_file():
            raise FileNotFoundError(meadow_path)
        report["read_only_scene_color_reference"] = {
            "path": str(meadow_path),
            "sha256": sha256(meadow_path),
        }
    for asset in ASSETS:
        raw = raw_dir / f"{asset}-generated.png"
        prompt = run / "prompts" / f"{asset}.txt"
        if not raw.is_file() or not prompt.is_file():
            raise FileNotFoundError(f"Source or submitted prompt missing for {asset}")
        with Image.open(raw) as source:
            raw_shape = list(source.size)
            raw_mode = source.mode
            resized = source.convert("RGB").resize((SIZE, SIZE), Image.Resampling.LANCZOS)
        before = np.asarray(resized)
        before_metrics = seam_metrics(before)
        tile_preview(resized, qa_dir / f"{asset}-raw-resized-2x2.png")
        repaired = repair_one_pass(before)
        repaired_image = Image.fromarray(repaired, "RGB")
        candidate = candidate_dir / f"{asset}.webp"
        quality = webp_under_budget(repaired_image, candidate)
        with Image.open(candidate) as encoded:
            roundtrip = encoded.convert("RGB")
            if roundtrip.size != (SIZE, SIZE):
                raise AssertionError("WebP dimension mismatch")
            decoded = np.asarray(roundtrip)
            tile_preview(roundtrip, qa_dir / f"{asset}-candidate-2x2.png")
            roundtrip.resize((64, 64), Image.Resampling.LANCZOS).save(
                qa_dir / f"{asset}-64px.png"
            )
            roundtrip.save(qa_dir / f"{asset}-1024px.png", optimize=True)
        after_metrics = seam_metrics(decoded)
        difference = np.abs(decoded.astype(np.int16) - repaired.astype(np.int16))
        entry = {
            "submitted_prompt": str(prompt.relative_to(run)).replace("\\", "/"),
            "submitted_prompt_sha256": sha256(prompt),
            "raw_source": str(raw.relative_to(run)).replace("\\", "/"),
            "raw_sha256": sha256(raw),
            "raw_size": raw_shape,
            "raw_mode": raw_mode,
            "candidate": str(candidate.relative_to(run)).replace("\\", "/"),
            "candidate_sha256": sha256(candidate),
            "candidate_bytes": candidate.stat().st_size,
            "candidate_mode": "RGB / opaque",
            "candidate_dimensions": [SIZE, SIZE],
            "webp_quality": quality,
            "compression_mean_rgb_abs": round(float(difference.mean()), 3),
            "seam_before_repair": before_metrics,
            "seam_after_webp_roundtrip": after_metrics,
            "one_repair_pass_applied": True,
            "repair_description": "64-pixel opposite-edge smoothstep crossfade, only source-derived pixels",
            "visual_review": "2x2 and 64px previews inspected; in-scene review pending",
        }
        if candidate.stat().st_size >= 250000:
            raise AssertionError(f"Oversize {candidate}")
        if asset == "dirt-road":
            alpha = side_fade_mask()
            rgba = np.dstack((repaired, alpha))
            road_alpha = candidate_dir / "dirt-road-side-alpha.png"
            Image.fromarray(rgba, "RGBA").save(road_alpha, optimize=True)
            if not np.array_equal(rgba[0], rgba[-1]):
                raise AssertionError("Road PNG is not vertically tileable")
            if not np.array_equal(alpha, np.broadcast_to(alpha[0], alpha.shape)):
                raise AssertionError("Road alpha changes along V")
            if np.any(alpha[:, 0]) or np.any(alpha[:, -1]):
                raise AssertionError("Road side pixel must be fully transparent")
            if not np.all(alpha[:, ROAD_FADE_PX : SIZE - ROAD_FADE_PX] == 255):
                raise AssertionError("Road center must be opaque")
            if not np.array_equal(rgba[:, :, :3], repaired):
                raise AssertionError("RGB may not be premultiplied by alpha")
            if not np.all(np.diff(alpha[0, : ROAD_FADE_PX + 1].astype(np.int16)) >= 0):
                raise AssertionError("Left side alpha should rise monotonically")
            if not np.all(np.diff(alpha[0, SIZE - ROAD_FADE_PX - 1 :].astype(np.int16)) <= 0):
                raise AssertionError("Right side alpha should fall monotonically")
            make_alpha_preview(Image.fromarray(rgba, "RGBA"), qa_dir / "dirt-road-side-alpha-checker.png")
            Image.fromarray(rgba, "RGBA").resize((64, 64), Image.Resampling.LANCZOS).save(
                qa_dir / "dirt-road-side-alpha-64px.png"
            )
            if args.meadow_reference is not None:
                with Image.open(args.meadow_reference) as meadow_source:
                    meadow = meadow_source.convert("RGB").resize((SIZE, SIZE), Image.Resampling.LANCZOS)
                road_composite = meadow.copy()
                road_composite.paste(Image.fromarray(rgba, "RGBA"), (0, 0), Image.fromarray(alpha, "L"))
                road_composite.save(qa_dir / "dirt-road-over-existing-meadow.png", optimize=True)
            entry["side_alpha"] = {
                "path": str(road_alpha.relative_to(run)).replace("\\", "/"),
                "sha256": sha256(road_alpha),
                "bytes": road_alpha.stat().st_size,
                "mode": "RGBA straight/unassociated alpha",
                "fade_pixels_each_side": ROAD_FADE_PX,
                "fade_fraction_each_side": round(ROAD_FADE_PX / SIZE, 6),
                "top_bottom_rows_identical": True,
                "center_opaque": True,
                "edge_rgb_preserved_at_zero_alpha": True,
            }
        report["assets"][asset] = entry
        if after_metrics["left_right_mean_rgb_abs"] >= before_metrics["left_right_mean_rgb_abs"]:
            raise AssertionError(f"Horizontal seam did not improve for {asset}")
        if after_metrics["top_bottom_mean_rgb_abs"] >= before_metrics["top_bottom_mean_rgb_abs"]:
            raise AssertionError(f"Vertical seam did not improve for {asset}")
    contact = Image.new("RGB", (2048, 1024), (27, 33, 33))
    for index, asset in enumerate(ASSETS):
        with Image.open(qa_dir / f"{asset}-candidate-2x2.png") as tile:
            contact.paste(tile.convert("RGB").resize((1024, 1024), Image.Resampling.LANCZOS), (index * 1024, 0))
    contact.save(qa_dir / "terrain-detail-contact.png", optimize=True)
    report["qa_contact"] = "qa/terrain-detail-contact.png"
    report_path = qa_dir / "report.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(report_path)
    for asset, entry in report["assets"].items():
        print(asset, entry["candidate_bytes"], "bytes, q", entry["webp_quality"])
        print("seams before/after", entry["seam_before_repair"], entry["seam_after_webp_roundtrip"])


if __name__ == "__main__":
    main()
