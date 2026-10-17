"""Pure data contract for the second mounted Knight repair pass."""


def seated_pose_offsets():
    """Local XYZ degrees that place bent knees over the two stirrups."""
    return {
        "Thigh_L": (-15.0, 0.0, 25.0),
        "Thigh_R": (-15.0, 0.0, -25.0),
        "Shin_L": (45.0, -38.0, 0.0),
        "Shin_R": (45.0, 38.0, 0.0),
    }


def death_profile():
    return {
        "horse_roll_end_deg": -76.0,
        "rider_roll_end_deg": -76.0,
        "floor_clearance_m": 0.005,
    }


def saddle_profile():
    """Compact dimensions for the authored side flap around the seat."""
    return {
        "x_scale": 0.80,
        "y_scale": 0.40,
        "z_scale": 0.38,
        "bottom_lift_m": 0.025,
    }


def closed_grip_profile():
    """Readable finger count and a small leather-to-shaft clearance."""
    return {
        "finger_count": 4,
        "thumb_count": 1,
        "max_shaft_gap_m": 0.008,
        "finger_radius_m": 0.013,
        "tube_sides": 10,
    }


def lance_profile():
    """Reduce the source lance's oversized shaft while preserving its tip."""
    return {
        "length_scale": 0.76,
        "cross_section_scale": 0.62,
    }


def seat_contact_profile():
    return {"max_boot_stirrup_gap_m": 0.10}
