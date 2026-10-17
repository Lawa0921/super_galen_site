"""Measured protected ROI and explicit candidate gates for the original grip LOD."""
import numpy as np


def protected_channel_mask(vertices, origin, direction, radius, radial_tolerance, axial_z_range):
    """Select only original bore-wall vertices; exterior keeps quadric freedom."""
    points = np.asarray(vertices, dtype=np.float64)
    centre = np.asarray(origin, dtype=np.float64)
    axis = np.asarray(direction, dtype=np.float64)
    axis /= np.linalg.norm(axis)
    offset = points - centre
    radial = np.linalg.norm(offset - np.outer(offset @ axis, axis), axis=1)
    return ((np.abs(radial - radius) <= radial_tolerance)
            & (points[:, 2] >= axial_z_range[0]) & (points[:, 2] <= axial_z_range[1]))


def protected_failure_neighborhood_mask(vertices, centres, radius):
    """Protect only measured first-pass inversion and sword-crossing neighborhoods."""
    points = np.asarray(vertices, dtype=np.float64)
    selected = np.zeros(len(points), dtype=bool)
    for centre in centres:
        selected |= np.sum((points - np.asarray(centre, dtype=np.float64)) ** 2, axis=1) < radius ** 2
    return selected


def low_grip_verdict(metrics):
    """Mechanical gate; sampled surface distances are not global error bounds."""
    contacts = metrics.get("four_finger_side_contacts", [])
    distinct_faces = metrics.get("four_finger_side_distinct_faces", [])
    gaps = metrics.get("four_finger_side_closest_gap_m", [])
    checks = {
        "triangle_budget": metrics.get("triangles", float("inf")) <= 12000,
        "closed_manifold": metrics.get("connected_components") == 1
                           and all(metrics.get(key, -1) == 0 for key in
                               ("boundary_edges", "nonmanifold_edges", "winding_edges", "zero_area_faces")),
        "protected_bore_preserved": metrics.get("protected_input_vertices", 0) > 0
                                    and metrics.get("protected_vertices_kept_exact") == metrics.get("protected_input_vertices")
                                    and metrics.get("bore_axis_minimum_sample_distance_m", -1) >= .0243,
        "no_near_source_normal_opposition": metrics.get("near_source_normal_oppositions", -1) == 0,
        "sword_clearance_fully_verified": metrics.get("exact_sword_crossings", -1) == 0
                                and metrics.get("sword_vertices_inside_glove", -1) == 0
                                and metrics.get("closed_sword_component_containment_complete") is True
                                and metrics.get("glove_vertices_confirmed_inside_closed_sword_components", -1) == 0,
        "four_finger_side_gaps": len(contacts) == len(gaps) == len(distinct_faces) == 4
                                 and all(count >= 2 and faces >= 2 and .0003 <= gap <= .0008
                                         for count, faces, gap in zip(contacts, distinct_faces, gaps)),
        "sampled_surface_fidelity": metrics.get("high_to_low_sample_p95_m", float("inf")) <= .002
                                    and metrics.get("low_to_high_sample_p95_m", float("inf")) <= .002,
        "bake_uv_present": metrics.get("uv_resolvable_nonzero_fraction", -1) == 1.0,
    }
    return {"pass": all(checks.values()), "checks": checks}
