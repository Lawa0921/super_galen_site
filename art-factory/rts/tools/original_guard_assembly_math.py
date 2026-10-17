"""Pure contract and measurable assembly gates for the original guard."""
import math

from original_guard_motion_spec import (
    ATTACK_CONTACT_S,
    CLIP_DURATIONS_S,
    JOG_CYCLE_S,
    JOG_STRIDE_M,
)


def motion_extras():
    return {
        "version": 1,
        "locomotion": {
            "clip": "Walk",
            "strideMeters": JOG_STRIDE_M,
            "cycleSeconds": JOG_CYCLE_S,
        },
        "attack": {
            "clip": "Attack",
            "durationSeconds": CLIP_DURATIONS_S["Attack"],
            "contactSeconds": ATTACK_CONTACT_S,
        },
    }



def primary_bone_for_point(x, z, y=0.0):
    """Rigid segment assignment keeps fused source armor from shearing across joints."""
    # The source body has had both arm ROIs removed. Never route body vertices
    # to arm/hand bones: outer hip/fauld surfaces share the same |x| range.
    if 0.68 <= z < 1.05 and (abs(y) > 0.055 or abs(x) > 0.17):
        return "Pelvis"
    side = "L" if x < 0 else "R"
    if z < 0.14:
        return f"Foot_{side}"
    if z < 0.408:
        return f"Shin_{side}"
    if z < 0.74:
        return f"Thigh_{side}"
    if z < 0.78:
        return "Pelvis"
    if z < 1.149:
        return "SpineLower"
    if z < 1.442:
        return "SpineUpper"
    if z < 1.618:
        return "Neck"
    return "Head"


def old_arm_residual_face(x, y, z):
    """Source limb shell beyond the accepted replacement-arm envelope."""
    return 0.78 <= z <= 1.13 and 0.34 <= abs(x) <= 0.50 and y <= -0.045


def replaced_front_tabard_face(x, y, z):
    """Front source surface covered by the separately authored tabard."""
    return 0.48 <= z <= 1.055 and abs(x) < 0.145 and y > 0.105


def replace_source_leg_shell_face(x, y, z):
    """Remove the fused source leg shell under the fitted liner and control-surface armor."""
    in_leg_band = 0.13 <= z <= 0.74 and 0.07 <= abs(x) <= 0.34
    source_fauld = 0.33 <= z <= 0.52 and y < -0.04 and abs(x) >= 0.17
    return in_leg_band and not source_fauld


def shoulder_cut_fragment_face(x, y, z):
    """Remove anterior shoulder spikes while preserving the center neck and chest."""
    return 0.17 <= abs(x) <= 0.29 and y >= 0.035 and 1.38 <= z <= 1.61


def boot_heading_yaw_degrees(side):
    """Rotate each source boot around its measured cuff center toward authored +Y."""
    if side == "R":
        return 162.4
    if side == "L":
        return -162.5
    raise ValueError("boot side must be R or L")


def body_weights_for_point(x, z, y=0.0, normal_y=0.0):
    """Single-bone hard-plate binding with short inner-cloth joint blends."""
    side = "L" if x < 0 else "R"
    # Narrow front-center source remnant under the replacement tabard must
    # follow the pelvis, never split across the left/right thigh seam.
    if 0.48 <= z <= 0.62 and abs(x) <= 0.025 and y >= 0.19:
        return {"Pelvis": 1.0}
    # Side/rear faulds are authored source panels. Keep them on the pelvis so
    # a lifted thigh cannot drag the opposite half of the same skirt surface.
    if 0.33 <= z <= 0.52 and y < -0.04 and abs(x) >= 0.17:
        return {"Pelvis": 1.0}
    # The authored front kneecap is a separate rigid surface region. Keep its
    # positive-Y-facing shell on the thigh; only the softer inset/rear layer bends.
    if 0.34 <= z <= 0.48 and 0.08 <= abs(x) <= 0.34 and y >= 0.035 and normal_y >= 0.25:
        return {f"Thigh_{side}": 1.0}
    if 0.36 <= z <= 0.46 and abs(y) <= 0.11:
        t = min(1.0, max(0.0, (z - 0.36) / 0.10))
        return {f"Thigh_{side}": 1.0 - t, f"Shin_{side}": t}
    if 0.12 <= z <= 0.20 and abs(y) <= 0.10:
        t = min(1.0, max(0.0, (z - 0.12) / 0.08))
        return {f"Foot_{side}": 1.0 - t, f"Shin_{side}": t}
    if 0.66 <= z <= 0.78 and abs(y) <= 0.055 and abs(x) <= 0.17:
        t = min(1.0, max(0.0, (z - 0.66) / 0.12))
        return {f"Thigh_{side}": 1.0 - t, "Pelvis": t}
    return {primary_bone_for_point(x, z, y): 1.0}


