"""Finite source-ID cloth relief with fixed domain boundary and harmonic falloff."""
import numpy as np


def relief_weights(points, edges, source_ids, safe, core):
    points = np.asarray(points, float)
    source_ids = list(source_ids)
    if len(source_ids) != len(points) or len(set(source_ids)) != len(points) or not np.isfinite(points).all():
        raise ValueError('Invalid points or source identities')
    lookup = {value: i for i, value in enumerate(source_ids)}
    if not core <= safe or not safe <= lookup.keys():
        raise ValueError('Relief source IDs missing or outside domain')
    neighbors = [set() for _ in points]
    for a, b in edges:
        neighbors[a].add(b)
        neighbors[b].add(a)
    domain = {lookup[value] for value in safe}
    boundary = {i for i in domain if neighbors[i] - domain}
    anchors = {lookup[value] for value in core} - boundary
    if not anchors or max(points[i, 1] for i in anchors) <= 0:
        raise ValueError('No positive interior anchor')
    weights = np.zeros(len(points))
    maximum_y = max(points[i, 1] for i in anchors)
    for i in anchors:
        t = np.clip(points[i, 1] / maximum_y, 0., 1.)
        weights[i] = t * t * (3 - 2 * t)
    unknown = sorted(domain - boundary - anchors)
    index = {value: i for i, value in enumerate(unknown)}
    matrix = np.zeros((len(unknown), len(unknown)))
    rhs = np.zeros(len(unknown))
    for i in unknown:
        row = index[i]
        matrix[row, row] = len(neighbors[i])
        for j in neighbors[i]:
            if j in index:
                matrix[row, index[j]] -= 1
            else:
                rhs[row] += weights[j]
    if unknown:
        weights[unknown] = np.linalg.solve(matrix, rhs)
    weights /= weights.max()
    assert np.isfinite(weights).all() and weights.min() >= 0 and weights.max() <= 1
    return weights
