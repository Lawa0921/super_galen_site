"""Fixed one-ring repair regions on an indexed triangle mesh."""
from collections import Counter
import struct


def unchanged_points(before, after, fixed_indices):
    """Compare fixed float32 vertex records independently of mesh reindexing."""
    pack = lambda point: struct.pack('<3f', *point)
    available = {pack(point) for point in after}
    return all(pack(before[i]) in available for i in fixed_indices)


def oriented_flip(first, second):
    """Flip a consistently wound pair, retaining their four outside edges."""
    for offset in range(3):
        a, b, c = first[offset:] + first[:offset]
        if a in second and b in second:
            for other_offset in range(3):
                x, y, d = second[other_offset:] + second[:other_offset]
                if (x, y) == (b, a) and len({a, b, c, d}) == 4:
                    return (b, c, d), (a, d, c)
    return None


def repair_region(faces, seed_faces, protected_vertices=()):
    """Return the seed plus one edge-neighbor ring and immutable perimeter.

    Faces are indexed in the frozen triangulation.  The result is deterministic;
    no later geometry-driven growth is permitted.
    """
    seed = set(seed_faces)
    if not seed or min(seed) < 0 or max(seed) >= len(faces):
        raise ValueError("invalid seed faces")
    edge_faces = {}
    for i, face in enumerate(faces):
        for j in range(3):
            edge = tuple(sorted((int(face[j]), int(face[(j + 1) % 3]))))
            edge_faces.setdefault(edge, []).append(i)
    region = set(seed)
    for i in seed:
        face = faces[i]
        for j in range(3):
            edge = tuple(sorted((int(face[j]), int(face[(j + 1) % 3]))))
            region.update(edge_faces[edge])
    incidence = Counter()
    for i in region:
        face = faces[i]
        for j in range(3):
            incidence[tuple(sorted((int(face[j]), int(face[(j + 1) % 3]))))] += 1
    perimeter_edges = sorted(edge for edge, count in incidence.items() if count == 1)
    perimeter = sorted({v for edge in perimeter_edges for v in edge})
    all_vertices = {int(v) for i in region for v in faces[i]}
    interior = sorted(all_vertices - set(perimeter) - set(protected_vertices))
    return {
        "seed_faces": sorted(seed), "region_faces": sorted(region),
        "perimeter_edges": perimeter_edges, "perimeter_vertices": perimeter,
        "protected_in_region": sorted(all_vertices & set(protected_vertices)),
        "editable_vertices": interior,
    }
