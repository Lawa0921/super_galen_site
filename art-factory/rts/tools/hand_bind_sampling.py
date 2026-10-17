"""Retain measured extrema when approximating a location curve with linear keys."""
import numpy as np


def adaptive_linear_keys(times, values, tolerance):
    times = np.asarray(times, float)
    values = np.asarray(values, float)
    if times.ndim != 1 or values.ndim != 2 or len(times) != len(values) or len(times) < 2:
        raise ValueError('Expected at least two times with vector values')
    if not np.isfinite(times).all() or not np.isfinite(values).all() or not np.isfinite(tolerance) or tolerance <= 0:
        raise ValueError('Inputs and positive tolerance must be finite')
    if np.any(np.diff(times) <= 0):
        raise ValueError('Key times must be strictly increasing')
    keys = {0, len(times) - 1}
    todo = [(0, len(times) - 1)]
    while todo:
        first, last = todo.pop()
        if last - first < 2:
            continue
        t = (times[first + 1:last] - times[first]) / (times[last] - times[first])
        expected = values[first] + t[:, None] * (values[last] - values[first])
        errors = np.linalg.norm(values[first + 1:last] - expected, axis=1)
        worst = int(np.argmax(errors))
        if errors[worst] > tolerance:
            middle = first + 1 + worst
            keys.add(middle)
            todo.extend(((first, middle), (middle, last)))
    return sorted(keys)
