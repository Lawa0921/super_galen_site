"""Blender-free timing and foot-trajectory contract for the guard rebuild."""

from dataclasses import dataclass
import math


JOG_SPEED_MPS = 3.0
JOG_CYCLE_S = 2.0 / 3.0
JOG_STRIDE_M = 2.0
JOG_STANCE_S = 0.2
JOG_CONTACT_TRAVEL_M = JOG_SPEED_MPS * JOG_STANCE_S
JOG_LIFT_M = 0.14

ATTACK_DURATION_S = 1.2
ATTACK_CONTACT_S = 16.0 / 30.0
CLIP_DURATIONS_S = {
    "Idle": 2.4,
    "Walk": JOG_CYCLE_S,
    "Attack": ATTACK_DURATION_S,
    "Hurt": 0.5,
    "Death": 1.6,
}


@dataclass(frozen=True)
class FootSample:
    forward_m: float
    lift_m: float
    stance: bool
    stance_phase: float
    pitch_deg: float


def guarded_jog_foot(time_s: float, side: str) -> FootSample:
    """Return an in-place foot target whose stance cancels 3 m/s translation.

    The left and right feet share one original procedural curve with a half-cycle
    phase offset. During stance, the target moves backward at exactly the runtime
    translation speed; during swing, a quintic return avoids a loop pop.
    """

    if side not in {"L", "R"}:
        raise ValueError(f"side must be 'L' or 'R', got {side!r}")
    phase = (time_s / JOG_CYCLE_S + (0.5 if side == "R" else 0.0)) % 1.0
    stance_fraction = JOG_STANCE_S / JOG_CYCLE_S
    half_travel = JOG_CONTACT_TRAVEL_M / 2.0
    if phase <= stance_fraction:
        stance_phase = phase / stance_fraction
        forward = half_travel - JOG_CONTACT_TRAVEL_M * stance_phase
        return FootSample(forward, 0.0, True, stance_phase, 0.0)

    swing_phase = (phase - stance_fraction) / (1.0 - stance_fraction)
    eased = swing_phase**3 * (swing_phase * (swing_phase * 6.0 - 15.0) + 10.0)
    forward = -half_travel + JOG_CONTACT_TRAVEL_M * eased
    lift = JOG_LIFT_M * math.sin(math.pi * swing_phase)
    pitch = -12.0 + 22.0 * eased
    return FootSample(forward, lift, False, swing_phase, pitch)
