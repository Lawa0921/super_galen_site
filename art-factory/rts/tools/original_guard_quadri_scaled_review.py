"""Matched-camera original/retopology comparison and silhouette evidence."""

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_erosion, distance_transform_edt


ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-quadri-scaled/2026-10-05/revision-v2-checkpointed"
RENDERS = RUN / "qa/renders"
VIEWS = ["front", "side", "back", "head-shoulders", "left-hand",
         "right-hand", "right-arm-edge", "skirt-edge"]


def foreground(image):
    pixels = np.asarray(image.convert("RGB"), dtype=np.int16)
    corners = np.array([pixels[0, 0], pixels[-1, 0], pixels[0, -1], pixels[-1, -1]])
    background = np.median(corners, axis=0)
    mask = np.max(np.abs(pixels - background), axis=2) > 25
    if int(np.sum(mask)) < 500:
        raise ValueError("Foreground mask too small for diagnostic comparison")
    return mask


def silhouette_metrics(source, candidate):
    common = int(np.sum(source & candidate))
    total = int(np.sum(source | candidate))
    source_border = source & ~binary_erosion(source)
    candidate_border = candidate & ~binary_erosion(candidate)
    candidate_distance = distance_transform_edt(~candidate_border)
    source_distance = distance_transform_edt(~source_border)
    distances = np.concatenate((candidate_distance[source_border],
                                source_distance[candidate_border]))
    return {"source_foreground_pixels": int(np.sum(source)),
            "candidate_foreground_pixels": int(np.sum(candidate)),
            "silhouette_iou": common / total,
            "symmetric_border_distance_p95_pixels": float(np.quantile(distances, .95)),
            "symmetric_border_distance_max_pixels": float(np.max(distances))}


def main():
    metrics, hashes = {}, {}
    for name in VIEWS:
        source = Image.open(RENDERS / f"source-{name}.png").convert("RGB")
        candidate = Image.open(RENDERS / f"retopo-{name}.png").convert("RGB")
        if source.size != candidate.size:
            raise ValueError(f"Unmatched camera dimensions: {name}")
        mask_source, mask_candidate = foreground(source), foreground(candidate)
        if name in ("front", "side", "back"):
            metrics[name] = silhouette_metrics(mask_source, mask_candidate)
        width, height = source.size
        board = Image.new("RGB", (width * 3, height + 42), (30, 30, 30))
        board.paste(source, (0, 42))
        board.paste(candidate, (width, 42))
        overlay = np.zeros((height, width, 3), dtype=np.uint8)
        overlay[mask_source, 0] = 245
        overlay[mask_candidate, 1] = 225
        overlay[mask_candidate, 2] = 225
        board.paste(Image.fromarray(overlay), (width * 2, 42))
        draw = ImageDraw.Draw(board)
        for index, label in enumerate((f"ORIGINAL SOURCE | {name}",
                                       f"SCALED QUADRIFLOW | {name}",
                                       "SILHOUETTE: SOURCE RED / RETOPO CYAN")):
            draw.text((index * width + 10, 12), label, fill=(240, 240, 240))
        output = RENDERS / f"compare-{name}.png"
        board.save(output)
        hashes[output.name] = hashlib.sha256(output.read_bytes()).hexdigest()
    result = {"status": "pending_independent_visual_review",
              "runtime_publish_allowed": False,
              "camera_rule": "Each source/retopo pair used one identical orthographic camera and lights",
              "silhouette_mask_rule": "RGB departure >25 from median image corner background",
              "silhouette_metrics": metrics, "comparison_sha256": hashes,
              "diagnostic_only": True}
    RUN.joinpath("qa/visual-comparison.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
