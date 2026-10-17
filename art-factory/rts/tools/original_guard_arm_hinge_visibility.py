"""Read-only CPU camera-ray review of the best frozen hinge's four crossings.

The rays reproduce the orthographic view directions from the solid-arm QA
renderer. A ray hit can establish view occlusion, but its depth is not a
measurement of the required 3 mm retreat behind an armor edge.
"""
import json

import numpy as np

from original_guard_arm_hinge import (RUN, SOURCE_RUN, center_at, hinge_transform, load_source,
                                      source_axes, strict_triangle_crossings, unit,
                                      write_json)
from original_guard_arm_hinge_diagnose import intersection_points
from original_guard_solid_arm import AXIS, AXIS_LENGTH, AXIS_START


VIEW_OFFSETS = {
    "front": (0., 1.6, .25),
    "side": (1.6, 0., .2),
    "back": (0., -1.6, .25),
    "action_close": (1.1, 1.2, .45),
}
OUT = RUN / "visibility-review"


def first_ray_hit(origin, direction, triangles, minimum_t=1e-5):
    """Nearest positive two-sided ray/triangle distance, excluding self-contact."""
    triangles = np.asarray(triangles, float)
    if not len(triangles):
        return None
    direction = unit(direction)
    edge1 = triangles[:, 1] - triangles[:, 0]
    edge2 = triangles[:, 2] - triangles[:, 0]
    p = np.cross(direction, edge2)
    determinant = np.einsum("ij,ij->i", edge1, p)
    valid = abs(determinant) > 1e-11
    inverse = np.divide(1., determinant, out=np.zeros_like(determinant), where=valid)
    distance = np.asarray(origin, float) - triangles[:, 0]
    u = np.einsum("ij,ij->i", distance, p) * inverse
    q = np.cross(distance, edge1)
    v = np.einsum("j,ij->i", direction, q) * inverse
    t = np.einsum("ij,ij->i", edge2, q) * inverse
    hit = valid & (u >= -1e-9) & (v >= -1e-9) & (u + v <= 1 + 1e-9) & (t > minimum_t)
    return float(t[hit].min()) if np.any(hit) else None


def sleeve_pose(vertices, pivot, axis, bend, roll, distal, roll_pivot):
    """Deform only the original flexible sleeve vertices between fixed ends."""
    t = (np.asarray(vertices) - AXIS_START) @ AXIS / AXIS_LENGTH
    fractions = np.clip((t - .4) / .25, 0., 1.)
    posed = np.empty_like(vertices, dtype=float)
    for index, point in enumerate(vertices):
        posed[index] = hinge_transform(np.asarray([point]), pivot, axis,
                                        bend * fractions[index], roll * fractions[index],
                                        distal, roll_pivot)[0]
    return posed


def all_pose_meshes(parts, stations, centers, config, bend, roll):
    axes, distal = source_axes(stations, centers)
    pivot = center_at(stations, centers, config["pivot_t"])
    roll_pivot = center_at(stations, centers, .69)
    posed = {
        "UpperArmArmor": parts["UpperArmArmor"]["vertices"],
        "ElbowArmor": hinge_transform(parts["ElbowArmor"]["vertices"], pivot,
                                      axes[config["axis_mode"]], bend * config["elbow_follow"]),
        "ForearmArmor": hinge_transform(parts["ForearmArmor"]["vertices"], pivot,
                                        axes[config["axis_mode"]], bend, roll, distal, roll_pivot),
        "FlexibleSleeve": sleeve_pose(parts["FlexibleSleeve"]["vertices"], pivot,
                                      axes[config["axis_mode"]], bend, roll, distal, roll_pivot),
    }
    return posed


def ray_visibility(point, direction, triangles):
    distances = {part: first_ray_hit(point, direction, mesh)
                 for part, mesh in triangles.items()}
    candidates = [(distance, part) for part, distance in distances.items()
                  if distance is not None]
    return distances, min(candidates)[1] if candidates else None


