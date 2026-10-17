"""Strict 14-pose geometry and cap visibility probe for one exterior lip."""
import json

import numpy as np

from original_guard_arm_hinge import (center_at, evaluate_configuration,
                                      hinge_transform, load_source, source_axes,
                                      strict_triangle_crossings, triangulate,
                                      write_json)
from original_guard_arm_hinge_diagnose import intersection_points
from original_guard_arm_hinge_visibility import (VIEW_OFFSETS, first_ray_hit,
                                                 sleeve_pose)
from original_guard_elbow_lip import RUN
from original_guard_elbow_rim import RUN as RIM_RUN, topology_report


def part_from(component):
    triangles, labels = triangulate(component)
    return {"vertices": np.asarray(component["vertices"], float),
            "triangles": triangles, "labels": labels}


def self_crossings(points, faces):
    hits = strict_triangle_crossings(points[faces], points[faces])
    return [(int(i), int(j)) for i, j in hits if i < j and
            not set(faces[i]).intersection(faces[j])]


def main():
    frozen, stations, centers = load_source()
    cap_geometry = json.loads((RIM_RUN / "candidate/original-guard-elbow-rim-geometry.json").read_text())
    lip_geometry = json.loads((RUN / "candidate/original-guard-elbow-lip-geometry.json").read_text())
    before = dict(frozen)
    after = dict(frozen)
    before["ForearmArmor"] = part_from(cap_geometry["components"]["ForearmArmor"])
    after["ForearmArmor"] = part_from(lip_geometry["components"]["ForearmArmor"])
    axes, distal = source_axes(stations, centers)
    original = evaluate_configuration(before, stations, centers, axes, distal,
                                      .48, "global_anatomical", 0.)
    patched = evaluate_configuration(after, stations, centers, axes, distal,
                                     .48, "global_anatomical", 0.)
    pivot = center_at(stations, centers, .48)
    roll_pivot = center_at(stations, centers, .69)
    self_report = {}
    for pose in patched["poses"]:
        bend, roll = pose["bend_degrees"], pose["roll_degrees"]
        moved = hinge_transform(after["ForearmArmor"]["vertices"], pivot,
                                axes["global_anatomical"], bend, roll, distal, roll_pivot)
        hits = self_crossings(moved, after["ForearmArmor"]["triangles"])
        self_report[f"bend{bend}_roll{roll}"] = {"count": len(hits), "sample": hits[:12]}
    before_surface = [sum(v["surface_surface"] for v in pose["metal_crossings"].values())
                      for pose in original["poses"]]
    after_surface = [sum(v["surface_surface"] for v in pose["metal_crossings"].values())
                     for pose in patched["poses"]]
    combined = next(pose for pose in patched["poses"]
                    if pose["bend_degrees"] == 90 and pose["roll_degrees"] == 45)
    fore_posed = hinge_transform(after["ForearmArmor"]["vertices"], pivot,
                                 axes["global_anatomical"], 90, 45, distal, roll_pivot)
    elbow = after["ElbowArmor"]
    pairs = strict_triangle_crossings(elbow["vertices"][elbow["triangles"]],
                                      fore_posed[after["ForearmArmor"]["triangles"]])
    elbow154_pairs = [(int(i), int(j), elbow["labels"][i], after["ForearmArmor"]["labels"][j])
                      for i, j in pairs if i == 154]
    # Ray through the original source collision segment, from the +X camera.
    source_fore = frozen["ForearmArmor"]
    old_posed = hinge_transform(source_fore["vertices"], pivot,
                                axes["global_anatomical"], 90, 45, distal, roll_pivot)
    elbow154 = elbow["vertices"][elbow["triangles"][154]]
    contact_samples = [point for triangle in (436, 437)
                       for point in intersection_points(elbow154,
                                                        old_posed[source_fore["triangles"][triangle]])]
    fore_triangles = fore_posed[after["ForearmArmor"]["triangles"]]
    band_faces = lip_geometry["components"]["ForearmArmor"]["faces"][213:217]
    band_indices = np.asarray([[face[0], face[k], face[k + 1]]
                               for face in band_faces for k in range(1, len(face) - 1)], int)
    band_triangles = fore_posed[band_indices]
    source_mapping = json.loads((RUN / "qa/source-face-audit.json").read_text())["source_face_mapping"]
    triangle_faces = [face_index for face_index, face in enumerate(lip_geometry["components"]["ForearmArmor"]["faces"])
                      for _ in range(1, len(face) - 1)]
    contact_rays = []
    for point in contact_samples:
        hit_candidates = [(distance, index) for index, triangle in enumerate(fore_triangles)
                          if (distance := first_ray_hit(point, [1, 0, 0], triangle[None, :, :])) is not None]
        nearest = min(hit_candidates) if hit_candidates else None
        face_index = triangle_faces[nearest[1]] if nearest else None
        contact_rays.append({"point_xyz_m": point.tolist(),
                             "forearm_occluder_distance_m": nearest[0] if nearest else None,
                             "forearm_occluder_triangle": nearest[1] if nearest else None,
                             "forearm_occluder_face": face_index,
                             "forearm_occluder_source_face": source_mapping[face_index] if face_index is not None else None,
                             "forearm_occluder_is_new_exterior_band": face_index is not None and
                                                                       213 <= face_index < 217,
                             "new_exterior_band_hit_distance_m": first_ray_hit(point, [1, 0, 0],
                                                                                 band_triangles),
                             "elbow_occluder_distance_m": first_ray_hit(point, [1, 0, 0],
                                                                          elbow["vertices"][elbow["triangles"]])})
    topology = topology_report(lip_geometry["components"]["ForearmArmor"])
    new_surface_crossings = []
    sleeve_component = lip_geometry["components"]["FlexibleSleeve"]
    sleeve_vertices = np.asarray(sleeve_component["vertices"], float)
    sleeve_faces = np.asarray([[face[0], face[k], face[k + 1]]
                               for face in sleeve_component["faces"]
                               for k in range(1, len(face) - 1)], int)
    for bend, roll in ((60, 0), (75, 0)):
        moved_fore = hinge_transform(after["ForearmArmor"]["vertices"], pivot,
                                     axes["global_anatomical"], bend, roll, distal, roll_pivot)
        moved_sleeve = sleeve_pose(sleeve_vertices, pivot, axes["global_anatomical"],
                                   bend, roll, distal, roll_pivot)
        meshes = {"UpperArmArmor": after["UpperArmArmor"]["vertices"][after["UpperArmArmor"]["triangles"]],
                  "ElbowArmor": elbow["vertices"][elbow["triangles"]],
                  "ForearmArmor": moved_fore[after["ForearmArmor"]["triangles"]],
                  "FlexibleSleeve": moved_sleeve[sleeve_faces]}
        for first, second in (("UpperArmArmor", "ForearmArmor"),
                              ("ElbowArmor", "ForearmArmor")):
            hits = strict_triangle_crossings(meshes[first], meshes[second])
            for i, j in hits:
                if after[first]["labels"][i] != "surface" or after[second]["labels"][j] != "surface":
                    continue
                points = intersection_points(meshes[first][i], meshes[second][j])
                midpoint = np.mean(points, axis=0) if points else np.mean(meshes[first][i], axis=0)
                views = {}
                for view, offset in VIEW_OFFSETS.items():
                    distances = {name: first_ray_hit(midpoint, offset, mesh)
                                 for name, mesh in meshes.items()}
                    candidates = [(distance, name) for name, distance in distances.items()
                                  if distance is not None]
                    views[view] = {"nearest_occluder": min(candidates)[1] if candidates else None,
                                   "nearest_depth_m": min(candidates)[0] if candidates else None}
                new_surface_crossings.append({"bend_degrees": bend, "roll_degrees": roll,
                                              "parts": [first, second], "triangles": [int(i), int(j)],
                                              "point_xyz_m": midpoint.tolist(), "views": views})
    result = {"status": "geometry_review", "runtime_publish_allowed": False,
              "fixed_configuration": {"pivot_t": .48, "axis_mode": "global_anatomical",
                                      "elbow_follow": 0},
              "before_surface_surface_by_pose": before_surface,
              "after_surface_surface_by_pose": after_surface,
              "before_cap_involved_total_14_poses": original["cap_involved_total"],
              "after_cap_involved_total_14_poses": patched["cap_involved_total"],
              "combined_metal_crossings": combined["metal_crossings"],
              "combined_elbow154_forearm_pairs": elbow154_pairs,
              "old_contact_side_camera_rays": contact_rays,
              "new_surface_crossing_samples": new_surface_crossings,
              "nonadjacent_forearm_self_crossings_by_pose": self_report,
              "max_rigid_edge_error_m": patched["max_rigid_edge_error_m"],
              "topology": topology,
              "mechanical_gate": (all(entry["count"] == 0 for entry in self_report.values()) and
                                  all(topology[key] == 0 for key in ("boundary_edges",
                                                                      "inconsistent_winding_edges",
                                                                      "zero_area_triangles")) and
                                  patched["max_rigid_edge_error_m"] < 1e-6)}
    write_json(RUN / "qa/strict-pose-report.json", result)
    print("ELBOW_LIP_STRICT_QA", json.dumps({key: result[key] for key in (
        "before_surface_surface_by_pose", "after_surface_surface_by_pose",
        "before_cap_involved_total_14_poses", "after_cap_involved_total_14_poses",
        "combined_elbow154_forearm_pairs", "mechanical_gate")}), flush=True)


if __name__ == "__main__":
    main()
