"""Independent polygon incidence and location audit of saved raw solver output."""

import hashlib
import json
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-quadri-scaled/2026-10-05/revision-v2-checkpointed"
RAW = RUN / "candidate/raw-solver-scaled.npz"
GROUND = -0.9685986638069153
SCALE = 0.9481278155956246


def main():
    data = np.load(RAW)
    scaled = data["vertices_scaled_float32"]
    offsets = data["face_offsets"]
    indices = data["face_vertex_indices"]
    sizes = np.diff(offsets)
    if not np.all(sizes == 4):
        raise ValueError("Expected all-quad solver checkpoint")
    quads = indices.reshape(-1, 4)
    native = scaled.astype(np.float64) / 2048.0
    canonical = np.stack((-native[:, 0], native[:, 2], native[:, 1] - GROUND), axis=1) * SCALE
    edges = np.sort(np.concatenate([quads[:, [i, (i + 1) % 4]] for i in range(4)]), axis=1)
    unique, counts = np.unique(edges, axis=0, return_counts=True)
    boundary = unique[counts == 1]
    nonmanifold = unique[counts > 2]
    q = canonical[quads]
    double_area = (np.linalg.norm(np.cross(q[:, 1] - q[:, 0], q[:, 2] - q[:, 0]), axis=1) +
                   np.linalg.norm(np.cross(q[:, 2] - q[:, 0], q[:, 3] - q[:, 0]), axis=1))
    smallest = np.argsort(double_area)[:20]
    report = {
        "status": "qa_failed", "runtime_publish_allowed": False,
        "raw_solver_sha256": hashlib.sha256(RAW.read_bytes()).hexdigest(),
        "vertex_count": len(canonical), "quad_count": len(quads),
        "polygon_boundary_edges": len(boundary),
        "polygon_nonmanifold_edges": len(nonmanifold),
        "boundary_segments_canonical": [{"vertices": edge.tolist(),
                                         "midpoint": canonical[edge].mean(axis=0).tolist(),
                                         "length_m": float(np.linalg.norm(canonical[edge[1]] - canonical[edge[0]]))}
                                        for edge in boundary],
        "analytic_quad_double_area_min_m2": float(double_area.min()),
        "analytic_quad_zero_area_count": int(np.sum(double_area == 0)),
        "smallest_analytic_quad_areas": [{"face_index": int(index),
                                           "double_area_m2": float(double_area[index]),
                                           "center": q[index].mean(axis=0).tolist()}
                                          for index in smallest],
        "note": "Blender BMesh reports 11 zero-area faces; analytic triangle-split areas are separate evidence and do not override Blender's result."
    }
    RUN.joinpath("qa/raw-geometry-audit.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("vertex_count", "quad_count", "polygon_boundary_edges",
                                                 "polygon_nonmanifold_edges", "analytic_quad_double_area_min_m2",
                                                 "analytic_quad_zero_area_count")}, indent=2))


if __name__ == "__main__":
    main()