def main():
    sweep = json.loads((RUN / "qa/sweep-report.json").read_text(encoding="utf-8"))
    config = sweep["configurations"][0]
    if config["configuration_index"] != 1 or config["surface_surface_total"] != 4:
        raise ValueError("Frozen minimum-collision configuration changed")
    parts, stations, centers = load_source()
    source_geometry = json.loads((SOURCE_RUN / "candidate/original-guard-solid-arm-geometry.json").read_text(encoding="utf-8"))
    sleeve = source_geometry["components"]["FlexibleSleeve"]
    sleeve_triangles = np.asarray([[face[0], face[k], face[k + 1]]
                                   for face in sleeve["faces"] for k in range(1, len(face) - 1)], int)
    parts["FlexibleSleeve"] = {"vertices": np.asarray(sleeve["vertices"], float),
                               "triangles": sleeve_triangles}
    posed = all_pose_meshes(parts, stations, centers, config, 90, 45)
    triangles = {name: vertices[parts[name]["triangles"]] for name, vertices in posed.items()}
    pairs = strict_triangle_crossings(triangles["UpperArmArmor"], triangles["ForearmArmor"])
    exterior = [(int(i), int(j)) for i, j in pairs if
                parts["UpperArmArmor"]["labels"][i] ==
                parts["ForearmArmor"]["labels"][j] == "surface"]
    if len(exterior) != 4:
        raise ValueError(f"Expected four original exterior crossing pairs, got {len(exterior)}")
    segments = []
    for i, j in exterior:
        endpoints = intersection_points(triangles["UpperArmArmor"][i],
                                        triangles["ForearmArmor"][j])
        if len(endpoints) != 2:
            raise ValueError(f"Expected two crossing endpoints, got {len(endpoints)}")
        fractions = (0., .1, .25, .5, .75, .9, 1.)
        samples = [(1 - fraction) * endpoints[0] + fraction * endpoints[1]
                   for fraction in fractions]
        views = {}
        for name, offset in VIEW_OFFSETS.items():
            direction = unit(offset)
            hits = []
            for point in samples:
                distances, nearest = ray_visibility(point, direction, triangles)
                hits.append({"sample_xyz_m": point.tolist(),
                             "nearest_occluder": nearest,
                             "elbow_hit_distance_m": distances["ElbowArmor"],
                             "upper_hit_distance_m": distances["UpperArmArmor"],
                             "forearm_hit_distance_m": distances["ForearmArmor"],
                             "sleeve_hit_distance_m": distances["FlexibleSleeve"]})
            views[name] = {"samples": hits,
                           "all_samples_elbow_occluded": all(hit["nearest_occluder"] == "ElbowArmor"
                                                          for hit in hits),
                           "any_sample_unoccluded": any(hit["nearest_occluder"] is None
                                                        for hit in hits)}
        segments.append({"upper_triangle": i, "forearm_triangle": j,
                         "crossing_segment_endpoints_xyz_m": [point.tolist() for point in endpoints],
                         "views": views})
    cap_pairs = []
    for first, second, third in (("UpperArmArmor", "ElbowArmor", "ForearmArmor"),
                                 ("UpperArmArmor", "ForearmArmor", "ElbowArmor"),
                                 ("ElbowArmor", "ForearmArmor", "UpperArmArmor")):
        crossings = strict_triangle_crossings(triangles[first], triangles[second])
        for i, j in crossings:
            i, j = int(i), int(j)
            labels = [parts[first]["labels"][i], parts[second]["labels"][j]]
            if "cap" not in labels:
                continue
            points = intersection_points(triangles[first][i], triangles[second][j])
            if not points:
                cap_pairs.append({"parts": [first, second], "triangles": [i, j],
                                  "labels": labels, "classification": "unknown_no_segment_sample"})
                continue
            midpoint = np.mean(points, axis=0)
            owners = {name: ray_visibility(midpoint, unit(offset), triangles)[1]
                      for name, offset in VIEW_OFFSETS.items()}
            cap_pairs.append({"parts": [first, second], "triangles": [i, j],
                              "labels": labels, "midpoint_xyz_m": midpoint.tolist(),
                              "nearest_occluder_by_view": owners,
                              "third_plate": third,
                              "classification": "third_plate_occluded_in_all_sampled_views"
                              if all(owner == third for owner in owners.values()) else
                              "ray_exposed_candidate" if any(owner is None for owner in owners.values())
                              else "unknown_other_occlusion_or_rim"})
    cap_summary = {classification: sum(pair["classification"] == classification for pair in cap_pairs)
                   for classification in ("third_plate_occluded_in_all_sampled_views",
                                          "ray_exposed_candidate", "unknown_other_occlusion_or_rim",
                                          "unknown_no_segment_sample")}
    result = {
        "status": "cpu_visibility_diagnostic_only",
        "runtime_publish_allowed": False,
        "source_best_configuration_index": 1,
        "pose": {"bend_degrees": 90, "roll_degrees": 45},
        "projection": "Orthographic camera offsets from original_guard_solid_arm_blender.py; parallel rays toward each camera",
        "crossing_segments": segments,
        "combined_pose_cap_involved_triangle_pairs": cap_pairs,
        "combined_pose_cap_summary": cap_summary,
        "view_summary": {view: {
            "segments_all_samples_elbow_occluded": sum(segment["views"][view]["all_samples_elbow_occluded"]
                                                       for segment in segments),
            "segments_with_unoccluded_sample": sum(segment["views"][view]["any_sample_unoccluded"]
                                                   for segment in segments),
        } for view in VIEW_OFFSETS},
        "limits": "Seven samples per exterior crossing segment and one midpoint per cap crossing pair, from four standard camera directions. Ray-exposed cap candidates need matching raster evidence before being called visible defects. Ray depth is not the required 3 mm armor-edge retreat; z-fighting and image-space pixel thresholds need image review."
    }
    write_json(OUT / "ray-visibility.json", result)
    print("HINGE_VISIBILITY", json.dumps(result["view_summary"]),
          "cap", json.dumps(cap_summary), flush=True)


if __name__ == "__main__":
    main()