def leg_armor_patch_for_face(x, y, z, normal_y):
    """Split source hard-armor faces by leg segment; remove torn joint-band scraps."""
    side = "L" if x < 0 else "R"
    if not (0.13 <= z <= 0.76 and 0.075 <= abs(x) <= 0.32):
        return None
    if 0.33 <= z <= 0.52 and y < -0.04 and abs(x) >= 0.17:
        return None
    if 0.34 <= z <= 0.48 and 0.08 <= abs(x) <= 0.34 and y >= 0.035 and normal_y >= 0.25:
        return "knee_cap", side
    if z >= 0.46:
        return "thigh_armor", side
    if z <= 0.36:
        return "shin_armor", side
    if 0.36 < z < 0.46:
        return "joint_liner", side
    return None


def rigid_leg_armor_bone(region, side):
    if side not in ("R", "L"):
        raise ValueError("leg armor side must be R or L")
    if region in ("thigh_armor", "shin_armor"):
        return "{}_{}".format("Thigh" if region == "thigh_armor" else "Shin", side)
    if region == "knee_cap":
        return "KneeSupport_{}".format(side)
    raise ValueError("unknown leg armor region: {}".format(region))


def fit_leg_profile_radii(points, center, axis, side_dir, front_dir, bins=16, band_m=0.035,
                           min_radius_m=0.045, max_radius_m=0.16):
    """Fit a closed angular radius profile from source mesh points near one station."""
    if bins < 4 or band_m <= 0 or min_radius_m <= 0 or max_radius_m <= min_radius_m:
        raise ValueError("invalid leg profile fit settings")
    center = tuple(float(value) for value in center)
    axis = tuple(float(value) for value in axis)
    side_dir = tuple(float(value) for value in side_dir)
    front_dir = tuple(float(value) for value in front_dir)
    profile = [None] * bins
    for point in points:
        point = tuple(float(value) for value in point)
        delta = tuple(point[i] - center[i] for i in range(3))
        along = sum(delta[i] * axis[i] for i in range(3))
        if abs(along) > band_m:
            continue
        side = sum(delta[i] * side_dir[i] for i in range(3))
        front = sum(delta[i] * front_dir[i] for i in range(3))
        radius = math.hypot(side, front)
        if not min_radius_m <= radius <= max_radius_m:
            continue
        angle = math.atan2(front, side) % (2 * math.pi)
        index = int(angle * bins / (2 * math.pi)) % bins
        if profile[index] is None or radius > profile[index]:
            profile[index] = radius
    known = [i for i, radius in enumerate(profile) if radius is not None]
    if not known:
        raise ValueError("source has no leg cross-section points at this station")
    for index in range(bins):
        if profile[index] is not None:
            continue
        left = next((index - step) % bins for step in range(1, bins + 1)
                    if profile[(index - step) % bins] is not None)
        right = next((index + step) % bins for step in range(1, bins + 1)
                     if profile[(index + step) % bins] is not None)
        left_distance = (index - left) % bins
        right_distance = (right - index) % bins
        blend = left_distance / max(1, left_distance + right_distance)
        profile[index] = profile[left] * (1.0 - blend) + profile[right] * blend
    for _ in range(3):
        profile = [
            0.25 * profile[(index - 1) % bins] + 0.50 * profile[index]
            + 0.25 * profile[(index + 1) % bins]
            for index in range(bins)
        ]
    return [min(max_radius_m, max(min_radius_m, float(radius))) for radius in profile]


