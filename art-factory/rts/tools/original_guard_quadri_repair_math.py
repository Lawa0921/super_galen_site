"""Deterministic, local exact-coordinate repair helpers; no source projection or global remesh."""

from collections import defaultdict

import numpy as np


def collapse_exact_groups(vertices, faces, groups):
    vertices = np.asarray(vertices)
    if vertices.dtype != np.float32 or vertices.ndim != 2 or vertices.shape[1] != 3:
        raise ValueError("Expected (N,3) float32 source coordinates")
    representative = np.arange(len(vertices), dtype=np.int32)
    touched = set()
    for group in groups:
        ids = sorted(set(int(index) for index in group))
        if len(ids) < 2 or any(index < 0 or index >= len(vertices) for index in ids):
            raise ValueError("Invalid exact-coordinate weld group")
        if touched.intersection(ids):
            raise ValueError("Overlapping exact-coordinate weld groups")
        touched.update(ids)
        original_bits = vertices[ids].view(np.uint32).reshape(len(ids), 3)
        if not np.all(original_bits == original_bits[0]):
            raise ValueError("Weld group vertices do not have exact equal float32 coordinates")
        representative[ids] = ids[0]
    kept = np.flatnonzero(representative == np.arange(len(vertices)))
    compact = np.full(len(vertices), -1, dtype=np.int32)
    compact[kept] = np.arange(len(kept), dtype=np.int32)
    mapping = compact[representative]
    return vertices[kept].copy(), mapping[np.asarray(faces, dtype=np.int32)], mapping


def oriented_boundary_loops(faces):
    incidence = defaultdict(list)
    for face in faces:
        cycle = [int(v) for v in face]
        if len(cycle) < 3 or len(set(cycle)) != len(cycle):
            raise ValueError("Degenerate face before boundary inspection")
        for a, b in zip(cycle, cycle[1:] + cycle[:1]):
            incidence[tuple(sorted((a, b)))].append((a, b))
    if any(len(directions) > 2 for directions in incidence.values()):
        raise ValueError("Nonmanifold edge before temporary patch")
    directed = [(b, a) for directions in incidence.values()
                if len(directions) == 1 for a, b in directions]
    outgoing = defaultdict(list)
    for a, b in directed:
        outgoing[a].append(b)
    if any(len(targets) != 1 for targets in outgoing.values()):
        raise ValueError("Boundary is branched, not a set of simple loops")
    remaining = set(directed)
    loops = []
    while remaining:
        start = min(remaining)
        loop = [start[0]]
        edge = start
        while edge in remaining:
            remaining.remove(edge)
            a, b = edge
            if a != loop[-1]:
                raise ValueError("Disconnected boundary walk")
            if b == loop[0]:
                break
            if b in loop:
                raise ValueError("Self-touching boundary walk")
            loop.append(b)
            edge = (b, outgoing[b][0])
        else:
            raise ValueError("Open boundary chain")
        loops.append(loop)
    return sorted(loops, key=lambda cycle: (len(cycle), min(cycle)))


