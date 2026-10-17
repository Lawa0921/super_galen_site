"""Original armor flexor frames; diagnostic until whole-character approval.

The authored plates use +Y as their inner elbow. Preserve three measured joint
positions while resolving the two otherwise unconstrained long-axis rolls.
This does not solve IK, alter lengths, move a weapon, or authorize a new clip.
"""
import numpy as np


def _unit(value):
    length = np.linalg.norm(value)
    if not np.isfinite(length) or length < 1e-8:
        raise ValueError('A finite nondegenerate elbow plane is required')
    return value / length


def _frame(axis, front):
    axis = _unit(axis)
    front = _unit(front - np.dot(front, axis) * axis)
    return np.column_stack((np.cross(axis, front), axis, front))


def hinge_skin_matrices(rest, posed):
    """Return Upper/Fore rigid skin matrices in the same world coordinate frame.

    A collinear arm has no unique flexor plane and is rejected explicitly.
    Callers must not silently carry this construction across a straight-arm
    singularity or stretch the rest cage to fit a different skeleton.
    """
    rest, posed = np.asarray(rest, float), np.asarray(posed, float)
    if rest.shape != (3, 3) or posed.shape != (3, 3) or not np.isfinite(rest).all() or not np.isfinite(posed).all():
        raise ValueError('Three finite shoulder/elbow/wrist positions required')
    rest_axes, axes = np.diff(rest, axis=0), np.diff(posed, axis=0)
    rest_lengths, lengths = np.linalg.norm(rest_axes, axis=1), np.linalg.norm(axes, axis=1)
    if (rest_lengths < 1e-8).any() or (lengths < 1e-8).any():
        raise ValueError('Nonzero limb lengths required')
    if np.max(abs(rest_lengths - lengths)) > 1e-6:
        raise ValueError('Joint lengths differ from the frozen rest skeleton')
    upper, fore = (_unit(a) for a in axes)
    cosine = np.dot(upper, fore)
    inner = (fore - cosine * upper, -upper + cosine * fore)
    result = []
    for index in range(2):
        rotation = _frame(axes[index], inner[index]) @ _frame(rest_axes[index], np.array([0., 1., 0.])).T
        skin = np.eye(4)
        skin[:3, :3] = rotation
        skin[:3, 3] = posed[index] - rotation @ rest[index]
        result.append(skin)
    return tuple(result)