def tabard_drape_fraction(clip, normalized_time):
    """Maximum counter-rotation toward gravity for the lower tabard control."""
    if clip == "Idle":
        return 0.0
    if clip == "Walk":
        return 0.08
    if clip == "Attack":
        return 0.08
    if clip == "Hurt":
        return 0.20
    if clip != "Death":
        raise ValueError(f"unknown guard clip for tabard drape: {clip}")
    t = min(1.0, max(0.0, float(normalized_time)))
    u = min(1.0, max(0.0, (t - 0.20) / 0.62))
    smooth = u * u * (3.0 - 2.0 * u)
    return 0.85 * smooth


def inner_layer_weights_for_point(x, z, y=0.0):
    """Leg-following source-derived padded layer, independent of fauld binding."""
    side = "L" if x < 0 else "R"
    if 0.36 <= z <= 0.46 and abs(y) <= 0.12:
        t = min(1.0, max(0.0, (z - 0.36) / 0.10))
        return {f"Thigh_{side}": 1.0 - t, f"Shin_{side}": t}
    if 0.12 <= z <= 0.20 and abs(y) <= 0.11:
        t = min(1.0, max(0.0, (z - 0.12) / 0.08))
        return {f"Foot_{side}": 1.0 - t, f"Shin_{side}": t}
    if z >= 0.4081:
        return {f"Thigh_{side}": 1.0}
    if z >= 0.1349:
        return {f"Shin_{side}": 1.0}
    return {f"Foot_{side}": 1.0}


def validate_contact_metrics(metrics):
    required = (
        "blade_reach_m",
        "blade_target_distance_m",
        "blade_speed_mps",
        "left_foot_lift_m",
        "right_foot_lift_m",
    )
    missing = [key for key in required if key not in metrics]
    if missing:
        raise ValueError(f"contact metrics missing: {', '.join(missing)}")
    reach = float(metrics["blade_reach_m"])
    target_distance = float(metrics["blade_target_distance_m"])
    speed = float(metrics["blade_speed_mps"])
    left = float(metrics["left_foot_lift_m"])
    right = float(metrics["right_foot_lift_m"])
    values = (reach, target_distance, speed, left, right)
    if not all(math.isfinite(value) for value in values):
        raise ValueError("contact metrics must be finite")
    if reach < 0.55:
        raise ValueError(f"measured blade reach too short: {reach:.3f}m")
    if target_distance > 0.035:
        raise ValueError(
            f"blade missed target contact volume: surface gap={target_distance:.3f}m"
        )
    if speed < 3.0:
        raise ValueError(f"blade contact speed too low: {speed:.3f}m/s")
    if max(left, right) > 0.02:
        raise ValueError(f"attack feet are not planted: lifts={left:.3f},{right:.3f}m")
    return {
        "passed": True,
        "blade_reach_m": reach,
        "blade_target_distance_m": target_distance,
        "target_gap_limit_m": 0.035,
        "blade_speed_mps": speed,
        "foot_lift_m": {"L": left, "R": right},
    }


def validate_source_bounds(bounds):
    height = float(bounds.get("height_m", 0))
    torso_width = float(bounds.get("torso_width_m", 0))
    leg_height = float(bounds.get("leg_height_m", 0))
    if not 1.55 <= height <= 2.25:
        raise ValueError(f"height outside full-body scale: {height:.3f}m")
    if not 0.34 <= torso_width <= 0.78:
        raise ValueError(f"torso width outside human armored silhouette: {torso_width:.3f}m")
    if not 0.52 <= leg_height <= 0.86:
        raise ValueError(f"leg coverage gate failed: {leg_height:.3f}m")
    return {
        "passed": True,
        "height_m": height,
        "torso_width_m": torso_width,
        "leg_height_m": leg_height,
    }
