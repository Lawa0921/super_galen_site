"""Authored region masks and sampling of generated pixels; no invented grain."""
import numpy as np


def isolate_uv_faces(uv, face_ids):
    uv = np.asarray(uv, float)
    ids = np.unique(np.asarray(face_ids, int))
    if uv.ndim != 3 or uv.shape[1:] != (3, 2) or np.any(ids < 0) or np.any(ids >= len(uv)):
        raise ValueError('Expected valid triangular UVs and source face IDs')
    result = uv.copy()
    if not len(ids):
        return result
    result[:, :, 0] *= .90
    rows = int(np.ceil(len(ids) / 2))
    height = 1 / rows
    side = min(.024, height * .7)
    for index, face in enumerate(ids):
        x = .926 + (index % 2) * .04
        y = (index // 2 + .5) * height - side * .5
        result[face] = [[x, y], [x+side, y], [x, y+side]]
    return result


def atlas_conflicts(indices, points, tolerance_m=1e-5):
    indices, points = np.asarray(indices), np.asarray(points, float)
    order = np.argsort(indices, kind='stable')
    keys, starts, counts = np.unique(indices[order], return_index=True, return_counts=True)
    conflicts, maximum = [], 0.
    for key, start, count in zip(keys[counts > 1], starts[counts > 1], counts[counts > 1]):
        samples = points[order[start:start+count]]
        distance = float(np.linalg.norm(samples[:, None] - samples[None, :], axis=2).max())
        maximum = max(maximum, distance)
        if distance > tolerance_m:
            conflicts.append(int(key))
    return {'duplicate_pixels': int((counts > 1).sum()), 'conflicting_pixels': conflicts,
            'maximum_surface_separation_m': maximum, 'tolerance_m': tolerance_m}


def repeat_sample(tile, uv):
    tile, uv = np.asarray(tile, float), np.asarray(uv, float)
    if tile.ndim != 3 or tile.shape[2] != 3 or min(tile.shape[:2]) < 2:
        raise ValueError('Expected an RGB material tile')
    if uv.ndim != 2 or uv.shape[1] != 2 or not np.isfinite(uv).all():
        raise ValueError('Expected finite UV pairs')
    coordinates = np.mod(uv, 1) * np.array([tile.shape[1], tile.shape[0]])
    base = np.floor(coordinates).astype(int)
    fraction = coordinates - base
    x0, y0 = base[:, 0] % tile.shape[1], base[:, 1] % tile.shape[0]
    x1, y1 = (x0 + 1) % tile.shape[1], (y0 + 1) % tile.shape[0]
    u, v = fraction[:, 0, None], fraction[:, 1, None]
    return ((1-v) * ((1-u)*tile[y0, x0] + u*tile[y0, x1]) +
            v * ((1-u)*tile[y1, x0] + u*tile[y1, x1]))


def triplanar_sample(tile, points, normals, repeat_m):
    points, normals = np.asarray(points, float), np.asarray(normals, float)
    if points.ndim != 2 or points.shape[1] != 3 or normals.shape != points.shape:
        raise ValueError('Expected matching point and normal triples')
    lengths = np.linalg.norm(normals, axis=1)
    if repeat_m <= 0 or not np.isfinite(repeat_m) or not np.isfinite(points).all() or not np.isfinite(normals).all() or np.any(lengths < 1e-12):
        raise ValueError('Finite positions, nonzero normals and positive repeat length required')
    weights = np.abs(normals / lengths[:, None]) ** 4
    weights /= weights.sum(axis=1, keepdims=True)
    planes = ((1, 2), (0, 2), (0, 1))
    colors = np.stack([repeat_sample(tile, points[:, axes] / repeat_m) for axes in planes], axis=1)
    return np.einsum('nij,ni->nj', colors, weights)


def material_regions(points, normals):
    """Whole-region correction on face centers; visual QA is mandatory.

    IDs: 0 steel, 1 brass, 2 textile. No concept-image ornament or shadow enters
    the bake. The mesh's original raised central ridge gets a narrow brass strip.
    """
    points, normals = np.asarray(points, float), np.asarray(normals, float)
    if points.ndim != 2 or points.shape[1] != 3 or normals.shape != points.shape or not np.isfinite(points).all() or not np.isfinite(normals).all():
        raise ValueError('Expected finite mesh samples and normals')
    x, y, z = points.T
    radius = np.sqrt((x / .105)**2 + ((y + .04) / .137)**2)
    lower_rim = 1.570 - .34*y + .08*np.abs(x)
    helmet = (np.abs(x) < .145) & (z >= lower_rim)
    rim = helmet & (z - lower_rim < .0045)
    ridge = helmet & (np.abs(x) < .0035) & (z > 1.70)
    neck = (radius < .75) & (z < lower_rim - .004) & (z > lower_rim - .026)
    inner_arm = np.zeros(len(points), dtype=bool)
    material = np.zeros(len(points), dtype=np.uint8)
    material[neck | inner_arm] = 2
    material[rim | ridge] = 1
    return {'material': material, 'helmet': helmet, 'rim': rim, 'ridge': ridge,
            'neck': neck, 'inner_arm': inner_arm}


def sample_face_materials(face_labels, face_ids):
    """Keep a complete triangle's label throughout its rasterized surface."""
    labels, ids = np.asarray(face_labels), np.asarray(face_ids)
    if labels.ndim != 1 or ids.ndim != 1 or not np.issubdtype(ids.dtype, np.integer) or np.any(ids < 0) or np.any(ids >= len(labels)):
        raise ValueError('Expected valid source face indices')
    return labels[ids]
