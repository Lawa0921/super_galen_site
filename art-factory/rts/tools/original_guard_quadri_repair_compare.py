"""Matched-camera original / prerepair / exact local repair smooth-shaded boards."""

import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_quadri_scaled_review import foreground, silhouette_metrics


ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / "art-factory/rts/runs/original-guard-quadri-scaled/2026-10-05/revision-v2-checkpointed/qa/renders"
RUN = ROOT / "art-factory/rts/runs/original-guard-quadri-repair/2026-10-05"
RENDERS = RUN / "qa/renders"
VIEWS = ["front", "side", "back", "head-shoulders", "left-hand", "right-hand",
         "right-arm-edge", "skirt-edge"]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    metrics, hashes = {}, {}
    for name in VIEWS:
        inputs = [BASE / f"source-{name}.png", BASE / f"retopo-smooth-{name}.png",
                  RENDERS / f"repair-smooth-{name}.png"]
        source, before, repaired = [Image.open(path).convert("RGB") for path in inputs]
        if len({image.size for image in (source, before, repaired)}) != 1:
            raise ValueError("The three diagnostic cameras are not pixel matched")
        mask_source, mask_repaired = foreground(source), foreground(repaired)
        if name in ("front", "side", "back"):
            metrics[name] = silhouette_metrics(mask_source, mask_repaired)
        width, height = source.size
        overlay = Image.new("RGB", (width, height))
        pixels = overlay.load()
        for y in range(height):
            for x in range(width):
                pixels[x, y] = (245 if mask_source[y, x] else 0,
                                225 if mask_repaired[y, x] else 0,
                                225 if mask_repaired[y, x] else 0)
        board = Image.new("RGB", (width * 4, height + 42), (30, 30, 30))
        for index, panel in enumerate((source, before, repaired, overlay)):
            board.paste(panel, (index * width, 42))
        draw = ImageDraw.Draw(board)
        for index, title in enumerate(("ACCEPTED ORIGINAL", "SCALED QUADRIFLOW SMOOTH",
                                       "EXACT LOCAL REPAIR SMOOTH", "SILHOUETTE: RED / CYAN")):
            draw.text((index * width + 10, 12), f"{title} | {name}", fill=(240, 240, 240))
        output = RENDERS / f"compare-repair-{name}.png"
        board.save(output)
        hashes[output.name] = digest(output)
    report = {"status": "diagnostic_only", "runtime_publish_allowed": False,
              "source_image_directory": str(BASE.relative_to(ROOT)).replace("\\", "/"),
              "same_camera_and_lighting": True, "before_and_after_use_smooth_normals": True,
              "silhouette_metrics": metrics, "comparison_sha256": hashes}
    (RUN / "qa/visual-comparison.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("REPAIR_COMPARISON_DONE " + json.dumps(report), flush=True)


if __name__ == "__main__":
    main()
