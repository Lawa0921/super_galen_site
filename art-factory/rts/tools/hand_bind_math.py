"""Canonical rigid hand bind representation; no contact or pose fitting."""
import numpy as np


def canonical_hand_binding(points, old_rest, old_pose, actual_wrist):
    points, rest, pose, wrist = (np.asarray(value, dtype=float) for value in (points, old_rest, old_pose, actual_wrist))
    if points.ndim != 2 or points.shape[1] != 3 or rest.shape != (4, 4) or pose.shape != (4, 4) or wrist.shape != (3,):
        raise ValueError('Unexpected canonical hand input shape')
    if not all(np.isfinite(value).all() for value in (points, rest, pose, wrist)):
        raise ValueError('Canonical hand inputs must be finite')
    for matrix in (rest, pose):
        if not np.allclose(matrix[3], [0, 0, 0, 1], atol=1e-7) or not np.allclose(matrix[:3, :3].T @ matrix[:3, :3], np.eye(3), atol=1e-5) or not np.isclose(np.linalg.det(matrix[:3, :3]), 1., atol=1e-5):
            raise ValueError('Canonical hand requires proper rigid rest and pose matrices')
    delta = rest[:3, 3] - wrist
    inverse_shift = np.eye(4)
    inverse_shift[:3, 3] = -delta
    new_pose = pose @ np.linalg.inv(rest) @ inverse_shift @ rest
    return points + delta, new_pose
