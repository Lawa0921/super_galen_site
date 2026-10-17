"""Write an exact sampled FCurve without nearby-key insertion replacement."""
import math


def replace_linear_curve(curve, times, values):
    times, values = list(times), list(values)
    if len(times) != len(values) or len(times) < 2:
        raise ValueError('At least two time/value pairs are required')
    if not all(math.isfinite(float(v)) for v in times + values):
        raise ValueError('Curve samples must be finite')
    if any(b <= a for a, b in zip(times, times[1:])):
        raise ValueError('Curve times must be strictly increasing')
    if curve.modifiers:
        raise ValueError('Sampled curve cannot retain unverified modifiers')
    curve.keyframe_points.clear()
    curve.keyframe_points.add(len(times))
    curve.keyframe_points.foreach_set('co', [v for pair in zip(times, values) for v in pair])
    for key in curve.keyframe_points:
        key.interpolation = 'LINEAR'
    # FCurve.update() also deduplicates keys using Blender's proximity rule.
    # The samples are already strictly ordered; only sort/recalculate handles.
    curve.keyframe_points.sort()
    curve.keyframe_points.handles_recalc()
    curve.id_data.update_tag()
    if len(curve.keyframe_points) != len(times):
        raise ValueError('Blender changed the explicit key count')
    if any(abs(k.co.x - t) > 1e-6 or abs(k.co.y - v) > max(1e-6, abs(v) * 1e-6) for k, t, v in zip(curve.keyframe_points, times, values)):
        raise ValueError('Blender changed an explicit key time/value')
