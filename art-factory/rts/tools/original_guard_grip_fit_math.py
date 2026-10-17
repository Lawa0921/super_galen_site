"""Rigid placement and narrow-phase mesh intersection helpers (metres)."""
import math
import numpy as np


def _unit(value):
    vector = np.asarray(value, dtype=np.float64)
    length = np.linalg.norm(vector)
    if length < 1e-12:
        raise ValueError("Zero-length axis")
    return vector / length


def _skew(vector):
    x, y, z = vector
    return np.array([[0., -z, y], [z, 0., -x], [-y, x, 0.]])


def rigid_fit(source_origin, source_axis, target_origin, scale, spin_radians):
    """Return proper rotation and translation mapping the channel to the sword."""
    if scale <= 0:
        raise ValueError("Scale must be positive")
    axis = _unit(source_axis)
    target = np.array([0., 0., 1.])
    cross = np.cross(axis, target)
    sine = np.linalg.norm(cross)
    cosine = float(np.dot(axis, target))
    if sine < 1e-12:
        align = np.eye(3) if cosine > 0 else np.diag([1., -1., -1.])
    else:
        k = _skew(cross / sine)
        align = np.eye(3) + sine * k + (1. - cosine) * (k @ k)
    c, s = math.cos(spin_radians), math.sin(spin_radians)
    spin = np.array([[c, -s, 0.], [s, c, 0.], [0., 0., 1.]])
    rotation = spin @ align
    translation = np.asarray(target_origin, dtype=np.float64) - scale * rotation @ np.asarray(source_origin, dtype=np.float64)
    return rotation, translation


def transform_points(points, rotation, translation, scale):
    return scale * np.asarray(points, dtype=np.float64) @ np.asarray(rotation).T + np.asarray(translation)


def segment_triangle_hit(start, end, triangle, eps=1e-10):
    """Möller–Trumbore crossing, including boundary contact within eps."""
    p = np.asarray(start, dtype=np.float64)
    d = np.asarray(end, dtype=np.float64) - p
    a, b, c = np.asarray(triangle, dtype=np.float64)
    e1, e2 = b - a, c - a
    h = np.cross(d, e2)
    det = float(np.dot(e1, h))
    if abs(det) < eps:
        return False
    inv = 1. / det
    s = p - a
    u = inv * np.dot(s, h)
    if u < -eps or u > 1. + eps:
        return False
    q = np.cross(s, e1)
    v = inv * np.dot(d, q)
    if v < -eps or u + v > 1. + eps:
        return False
    t = inv * np.dot(e2, q)
    return -eps <= t <= 1. + eps


def triangles_cross(first, second):
    """Confirm BVH candidate using both triangles' three edges."""
    a, b = np.asarray(first), np.asarray(second)
    return any(segment_triangle_hit(a[i], a[(i + 1) % 3], b) for i in range(3)) or any(
        segment_triangle_hit(b[i], b[(i + 1) % 3], a) for i in range(3)
    )


def fit_verdict(crossings, contained, fingers, guard_gap, pommel_gap):
    """Keep the stated clearance gate explicit and fail closed on missing evidence."""
    conditions = {
        "zero_exact_crossings": crossings == 0,
        "zero_sword_vertices_contained": contained == 0,
        "four_contact_zones": len(fingers) == 4 and all(
            finger.get("closest_gap_m") is not None
            and .0003 <= finger["closest_gap_m"] <= .0008
            and finger.get("samples_within_0p8mm", 0) >= 2 for finger in fingers
        ),
        "guard_clear": guard_gap is not None and guard_gap > 0,
        "pommel_clear": pommel_gap is not None and pommel_gap > 0,
    }
    return {"pass": all(conditions.values()), "checks": conditions}


def axis_local_finger_side(point, axis_origin, axis_direction):
    """Measure azimuth from source +X, the original glove's four-finger side."""
    axis = _unit(axis_direction)
    basis_x = np.array([1., 0., 0.])
    basis_x -= axis * np.dot(basis_x, axis)
    if np.linalg.norm(basis_x) < 1e-9:
        basis_x = np.array([0., 1., 0.])
        basis_x -= axis * np.dot(basis_x, axis)
    basis_x = _unit(basis_x)
    basis_y = np.cross(axis, basis_x)
    delta = np.asarray(point, dtype=np.float64) - np.asarray(axis_origin, dtype=np.float64)
    radial = delta - axis * np.dot(delta, axis)
    finger_offset = float(np.dot(radial, basis_x))
    side_offset = float(np.dot(radial, basis_y))
    return {"radius_m": float(np.linalg.norm(radial)),
            "finger_side_offset_m": finger_offset,
            "azimuth_degrees": float(math.degrees(math.atan2(side_offset, finger_offset))),
            "finger_side": finger_offset > 0.}


def finger_side_fit_verdict(zones):
    """Require two distinct sampled hits in the correct half-space per zone."""
    checks = []
    for zone in zones:
        samples = zone.get("finger_side_samples", [])
        ids = [sample.get("sample_id") for sample in samples]
        checks.append(len(samples) >= 2 and None not in ids and len(set(ids)) == len(ids) and all(
            sample.get("finger_side") is True
            and sample.get("finger_side_offset_m", 0.) > 0.
            and .0003 <= sample.get("gap_m", -1.) <= .0008 for sample in samples
        ))
    return {"pass": len(zones) == 4 and all(checks), "zone_pass": checks}
