"""Plot exact seven-hole triangle crossings in three canonical projections."""

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-quadri-repair/2026-10-05"
INPUT = RUN / "qa/patch-intersections.json"
OUTPUT = RUN / "qa/seven-hole-intersections.png"


def main():
    rows = json.loads(INPUT.read_text(encoding="utf-8"))["pairs"]
    triangles = {(kind, tuple(row[f"{kind}_vertex_ids"])): row[f"{kind}_vertices_m"]
                 for row in rows for kind in ("patch", "retained")}
    hits = np.array([hit["point"] for row in rows for hit in row["segment_triangle_hits"]
                     if hit["kind"] == "interior_crossing"], dtype=np.float64)
    all_points = np.array([point for triangle in triangles.values() for point in triangle] + hits.tolist())
    projections = [(0, 2, "X / Z"), (1, 2, "Y / Z"), (0, 1, "X / Y")]
    image = Image.new("RGB", (1800, 680), (28, 30, 34))
    draw = ImageDraw.Draw(image)
    for column, (axis_x, axis_y, label) in enumerate(projections):
        box_x = column * 600
        low, high = np.min(all_points[:, [axis_x, axis_y]], axis=0), np.max(all_points[:, [axis_x, axis_y]], axis=0)
        span = np.maximum(high - low, .001)
        low -= span * .18
        high += span * .18
        def pixel(point):
            xy = np.asarray(point)[[axis_x, axis_y]]
            return (int(box_x + 36 + 528 * (xy[0] - low[0]) / (high[0] - low[0])),
                    int(620 - 530 * (xy[1] - low[1]) / (high[1] - low[1])))
        draw.text((box_x + 16, 14), f"7-edge temporary cap | {label}", fill=(235, 235, 235))
        draw.text((box_x + 16, 34), "RED cap / CYAN retained / YELLOW strict crossings", fill=(210, 210, 210))
        for (kind, ids), triangle in triangles.items():
            coordinates = [pixel(point) for point in triangle]
            coordinates.append(coordinates[0])
            draw.line(coordinates, fill=(244, 80, 80) if kind == "patch" else (74, 219, 236), width=3)
            draw.text(coordinates[0], str(ids[0]), fill=(230, 230, 230))
        for point in hits:
            x, y = pixel(point)
            draw.ellipse((x - 4, y - 4, x + 4, y + 4), fill=(250, 231, 75))
        draw.text((box_x + 16, 647), f"canonical metres | X {low[0]:.4f}..{high[0]:.4f}", fill=(210, 210, 210))
    image.save(OUTPUT)
    print(str(OUTPUT))


if __name__ == "__main__":
    main()
