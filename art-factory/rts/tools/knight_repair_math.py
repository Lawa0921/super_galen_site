"""Pure math gates used by the mounted Knight repair script."""


def ground_lift(lowest_z, clearance=0.005):
    """Return the minimum upward correction needed to keep a pose above ground."""
    return max(0.0, float(clearance) - float(lowest_z))


def grip_delta(hand_center, grip_center):
    """Return bind-space translation that moves a rigid grip onto a hand."""
    return tuple(float(hand_center[i]) - float(grip_center[i]) for i in range(3))


def corrected_floor(samples, clearance=0.005):
    """Convert sampled lowest-Z values into per-frame root corrections."""
    return {frame: ground_lift(lowest, clearance) for frame, lowest in samples.items()}
