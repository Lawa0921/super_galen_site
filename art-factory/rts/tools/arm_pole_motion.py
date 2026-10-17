"""Bounded authoring controls for a measured two-link elbow pole trajectory."""
import numpy as np


def sample_derivative(sample, index, step, last_index, side='centered'):
    """Second-order finite differences with explicit bounded endpoints."""
    if last_index < 2 or index < 0 or index > last_index or not np.isfinite(step) or step <= 0:
        raise ValueError('At least three bounded samples and a positive finite step required')
    if side not in ('centered', 'forward', 'backward'):
        raise ValueError('Explicit centered/forward/backward derivative required')
    if side == 'forward' and index+2 > last_index or side == 'backward' and index < 2:
        raise ValueError('Requested derivative side exceeds the sample domain')
    if side == 'forward' or index == 0:
        return (-3*np.asarray(sample(index))+4*np.asarray(sample(index+1))-np.asarray(sample(index+2)))/(2*step)
    if side == 'backward' or index == last_index:
        return (3*np.asarray(sample(index))-4*np.asarray(sample(index-1))+np.asarray(sample(index-2)))/(2*step)
    return (np.asarray(sample(index+1))-np.asarray(sample(index-1)))/(2*step)


def hermite_track(times, knots, values, derivatives):
    """A C1 authored vector curve with explicit per-frame key velocities."""
    times, knots, values, derivatives = map(lambda v: np.asarray(v, float), (times, knots, values, derivatives))
    if times.ndim != 1 or knots.ndim != 1 or len(knots) < 2 or values.ndim != 2 or values.shape[0] != len(knots) or derivatives.shape != values.shape:
        raise ValueError('Matching vector keys and derivative keys required')
    if any(not np.isfinite(v).all() for v in (times, knots, values, derivatives)) or (np.diff(knots) <= 0).any() or (times < knots[0]).any() or (times > knots[-1]).any():
        raise ValueError('Finite increasing knots and in-range sample times required')
    index = np.minimum(np.searchsorted(knots, times, side='right')-1, len(knots)-2)
    span = knots[index+1]-knots[index]
    u = ((times-knots[index])/span)[:, None]
    span = span[:, None]
    return ((2*u**3-3*u**2+1)*values[index] + (u**3-2*u**2+u)*span*derivatives[index]
            + (-2*u**3+3*u**2)*values[index+1] + (u**3-u**2)*span*derivatives[index+1])


def _unit(value):
    length = np.linalg.norm(value)
    if not np.isfinite(length) or length < 1e-10:
        raise ValueError('Finite nonzero direction required')
    return value/length


def transport_pole_basis(axes, seed):
    """Rotation-minimizing basis; rejects an ambiguous antipodal axis step."""
    axes = np.asarray(axes, float)
    if axes.ndim != 2 or axes.shape[1] != 3 or not len(axes) or not np.isfinite(axes).all():
        raise ValueError('Finite ordered reach axes required')
    axes = np.asarray([_unit(a) for a in axes])
    seed = np.asarray(seed, float)
    first = [_unit(seed-np.dot(seed, axes[0])*axes[0])]
    for before, after in zip(axes, axes[1:]):
        cosine = np.clip(np.dot(before, after), -1., 1.)
        if cosine < -1+1e-8:
            raise ValueError('Antipodal reach axes need an explicit intermediate pose')
        cross = np.cross(before, after)
        current = first[-1]
        moved = current + np.cross(cross, current) + np.cross(cross, np.cross(cross, current))/(1+cosine)
        first.append(_unit(moved-np.dot(moved, after)*after))
    first = np.asarray(first)
    return first, np.cross(axes, first)


def pole_direction_track(times, axes, start_pole, end_pole, derivatives):
    """Author the signed pole angle in a rotation-minimizing reach frame.

    Linear Cartesian poles can pass close to the reach axis and accelerate
    the elbow even when their coordinates are smooth. Unit angular authoring
    has no such radial collapse. An exactly opposite endpoint is ambiguous
    and needs an explicit intermediate design instead of a hidden turn choice.
    """
    times = np.asarray(times, float)
    first, second = transport_pole_basis(axes, start_pole)
    end = np.array([np.dot(end_pole, first[-1]), np.dot(end_pole, second[-1])])
    end = _unit(end)
    angle = np.arctan2(end[1], end[0])
    if abs(abs(angle)-np.pi) < 1e-8:
        raise ValueError('A half-turn pole needs an explicit intermediate direction')
    angles = hermite_track(times, [times[0], times[-1]], [[0.], [angle]], np.asarray(derivatives, float).reshape(2, 1))[:, 0]
    return np.cos(angles)[:, None]*first + np.sin(angles)[:, None]*second, angles


def replace_angle_span(times, angles, start, end, blend_frames=2.):
    """Replace only a declared unwrapped-angle span, with C2 boundary blending.

    The middle follows the explicit endpoint-to-endpoint angle progression.
    The quintic blend reaches zero value and first/second derivatives at both
    outer boundaries, preserving the source exactly outside the authoring ROI.
    No wrapping or automatic shortest-path decision is hidden in this helper.
    """
    times, angles = np.asarray(times, float), np.asarray(angles, float)
    if times.ndim != 1 or angles.shape != times.shape or len(times) < 2 or not np.isfinite(times).all() or not np.isfinite(angles).all() or (np.diff(times) <= 0).any():
        raise ValueError('Finite matching increasing times and unwrapped angles required')
    if not np.isfinite([start, end, blend_frames]).all() or not start < end or not 0 < blend_frames <= (end-start)/2:
        raise ValueError('Positive ordered span and bounded blend required')
    indices = [np.flatnonzero(np.isclose(times, t, rtol=0, atol=1e-10)) for t in (start, end)]
    if any(len(i) != 1 for i in indices):
        raise ValueError('Both boundaries must be explicit source samples')
    a, b = [i[0] for i in indices]
    progress = (times-start)/(end-start)
    authored = angles[a] + progress*(angles[b]-angles[a])
    def smootherstep(x):
        q = np.clip(x, 0., 1.)
        return q*q*q*(q*(q*6-15)+10)
    weight = smootherstep((times-start)/blend_frames)*smootherstep((end-times)/blend_frames)
    result = angles.copy()
    inside = (times > start) & (times < end)
    result[inside] += weight[inside]*(authored[inside]-angles[inside])
    return result
