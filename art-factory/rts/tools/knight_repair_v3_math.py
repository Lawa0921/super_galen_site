"""Pure contracts for the third mounted Knight repair pass.

These values describe measurements taken from evaluated geometry.  They are
kept separate from the Blender builder so the contact gates can be exercised
without opening Blender.
"""


def stirrup_contact_profile():
    return {
        "max_lateral_m": 0.020,
        "max_fore_aft_m": 0.020,
        "sole_to_pedal_min_m": 0.000,
        "sole_to_pedal_max_m": 0.010,
        "frame_clearance_m": 0.000,
    }


def lance_tip_profile():
    return {"min_overlap_m": 0.002, "max_overlap_m": 0.004, "max_gap_m": 0.000}


def saddle_profile():
    """Shorten the skirt around the seat without flattening its authored drop."""
    return {"x_scale": 0.72, "y_scale": 0.38, "z_scale": 0.96, "bottom_lift_m": 0.0}


def horse_head_profile():
    return {
        "mouth_start_y_m": 0.64,
        "mouth_end_y_m": 1.34,
        "mouth_start_z_m": 0.78,
        "neck_blend_m": 0.20,
    }


def mouth_fragment_profile():
    """Bounds for the disconnected lower-mouth reconstruction artifact.

    The limits come from the evaluated edge-connected components in both LODs.
    The authored jaw continues above ``max_z_m``; the dangling strip stays in
    this compact lower-mouth envelope.  Keeping the profile pure makes the
    selection rule testable without Blender.
    """
    return {
        "min_y_m": 0.78,
        "max_y_m": 1.18,
        "min_z_m": 1.08,
        "max_z_m": 1.40,
        "min_x_span_m": 0.08,
        "max_x_span_m": 0.20,
        "min_y_span_m": 0.18,
        "min_z_span_m": 0.16,
        "center_x_max_m": -0.20,
        "center_y_min_m": 0.90,
        "center_y_max_m": 1.05,
        "center_z_min_m": 1.18,
        "center_z_max_m": 1.30,
    }


def is_mouth_fragment_bounds(minimum, maximum):
    """Return whether a component bbox matches the dangling mouth strip."""
    profile = mouth_fragment_profile()
    spans = [maximum[i] - minimum[i] for i in range(3)]
    center = [(minimum[i] + maximum[i]) / 2.0 for i in range(3)]
    return (
        minimum[1] >= profile["min_y_m"] and maximum[1] <= profile["max_y_m"]
        and minimum[2] >= profile["min_z_m"] and maximum[2] <= profile["max_z_m"]
        and profile["min_x_span_m"] <= spans[0] <= profile["max_x_span_m"]
        and spans[1] >= profile["min_y_span_m"]
        and spans[2] >= profile["min_z_span_m"]
        and center[0] <= profile["center_x_max_m"]
        and profile["center_y_min_m"] <= center[1] <= profile["center_y_max_m"]
        and profile["center_z_min_m"] <= center[2] <= profile["center_z_max_m"]
    )


def select_bit_mouth_anchors(points, centers, min_y_m=0.70, max_y_m=1.08,
                             min_z_m=1.40, max_z_m=1.66, min_separation_m=0.03):
    """Pick distinct evaluated surface points at the actual bit/jaw corners.

    This deliberately excludes the lower fragment envelope and the old throat
    target.  It also avoids a global X-sign assumption because the imported
    horse head is asymmetrical in its authored frame.
    """
    eligible = [tuple(point) for point in points
                if min_y_m <= point[1] <= max_y_m
                and min_z_m <= point[2] <= max_z_m]
    selected = []
    for center in centers:
        candidates = [point for point in eligible
                      if all(sum((point[i] - used[i]) ** 2 for i in range(3)) ** 0.5 >= min_separation_m
                             for used in selected)]
        if not candidates:
            raise ValueError("not enough distinct evaluated bit-mouth anchors")
        selected.append(min(candidates,
                            key=lambda point: sum((point[i] - center[i]) ** 2 for i in range(3))))
    return selected


def select_distinct_mouth_anchors(points, centers, min_y_m=0.77, min_z_m=1.35,
                                  min_separation_m=0.03):
    """Pick separate high-jaw surface anchors for the authored mouth chunks.

    The imported head is asymmetric in world X, so a global left/right sign
    test can select a throat point.  Mouth anchors are instead constrained by
    the actual high-jaw Y/Z envelope and selected nearest-to-chunk-center,
    with a separation guard so both chunks cannot collapse onto one point.
    """
    # Keep the legacy contract available to existing QA callers while routing
    # new production attachment through the stricter bit-mouth envelope.
    eligible = [tuple(point) for point in points
                if point[1] > min_y_m and point[2] > min_z_m]
    selected = []
    for center in centers:
        candidates = [point for point in eligible
                      if all(sum((point[i] - used[i]) ** 2 for i in range(3)) ** 0.5 >= min_separation_m
                             for used in selected)]
        if not candidates:
            raise ValueError("not enough distinct evaluated mouth anchors")
        selected.append(min(candidates,
                            key=lambda point: sum((point[i] - center[i]) ** 2 for i in range(3))))
    return selected


def closed_grip_profile():
    return {"finger_count": 4, "thumb_count": 1, "max_surface_gap_m": 0.003}


def weapon_clearance_profile():
    """Geometry-only clearance policy for the Knight's mounted weapons."""
    return {
        "lance_body_cut_margin_m": 0.003,
        "shield_rotation_x_deg": 14.0,
        "shield_rotation_y_deg": 14.0,
        "shield_rotation_axis": "world_x_then_y_about_grip",
    }
