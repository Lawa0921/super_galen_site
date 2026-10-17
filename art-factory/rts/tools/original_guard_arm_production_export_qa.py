"""Compare actual Blender evaluated vertices with the finite CPU skin model."""
import json
from pathlib import Path

import numpy as np

from original_guard_arm_production import pose_components
from original_guard_solid_arm import ROOT, write_json
from original_guard_arm_production_qa import RUN, topology
from original_guard_arm_hinge import strict_triangle_crossings


POSES = (("idle", 0, 0), ("bend60", 60, 0), ("bend75", 75, 0),
         ("bend90", 90, 0), ("combined", 90, 45))


def actual_cloth_self(points, triangles):
    mesh = points[triangles]
    hits = strict_triangle_crossings(mesh, mesh)
    return int(sum(i < j and not set(triangles[i]).intersection(triangles[j])
                   for i, j in hits))


def main():
    candidate = json.loads((RUN/"candidate/original-guard-arm-production-geometry.json").read_text(encoding="utf-8"))
    actual = json.loads((RUN/"qa/blender-evaluated-vertices.json").read_text(encoding="utf-8"))
    geometry = candidate["mechanism_geometry"]
    mechanism = tuple(np.asarray(geometry[key]) for key in
                      ("stations", "centers", "bend_axis", "distal_axis"))
    topo = topology(candidate)
    report = {"status": "candidate_pending_three_and_visual", "runtime_publish_allowed": False,
              "source": "actual Blender dependency-graph evaluated vertices",
              "poses": {}}
    for name, bend, roll in POSES:
        proxy = pose_components(candidate, bend, roll, mechanism)
        measured = {}
        for component, coordinates in actual["poses"][name].items():
            points = np.asarray(coordinates)
            expected = proxy[component]
            if points.shape != expected.shape:
                raise ValueError(f"{name}/{component} actual vertex count differs")
            measured[component] = float(np.linalg.norm(points-expected, axis=1).max())
        sleeve = np.asarray(actual["poses"][name]["FlexibleSleeve"])
        report["poses"][name] = {"cpu_to_blender_max_m": measured,
                                  "actual_cloth_nonadjacent_self_crossings":
                                  actual_cloth_self(sleeve, topo["FlexibleSleeve"][0])}
    report["max_cpu_to_blender_m"] = max(v for row in report["poses"].values()
                                          for v in row["cpu_to_blender_max_m"].values())
    write_json(RUN/"qa/blender-output-qa.json", report)
    print("BLENDER_ACTUAL_QA", report["max_cpu_to_blender_m"],
          [row["actual_cloth_nonadjacent_self_crossings"]
           for row in report["poses"].values()], flush=True)


if __name__ == "__main__":
    main()
