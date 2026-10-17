"""Strict source-preserving geometry and fixed-mechanism QA for one cap patch."""
import json

import numpy as np

from original_guard_arm_hinge import (center_at, evaluate_configuration, hinge_transform,
                                      load_source, source_axes,
                                      strict_triangle_crossings, triangulate, unit,
                                      write_json)
from original_guard_elbow_rim import RUN, topology_report
from original_guard_arm_hinge_diagnose import intersection_points
from original_guard_arm_hinge_visibility import first_ray_hit
from original_guard_solid_arm import AXIS


def nonadjacent_self_crossings(points, faces):
    triangles = points[faces]
    hits = strict_triangle_crossings(triangles, triangles)
    return [(int(i), int(j)) for i, j in hits if i < j and
            not set(faces[i]).intersection(faces[j])]


def main():
    source_parts, stations, centers = load_source()
    source_geometry = json.loads((RUN / "candidate/original-guard-elbow-rim-geometry.json").read_text())
    component = source_geometry["components"]["ForearmArmor"]
    triangles, labels = triangulate(component)
    patched_parts = dict(source_parts)
    patched_parts["ForearmArmor"] = {"vertices": np.asarray(component["vertices"], float),
                                     "triangles": triangles, "labels": labels}
    axes, distal = source_axes(stations, centers)
    source = evaluate_configuration(source_parts, stations, centers, axes, distal,
                                    .48, "global_anatomical", 0.)
    patched = evaluate_configuration(patched_parts, stations, centers, axes, distal,
                                     .48, "global_anatomical", 0.)
    pivot = center_at(stations, centers, .48)
    roll_pivot = center_at(stations, centers, .69)
    self_report = {}
    for pose in patched["poses"]:
        bend, roll = pose["bend_degrees"], pose["roll_degrees"]
        posed = hinge_transform(patched_parts["ForearmArmor"]["vertices"], pivot,
                                axes["global_anatomical"], bend, roll, distal, roll_pivot)
        hits = nonadjacent_self_crossings(posed, triangles)
        self_report[f"bend{bend}_roll{roll}"] = {"count": len(hits), "sample": hits[:8]}
    source_surface = [sum(counts["surface_surface"] for counts in sample["metal_crossings"].values())
                      for sample in source["poses"]]
    patched_surface = [sum(counts["surface_surface"] for counts in sample["metal_crossings"].values())
                       for sample in patched["poses"]]
    combined = next(sample for sample in patched["poses"]
                    if sample["bend_degrees"] == 90 and sample["roll_degrees"] == 45)
    elbow = patched_parts["ElbowArmor"]
    fore_posed = hinge_transform(patched_parts["ForearmArmor"]["vertices"], pivot,
                                 axes["global_anatomical"], 90, 45, distal, roll_pivot)
    crossing_pairs = strict_triangle_crossings(elbow["vertices"][elbow["triangles"]],
                                                fore_posed[triangles])
    elbow_triangle_154 = [(int(i), int(j)) for i, j in crossing_pairs if i == 154]
    old_fore_posed = hinge_transform(source_parts["ForearmArmor"]["vertices"], pivot,
                                     axes["global_anatomical"], 90, 45, distal, roll_pivot)
    rest_axis_points = np.array([[0., 0., 0.], AXIS])
    posed_axis_points = hinge_transform(rest_axis_points, pivot, axes["global_anatomical"],
                                         90, 45, distal, roll_pivot)
    inward_axis = unit(posed_axis_points[1] - posed_axis_points[0])
    patched_cap = fore_posed[triangles[labels == "cap"]]
    original_contact_retreat = []
    elbow_154 = elbow["vertices"][elbow["triangles"][154]]
    for old_triangle_id in (436, 437):
        old_cap = old_fore_posed[source_parts["ForearmArmor"]["triangles"][old_triangle_id]]
        for point in intersection_points(elbow_154, old_cap):
            depth = first_ray_hit(point - inward_axis * 1e-6, inward_axis,
                                  patched_cap, minimum_t=1e-8)
            if depth is None:
                raise ValueError("No recessed source cap behind original elbow contact")
            original_contact_retreat.append(float(depth - 1e-6))
    topo = topology_report(component)
    result = {"status": "qa_failed_pending_visibility", "runtime_publish_allowed": False,
              "fixed_configuration": {"pivot_t": .48, "axis_mode": "global_anatomical",
                                      "elbow_follow": 0},
              "retreat_m_at_three_new_inner_rim_vertices": .005,
              "source_surface_surface_by_pose": source_surface,
              "patched_surface_surface_by_pose": patched_surface,
              "original_four_surface_crossing_pairs_did_not_increase": patched_surface == source_surface,
              "source_cap_involved_total_across_14_poses": source["cap_involved_total"],
              "patched_cap_involved_total_across_14_poses": patched["cap_involved_total"],
              "combined_metal_crossings": combined["metal_crossings"],
              "combined_elbow_triangle_154_forearm_pair_indices": elbow_triangle_154,
              "original_elbow154_forearm436_437_contact_retreat_m": original_contact_retreat,
              "minimum_original_contact_retreat_m": min(original_contact_retreat),
              "nonadjacent_forearm_self_crossings_by_pose": self_report,
              "max_rigid_edge_error_m": patched["max_rigid_edge_error_m"],
              "topology": topo,
              "geometry_gate": (patched_surface == source_surface and
                                all(not entry["count"] for entry in self_report.values()) and
                                not any(topo[key] for key in ("boundary_edges", "inconsistent_winding_edges",
                                                                   "zero_area_triangles")) and
                                min(original_contact_retreat) >= .003 and
                                patched["max_rigid_edge_error_m"] < 1e-6)}
    write_json(RUN / "qa/strict-pose-report.json", result)
    print("ELBOW_RIM_STRICT_QA", json.dumps({key: result[key] for key in (
        "original_four_surface_crossing_pairs_did_not_increase",
        "source_cap_involved_total_across_14_poses",
        "patched_cap_involved_total_across_14_poses",
        "combined_elbow_triangle_154_forearm_pair_indices",
        "minimum_original_contact_retreat_m", "geometry_gate")}), flush=True)


if __name__ == "__main__":
    main()
