"""Explicit bounded armor roll, separate from protected skeletal animation.

Angles are radians; time is in source frames. The original bone rotation is
the reference. The raw anatomical frame remains the geometric baseline, and
only its signed long-axis roll is replaced inside the declared window.
"""
import numpy as np

from original_guard_arm_hinge import rotation
from original_guard_articulated_armor import unit


def signed_twist(raw_rotation, original_rotation, axis):
    relative = np.asarray(raw_rotation) @ np.asarray(original_rotation).T
    vee = np.array([relative[2, 1]-relative[1, 2], relative[0, 2]-relative[2, 0], relative[1, 0]-relative[0, 1]])
    sine = .5*np.dot(unit(axis), vee)
    cosine = np.clip((np.trace(relative)-1)/2, -1., 1.)
    return float(np.arctan2(sine, cosine))


class TwistWindow:
    def __init__(self, times, unwrapped_angles, start, end):
        self.times = np.asarray(times, float)
        self.angles = np.asarray(unwrapped_angles, float)
        if (self.times.ndim != 1 or len(self.times) < 4 or self.angles.shape != (len(self.times), 2)
                or not np.isfinite(self.times).all() or not np.isfinite(self.angles).all()
                or not np.all(np.diff(self.times) > 0) or not self.times[0] < start < end < self.times[-1]):
            raise ValueError('Finite increasing samples and an interior two-channel window required')
        indices = [np.flatnonzero(self.times == t) for t in (start, end)]
        if any(len(i) != 1 for i in indices):
            raise ValueError('Window endpoints must be explicit sampled frames')
        i0, i1 = [int(i[0]) for i in indices]
        self.start, self.end = float(start), float(end)
        self.values = self.angles[[i0, i1]].copy()
        self.slopes = np.array([(self.angles[i+1]-self.angles[i-1])/(self.times[i+1]-self.times[i-1]) for i in (i0, i1)])

    def target(self, time):
        if not np.isfinite(time) or not self.start <= time <= self.end:
            raise ValueError('Hermite target is defined only inside the authoring window')
        length = self.end-self.start
        u = (time-self.start)/length
        return ((2*u**3-3*u*u+1)*self.values[0]+(u**3-2*u*u+u)*length*self.slopes[0]
                +(-2*u**3+3*u*u)*self.values[1]+(u**3-u*u)*length*self.slopes[1])

    def correction(self, time, principal_raw):
        raw = np.asarray(principal_raw, float)
        if not np.isfinite(time) or raw.shape != (2,) or not np.isfinite(raw).all():
            raise ValueError('Finite time and two raw angles required')
        if not self.start < time < self.end:
            return np.zeros(2)
        reference = np.array([np.interp(time, self.times, self.angles[:, i]) for i in range(2)])
        branch = raw+np.round((reference-raw)/(2*np.pi))*2*np.pi
        return self.target(time)-branch

    def record(self):
        return {'window_frames': [self.start, self.end], 'endpoint_angles_rad': self.values.tolist(),
                'endpoint_slopes_rad_per_frame': self.slopes.tolist(), 'endpoint_policy': 'central difference of frozen 1/8-frame source samples',
                'couter_policy': 'mean of Upper/Fore roll corrections around posed normalized bisector'}


def correct_module_skins(rest, posed, raw_skins, corrections):
    rest, posed = np.asarray(rest), np.asarray(posed)
    result = np.array(raw_skins, float, copy=True)
    corrections = np.asarray(corrections, float)
    if result.shape != (3, 4, 4) or corrections.shape != (2,) or not np.isfinite(corrections).all():
        raise ValueError('Three skin matrices and two finite roll corrections required')
    axes = np.array([unit(v) for v in np.diff(posed, axis=0)])
    directions = [*axes, unit(axes.sum(axis=0))]
    for i, (axis, angle, anchor) in enumerate(zip(directions, [*corrections, np.mean(corrections)], (0, 1, 1))):
        r = rotation(axis, np.rad2deg(angle)) @ result[i, :3, :3]
        result[i, :3, :3], result[i, :3, 3] = r, posed[anchor]-r @ rest[anchor]
    return result