def triangulate_boundary_loop(vertices, loop):
    """Ear-clip a 3D boundary by its best-fit 2D projection, retaining existing IDs."""
    loop = [int(index) for index in loop]
    if len(loop) < 3 or len(set(loop)) != len(loop):
        raise ValueError("Invalid patch loop")
    points = np.asarray(vertices, dtype=np.float64)[loop]
    normal = np.zeros(3)
    for a, b in zip(points, np.roll(points, -1, axis=0)):
        normal += np.cross(a, b)
    axis = int(np.argmax(np.abs(normal)))
    if abs(normal[axis]) < 1e-12:
        raise ValueError("Patch boundary has zero projected area")
    xy = np.delete(points, axis, axis=1)
    signed_area = sum(xy[i, 0] * xy[(i + 1) % len(xy), 1] -
                      xy[(i + 1) % len(xy), 0] * xy[i, 1]
                      for i in range(len(xy)))
    sign = 1 if signed_area > 0 else -1

    def cross(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

    remaining = list(range(len(loop)))
    triangles = []
    while len(remaining) > 3:
        valid = []
        for index in range(len(remaining)):
            prev, mid, next_ = (remaining[(index - 1) % len(remaining)],
                                remaining[index], remaining[(index + 1) % len(remaining)])
            area = sign * cross(xy[prev], xy[mid], xy[next_])
            if area <= 1e-12:
                continue
            def within(point):
                return all(sign * cross(xy[u], xy[v], point) >= -1e-12
                           for u, v in ((prev, mid), (mid, next_), (next_, prev)))
            if any(within(xy[other]) for other in remaining
                   if other not in (prev, mid, next_)):
                continue
            diagonal = float(np.linalg.norm(points[prev] - points[next_]))
            valid.append((diagonal, index, (prev, mid, next_)))
        if not valid:
            raise ValueError("No valid ear; boundary may overlap in projection")
        _, index, ear = min(valid)
        triangles.append(tuple(loop[i] for i in ear))
        remaining.pop(index)
    triangles.append(tuple(loop[i] for i in remaining))
    return triangles


def segment_triangle_intersection(start, end, triangle, epsilon=1e-12):
    """Finite-segment Möller–Trumbore hit, classified by barycentric interiority."""
    a, b = np.asarray([start, end], dtype=np.float64)
    v0, v1, v2 = np.asarray(triangle, dtype=np.float64)
    direction, edge1, edge2 = b - a, v1 - v0, v2 - v0
    p = np.cross(direction, edge2)
    det = float(np.dot(edge1, p))
    if abs(det) <= epsilon:
        return None
    inverse = 1.0 / det
    tvec = a - v0
    u = float(np.dot(tvec, p) * inverse)
    if u < -epsilon or u > 1 + epsilon:
        return None
    q = np.cross(tvec, edge1)
    v = float(np.dot(direction, q) * inverse)
    if v < -epsilon or u + v > 1 + epsilon:
        return None
    fraction = float(np.dot(edge2, q) * inverse)
    if fraction < -epsilon or fraction > 1 + epsilon:
        return None
    margins = (u, v, 1 - u - v, fraction, 1 - fraction)
    return {"point": (a + direction * fraction).tolist(),
            "segment_fraction": fraction, "barycentric": [1 - u - v, u, v],
            "kind": "interior_crossing" if min(margins) > 1e-8 else "boundary_contact"}


def harmonic_disk_triangulation(vertices, old_faces, outer_loop):
    """Map a topological disk to a convex UV circle, then retriangulate its fixed ring."""
    from scipy.spatial import Delaunay
    outer_loop = [int(v) for v in outer_loop]
    used = sorted({int(v) for face in old_faces for v in face})
    if len(set(outer_loop)) != len(outer_loop) or not set(outer_loop).issubset(used):
        raise ValueError("Outer loop is not a simple subset of the patch disk")
    neighbors = {v: set() for v in used}
    for face in old_faces:
        cycle = [int(v) for v in face]
        for a, b in zip(cycle, cycle[1:] + cycle[:1]):
            neighbors[a].add(b)
            neighbors[b].add(a)
    outer = set(outer_loop)
    inner = [v for v in used if v not in outer]
    positions = np.asarray(vertices, dtype=np.float64)
    lengths = [np.linalg.norm(positions[outer_loop[(i + 1) % len(outer_loop)]] -
                              positions[outer_loop[i]]) for i in range(len(outer_loop))]
    total = sum(lengths)
    if total <= 0:
        raise ValueError("Outer ring has no arc length")
    angles = np.cumsum([0.0] + lengths[:-1]) * (2 * np.pi / total)
    uv = {v: np.array([np.cos(angle), np.sin(angle)])
          for v, angle in zip(outer_loop, angles)}
    if inner:
        index = {v: i for i, v in enumerate(inner)}
        matrix = np.zeros((len(inner), len(inner)), dtype=np.float64)
        rhs = np.zeros((len(inner), 2), dtype=np.float64)
        for v in inner:
            row = index[v]
            matrix[row, row] = len(neighbors[v])
            for neighbor in neighbors[v]:
                if neighbor in index:
                    matrix[row, index[neighbor]] -= 1
                else:
                    rhs[row] += uv[neighbor]
        solved = np.linalg.solve(matrix, rhs)
        uv.update({v: solved[index[v]] for v in inner})
    ordered = outer_loop + inner
    planar = np.array([uv[v] for v in ordered])
    triangles = []
    for simplex in Delaunay(planar).simplices:
        a, b, c = map(int, simplex)
        area = np.linalg.det(np.stack((planar[b] - planar[a], planar[c] - planar[a])))
        triangles.append(tuple(ordered[i] for i in ((a, b, c) if area > 0 else (a, c, b))))
    boundary = oriented_boundary_loops(triangles)
    if len(boundary) != 1 or set(boundary[0]) != outer:
        raise ValueError("Triangulation changed the fixed outer boundary")
    return triangles, uv
