"""Diagnose source winding and float32 sliver faces after Blender cancellation."""

import json
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-quadri/2026-10-05"


def main():
    mesh = np.load(RUN / "candidate/source-primary-exact.npz")
    vertices, triangles = mesh["vertices"], mesh["triangles"].astype(np.int64)
    tri = vertices[triangles]
    area2 = np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1)
    directed = np.concatenate([triangles[:, [0, 1]], triangles[:, [1, 2]], triangles[:, [2, 0]]])
    canonical = np.sort(directed, axis=1)
    _, inverse, counts = np.unique(canonical, axis=0, return_inverse=True, return_counts=True)
    signs = np.where(directed[:, 0] < directed[:, 1], 1, -1)
    signed_sum = np.bincount(inverse, weights=signs)
    smallest = np.argsort(area2)[:12]
    slivers = []
    for index in smallest:
        points = tri[index].astype(np.float64)
        lengths = [float(np.linalg.norm(points[(k + 1) % 3] - points[k])) for k in range(3)]
        slivers.append({"face_index": int(index), "double_area_m2": float(area2[index]),
                        "vertex_indices": triangles[index].tolist(),
                        "points": points.tolist(), "edge_lengths": lengths})
    report = {
        "zero_area_float32_face_indices": np.flatnonzero(area2 == 0).tolist(),
        "minimum_positive_double_area_float32": float(area2[area2 > 0].min()),
        "boundary_edge_count": int(np.sum(counts == 1)),
        "nonmanifold_edge_count": int(np.sum(counts > 2)),
        "winding_inconsistent_edge_count": int(np.sum((counts == 2) & (signed_sum != 0))),
        "signed_volume_m3": float(np.einsum("ij,ij->", tri[:, 0].astype(np.float64),
                              np.cross(tri[:, 1].astype(np.float64), tri[:, 2].astype(np.float64))) / 6),
        "smallest_faces": slivers,
    }
    RUN.joinpath("qa/cancel-diagnosis.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
