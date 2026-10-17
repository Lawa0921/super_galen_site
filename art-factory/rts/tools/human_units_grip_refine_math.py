"""Axis-aware placement math for the worker grip copied from the original project hand mesh."""
from __future__ import annotations
import math


SOURCE_CHANNEL_ORIGIN_M = (0.0696278259687629, 0.020799771149057955, 0.17)
SOURCE_CHANNEL_AXIS = (-0.011295106135510071, 0.0011887328837747986, 0.9999355016657416)
SOURCE_CHANNEL_RADIUS_M = 0.02728495049705316
SOURCE_FINGER_SIDE = (1.0, 0.0, 0.0)


def _dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def _normalize(v):
    length = math.sqrt(_dot(v, v))
    if length < 1e-12:
        raise ValueError("Cannot normalize a zero-length vector")
    return tuple(x / length for x in v)


def _align_vector(v, source, target=(0.0, 0.0, 1.0)):
    """Rodrigues rotation taking source grip axis to the requested target axis."""
    a = _normalize(source)
    b = _normalize(target)
    axis = _cross(a, b)
    sine2 = _dot(axis, axis)
    cosine = max(-1.0, min(1.0, _dot(a, b)))
    if sine2 < 1e-18:
        if cosine > 0:
            return tuple(v)
        raise ValueError("Antiparallel grip axes need an explicit half-turn axis")
    first = _cross(axis, v)
    second = _cross(axis, first)
    factor = (1.0 - cosine) / sine2
    return tuple(v[i] + first[i] + factor * second[i] for i in range(3))


SOURCE_WRIST_CAP_CENTER_M = (-0.0926789895554, -0.0120840780013, 0.0739744958270)
SOURCE_WRIST_CAP_NORMAL = (-0.9189973812065, -0.1528174345587, -0.3634427672007)


def source_grip_transform_point(point, target_channel_center, scale, spin_degrees=90.0, target_axis_sign=1):
    """Rigidly fit the source haft channel to a worker axe axis.

    target_axis_sign is +1 or -1 because the original channel axis is undirected.
    The channel origin stays at the haft center; rotation and spin are rigid.
    """
    if scale <= 0:
        raise ValueError("Scale must be positive")
    if target_axis_sign not in (-1, 1):
        raise ValueError("target_axis_sign must be +1 or -1")
    delta = tuple(point[i] - SOURCE_CHANNEL_ORIGIN_M[i] for i in range(3))
    if target_axis_sign == 1:
        aligned = _align_vector(delta, SOURCE_CHANNEL_AXIS)
    else:
        # Stable half turn around source-local X, followed by the same channel alignment.
        flipped = (delta[0], -delta[1], -delta[2])
        flipped_axis = (SOURCE_CHANNEL_AXIS[0], -SOURCE_CHANNEL_AXIS[1], -SOURCE_CHANNEL_AXIS[2])
        aligned = _align_vector(flipped, flipped_axis, target=(0.0, 0.0, -1.0))
    spin = math.radians(spin_degrees)
    x = math.cos(spin) * aligned[0] - math.sin(spin) * aligned[1]
    y = math.sin(spin) * aligned[0] + math.cos(spin) * aligned[1]
    return tuple(target_channel_center[i] + scale * (x, y, aligned[2])[i] for i in range(3))


def _angle_delta(a: float, b: float) -> float:
    return (a - b + math.pi) % (2 * math.pi) - math.pi


def profile_radius(z: float, angle_rad: float) -> float:
    """Retained reference profile from the rejected procedural sleeve experiment."""
    palm_back = 0.008 * max(math.cos(angle_rad), 0.0) ** 2
    finger_front = math.exp(-(_angle_delta(angle_rad, math.pi) / 0.62) ** 2)
    fingers = 0.010 * sum(math.exp(-((z - center) / 0.0052) ** 2)
                           for center in (-0.027, -0.009, 0.009, 0.027))
    thumb = 0.012 * math.exp(-(_angle_delta(angle_rad, math.pi / 2) / 0.42) ** 2) * math.exp(-((z - 0.002) / 0.021) ** 2)
    taper = 0.007 * max(0.0, (abs(z) - 0.038) / (0.085 - 0.038))
    return max(0.0265, 0.025 + palm_back + fingers * finger_front + thumb - taper)


def edge_use_counts(faces: list[tuple[int, ...]]) -> dict[tuple[int, int], int]:
    counts: dict[tuple[int, int], int] = {}
    for face in faces:
        for start, end in zip(face, face[1:] + face[:1]):
            edge = (min(start, end), max(start, end))
            counts[edge] = counts.get(edge, 0) + 1
    return counts


def _components(vertices: list[tuple[float, float, float]], faces: list[tuple[int, ...]]) -> int:
    neighbors = [[] for _ in vertices]
    for face in faces:
        for a, b in zip(face, face[1:] + face[:1]):
            neighbors[a].append(b)
            neighbors[b].append(a)
    seen: set[int] = set()
    components = 0
    for start in range(len(vertices)):
        if start in seen or not neighbors[start]:
            continue
        components += 1
        stack = [start]
        seen.add(start)
        while stack:
            for other in neighbors[stack.pop()]:
                if other not in seen:
                    seen.add(other)
                    stack.append(other)
    return components


def build_closed_grip_shell(
    shaft_radius_m: float = 0.019,
    segments: int = 36,
    levels: int = 12,
) -> tuple[list[tuple[float, float, float]], list[tuple[int, int, int, int]], dict[str, float | int | bool]]:
    """Rejected fallback sleeve surface, retained only for reproducible failure tests."""
    if shaft_radius_m <= 0 or segments < 16 or levels < 4:
        raise ValueError("positive shaft radius, >=16 radial segments and >=4 levels required")
    bore = max(0.0195, shaft_radius_m + 0.0005)
    if bore > 0.022:
        raise ValueError("shaft exceeds the original human grip scale")
    vertices = []
    for level in range(levels):
        z = -0.055 + 0.140 * level / (levels - 1)
        for ring in (0, 1):
            for index in range(segments):
                angle = 2 * math.pi * index / segments
                radius = profile_radius(z, angle) if ring == 0 else bore
                vertices.append((radius * math.cos(angle), radius * math.sin(angle), z))
    def outer(level, index):
        return level * segments * 2 + index % segments
    def inner(level, index):
        return level * segments * 2 + segments + index % segments
    faces = []
    for level in range(levels - 1):
        for index in range(segments):
            nxt = (index + 1) % segments
            faces.append((outer(level,index),outer(level,nxt),outer(level+1,nxt),outer(level+1,index)))
            faces.append((inner(level,index),inner(level+1,index),inner(level+1,nxt),inner(level,nxt)))
    for index in range(segments):
        nxt = (index + 1) % segments
        faces.append((outer(0,index),inner(0,index),inner(0,nxt),outer(0,nxt)))
        faces.append((outer(levels-1,index),outer(levels-1,nxt),inner(levels-1,nxt),inner(levels-1,index)))
    edges = edge_use_counts(faces)
    metadata = {"vertices":len(vertices),"quads":len(faces),"triangles":len(faces)*2,
                "components":_components(vertices,faces),
                "open_boundary_edges":sum(count==1 for count in edges.values()),
                "nonmanifold_edges":sum(count!=2 for count in edges.values()),
                "bore_radius_m":bore,"bore_clearance_m":bore-shaft_radius_m,
                "shaft_intersection":bore<shaft_radius_m}
    return vertices,faces,metadata
