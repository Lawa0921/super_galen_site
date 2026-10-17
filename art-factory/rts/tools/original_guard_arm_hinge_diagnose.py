"""Locate the remaining four true exterior crossings in the bounded sweep."""
import json

import numpy as np

from original_guard_arm_hinge import (RUN, category_counts, center_at, hinge_transform,
                                      load_source, source_axes,
                                      strict_triangle_crossings, write_json)
from original_guard_solid_arm import AXIS, AXIS_LENGTH, AXIS_START


def intersection_points(first, second):
    points = []
    for a, b in ((first, second), (second, first)):
        e1, e2 = b[1] - b[0], b[2] - b[0]
        for i in range(3):
            start, end = a[i], a[(i + 1) % 3]
            direction = end - start
            p = np.cross(direction, e2)
            det = float(np.dot(e1, p))
            if abs(det) < 1e-11:
                continue
            inv = 1. / det
            distance = start - b[0]
            u = float(np.dot(distance, p) * inv)
            q = np.cross(distance, e1)
            v = float(np.dot(direction, q) * inv)
            t = float(np.dot(e2, q) * inv)
            if 1e-6 < u < 1 - 1e-6 and 1e-6 < v < 1 - u - 1e-6 and 1e-6 < t < 1 - 1e-6:
                points.append(start + t * direction)
    return points


def main():
    report = json.loads((RUN / "qa/sweep-report.json").read_text(encoding="utf-8"))
    best = min(report["configurations"],
               key=lambda item: (item["surface_surface_total"], item["cap_involved_total"]))
    parts, stations, centers = load_source()
    axes, distal = source_axes(stations, centers)
    pivot = center_at(stations, centers, best["pivot_t"])
    roll_pivot = center_at(stations, centers, .69)
    upper = parts["UpperArmArmor"]
    fore = parts["ForearmArmor"]
    posed = hinge_transform(fore["vertices"], pivot, axes[best["axis_mode"]], 90,
                             45, distal, roll_pivot)
    first = upper["vertices"][upper["triangles"]]
    second = posed[fore["triangles"]]
    pairs = strict_triangle_crossings(first, second)
    exterior = [(int(i), int(j)) for i, j in pairs
                if upper["labels"][i] == fore["labels"][j] == "surface"]
    all_points = [point for i, j in exterior for point in intersection_points(first[i], second[j])]
    if len(exterior) != 4 or not all_points:
        raise ValueError(f"Expected four located exterior triangle pairs; got {len(exterior)}")
    location = np.asarray(all_points)
    def station(triangle):
        return float((triangle.mean(axis=0) - AXIS_START) @ AXIS / AXIS_LENGTH)
    source_stations = {
        "upper": [station(first[i]) for i, _ in exterior],
        "forearm": [station(fore["vertices"][fore["triangles"][j]]) for _, j in exterior],
    }
    result = {"status": "no_surface_channel", "runtime_publish_allowed": False,
              "best_configuration_index": best["configuration_index"],
              "pivot_t": best["pivot_t"], "pivot_xyz_m": pivot.tolist(),
              "hinge_axis": axes[best["axis_mode"]].tolist(),
              "elbow_follow": best["elbow_follow"],
              "pose": {"bend_degrees": 90, "roll_degrees": 45},
              "strict_surface_surface_pairs": len(exterior),
              "actual_segment_triangle_crossing_points": len(all_points),
              "crossing_xyz_bounds_m": [location.min(axis=0).tolist(), location.max(axis=0).tolist()],
              "crossing_xyz_samples_m": location[:12].tolist(),
              "source_triangle_station_t": {
                  name: [min(values), max(values)] for name, values in source_stations.items()
              },
              "best_pose_crossings": category_counts(upper, fore, pairs),
              "elbow_armor_visual_occlusion": "unknown_pending_separate_visibility_review",
              "inference": "The only exterior failure of the minimum-collision configuration occurs at full bend plus 45-degree forearm roll. All cap-involved crossings remain separately reported by the sweep."
              }
    write_json(RUN / "qa/minimum-collision.json", result)
    print("HINGE_MINIMUM_COLLISION", json.dumps(result), flush=True)


if __name__ == "__main__":
    main()
