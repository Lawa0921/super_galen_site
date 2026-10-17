"""Add sampled skeletal envelopes without changing geometry or old animations."""
from copy import deepcopy
import math


def validate_sample_times(clip):
    times = clip['sampleTimesSeconds']; duration = clip['durationSeconds']
    if (not math.isfinite(duration) or duration <= 0 or len(times) != clip['sampleCount'] or len(times) < 2
            or not all(math.isfinite(t) for t in times) or abs(times[0]) > 1e-7 or abs(times[-1] - duration) > 1e-7
            or any(b <= a or b - a > 1/60 + 1e-7 for a, b in zip(times, times[1:]))
            or not all(clip[k] for k in ('allKeyTimesCovered', 'includesStart', 'includesEnd'))):
        raise ValueError('Incomplete/non-monotonic 60 Hz clip sampling')


def _sphere(value):
    center = value.get('sphere_center_y_up_m', [])
    radius = value.get('sphere_radius_m')
    if (len(center) != 3 or not all(isinstance(n, (int, float)) and math.isfinite(n) for n in center)
            or not isinstance(radius, (int, float)) or not math.isfinite(radius) or radius <= 0):
        raise ValueError('Invalid sampled/previous bounds sphere')
    return list(center), radius


def update_bounds(doc, rows, margin=.05):
    if not math.isfinite(margin) or margin < .025:
        raise ValueError('Sampling requires at least 25 mm conservative margin')
    expected = {i for i, n in enumerate(doc['nodes']) if 'mesh' in n and 'skin' in n}
    indices = [r['nodeIndex'] for r in rows]
    if len(indices) != len(set(indices)) or set(indices) != expected:
        raise ValueError('Samples must cover every skinned node exactly once')
    result = deepcopy(doc)
    for row in rows:
        node = result['nodes'][row['nodeIndex']]
        if node.get('name', '') != row['nodeName']:
            raise ValueError('Sample belongs to a different node')
        center, radius = _sphere(row['sampledAabbSphere']); radius += margin
        extras = node.setdefault('extras', {})
        previous = extras.get('rtsConservativeBounds', {})
        if previous:
            old_center, old_radius = _sphere(previous)
            distance = math.dist(center, old_center)
            if old_radius >= distance + radius:
                center, radius = old_center, old_radius
            elif radius < distance + old_radius:
                union_radius = (distance + old_radius + radius) / 2
                center = [a + (b - a) * (union_radius - old_radius) / distance for a, b in zip(old_center, center)]
                radius = union_radius
        extras['rtsConservativeBounds'] = {**previous, 'sphere_center_y_up_m': center,
                                           'sphere_radius_m': radius,
                                           'sample_hz': 60, 'sampling_margin_m': margin}
    return result
