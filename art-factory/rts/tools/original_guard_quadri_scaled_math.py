"""Match Blender's componentwise near-zero edge precheck on float32 mesh data."""

import numpy as np


BLENDER_EDGE_EPSILON = np.float32(1e-4)


def scale_float32_exact(vertices, factor):
    """Scale float32 mesh coordinates by a power of two with bit-exact inverse."""
    if not isinstance(factor, int) or factor <= 0 or factor & (factor - 1):
        raise ValueError("Scale must be a positive power of two")
    points = np.asarray(vertices)
    if points.dtype != np.float32 or points.ndim != 2 or points.shape[1] != 3:
        raise ValueError("Expected Nx3 float32 mesh-data coordinates")
    with np.errstate(over="ignore", invalid="ignore"):
        scaled = np.multiply(points, np.float32(factor), dtype=np.float32)
        restored = np.divide(scaled, np.float32(factor), dtype=np.float32)
    if not np.isfinite(scaled).all() or not np.array_equal(restored.view(np.uint32),
                                                           points.view(np.uint32)):
        raise ValueError("Scaled coordinates fail bit-exact float32 roundtrip")
    return scaled


def blender_near_edge_mask(a, b, epsilon=BLENDER_EDGE_EPSILON):
    """compare_v3v3(a,b,epsilon): every axis difference is <= epsilon."""
    first = np.asarray(a, dtype=np.float32)
    second = np.asarray(b, dtype=np.float32)
    if first.shape != second.shape or first.ndim != 2 or first.shape[1] != 3:
        raise ValueError("Expected matching Nx3 edge endpoint arrays")
    return np.all(np.abs(first - second) <= np.float32(epsilon), axis=1)


def unique_triangle_edges(triangles):
    faces = np.asarray(triangles)
    if faces.ndim != 2 or faces.shape[1] != 3:
        raise ValueError("Expected Mx3 triangles")
    edges = np.concatenate((faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]))
    return np.unique(np.sort(edges, axis=1), axis=0)


def scaled_edge_diagnostic(vertices, triangles, factor):
    scaled = scale_float32_exact(vertices, factor)
    edges = unique_triangle_edges(triangles)
    a, b = scaled[edges[:, 0]], scaled[edges[:, 1]]
    delta = np.abs(a - b)
    linf = np.max(delta, axis=1)
    near = blender_near_edge_mask(a, b)
    return {"scale_factor": factor, "edge_count": int(len(edges)),
            "near_edge_count": int(np.sum(near)),
            "minimum_linf_edge": float(np.min(linf)),
            "threshold_componentwise_inclusive": float(BLENDER_EDGE_EPSILON),
            "roundtrip_float32_bits_equal": True}
