"""Topology and solid angle helpers for prevalidated moving armor surfaces."""
import numpy as np


def face_component_count(faces):
    """Connected components through shared edges, not shared vertices."""
    neighbors = [set() for _ in faces]
    incidence = {}
    for i, face in enumerate(faces):
        face = list(face)
        for a, b in zip(face, face[1:]+face[:1]):
            key = tuple(sorted((int(a), int(b))))
            for j in incidence.get(key, []):
                neighbors[i].add(j)
                neighbors[j].add(i)
            incidence.setdefault(key, []).append(i)
    pending = set(range(len(neighbors)))
    count = 0
    while pending:
        stack = [pending.pop()]
        count += 1
        while stack:
            adjacent = neighbors[stack.pop()] & pending
            pending.difference_update(adjacent)
            stack.extend(adjacent)
    return count


def prevalidated_surface_winding(point, triangles):
    """Signed solid angle; caller must gate closure/winding/connectivity once.

    Animation moves vertices but never changes triangle incidence. Rechecking
    that incidence inside every point query adds no protection; the QA caller
    verifies it before the pose loop and supplies the same frozen face arrays.
    """
    offsets = np.asarray(triangles, float)-np.asarray(point, float)
    a, b, c = offsets[:, 0], offsets[:, 1], offsets[:, 2]
    la, lb, lc = [np.linalg.norm(v, axis=1) for v in (a, b, c)]
    numerator = np.einsum('ij,ij->i', a, np.cross(b, c))
    denominator = la*lb*lc+np.einsum('ij,ij->i', a, b)*lc+np.einsum('ij,ij->i', b, c)*la+np.einsum('ij,ij->i', c, a)*lb
    return float(np.sum(2*np.arctan2(numerator, denominator))/(4*np.pi))
