"""Finite original-arm geometry audit; exported-skin and visual gates remain separate."""
import itertools
import time

import numpy as np

from original_guard_arm_hinge import strict_triangle_crossings
from original_guard_arm_production import (build_candidate, mechanism_axes,
                                           pose_components,
                                           verify_outer_roi_preservation)
from original_guard_solid_arm import ROOT, SOURCE, SOURCE_SHA, source_geometry, write_json


RUN = ROOT / "art-factory/rts/runs/original-guard-arm-production/2026-10-05"
NAMES = ("UpperArmArmor", "ElbowArmor", "ForearmArmor", "FlexibleSleeve")
PAIRS = (("UpperArmArmor", "ElbowArmor"),
         ("UpperArmArmor", "ForearmArmor"),
         ("ElbowArmor", "ForearmArmor"),
         ("FlexibleSleeve", "UpperArmArmor"),
         ("FlexibleSleeve", "ElbowArmor"),
         ("FlexibleSleeve", "ForearmArmor"))


def topology(candidate):
    topo = {}
    for name, part in candidate["components"].items():
        triangles, labels = [], []
        for face, label in zip(part["faces"], part["face_labels"]):
            for i in range(1, len(face)-1):
                triangles.append((face[0], face[i], face[i+1]))
                labels.append(label)
        topo[name] = (np.asarray(triangles, int), np.asarray(labels))
    return topo


def pose_audit(candidate, topo, bend, roll, mechanism):
    posed = pose_components(candidate, bend, roll, mechanism)
    triangles = {name: posed[name][topo[name][0]] for name in NAMES}
    result = {"bend": bend, "roll": roll, "pairs": {}}
    exposed = 0
    cloth_contact = 0
    for a, b in PAIRS:
        hit = strict_triangle_crossings(triangles[a], triangles[b])
        la, lb = topo[a][1], topo[b][1]
        visible = int(sum(la[i] == "presentation" and lb[j] == "presentation"
                          for i, j in hit))
        if a == "FlexibleSleeve":
            cloth_contact += visible
        else:
            exposed += visible
        result["pairs"][f"{a}/{b}"] = {"strict": len(hit),
                                        "presentation": visible}
    cloth = topo["FlexibleSleeve"][0]
    self_hit = strict_triangle_crossings(triangles["FlexibleSleeve"],
                                          triangles["FlexibleSleeve"])
    cloth_self = sum(i < j and not set(cloth[i]).intersection(cloth[j])
                     for i, j in self_hit)
    result.update(presentation_crossings=exposed,
                  cloth_metal_presentation_contacts=cloth_contact,
                  cloth_nonadjacent_self_crossings=int(cloth_self))
    return result


def main():
    start = time.perf_counter()
    vertices, faces = source_geometry()
    candidate = build_candidate(vertices, faces)
    match = verify_outer_roi_preservation(candidate, vertices, faces)
    candidate["source_sha256"] = SOURCE_SHA
    candidate["source"] = str(SOURCE.relative_to(ROOT)).replace("\\", "/")
    candidate["outside_roi_output_to_source"] = match
    stations, centers, axis, distal = mechanism_axes(candidate)
    candidate["mechanism_geometry"] = {
        "stations": stations.tolist(), "centers": centers.tolist(),
        "bend_axis": axis.tolist(), "distal_axis": distal.tolist()}
    write_json(RUN / "candidate/original-guard-arm-production-geometry.json", candidate)
    topo = topology(candidate)
    mechanism = (stations, centers, axis, distal)
    grid = {}
    for bend, roll in itertools.product(range(0, 91, 5), range(0, 46, 5)):
        grid[f"{bend}:{roll}"] = pose_audit(candidate, topo, bend, roll, mechanism)
    midpoint_keys = set()
    for bend, roll in itertools.product(range(0, 91, 5), range(0, 46, 5)):
        first = grid[f"{bend}:{roll}"]
        for db, dr in ((5, 0), (0, 5)):
            other = grid.get(f"{bend+db}:{roll+dr}")
            if other is None:
                continue
            signature = lambda row: (row["presentation_crossings"],
                                     row["cloth_metal_presentation_contacts"],
                                     row["cloth_nonadjacent_self_crossings"])
            if signature(first) != signature(other):
                midpoint_keys.add((bend+db/2, roll+dr/2))
    midpoints = {f"{bend}:{roll}": pose_audit(candidate, topo, bend, roll, mechanism)
                 for bend, roll in sorted(midpoint_keys)}
    rows = list(grid.values()) + list(midpoints.values())
    report = {"status": "geometry_diagnostic_complete_visual_rejected", "runtime_publish_allowed": False,
              "source_sha256": SOURCE_SHA, "outside_roi_output_to_source": match,
              "grid_count": len(grid), "midpoint_count": len(midpoints),
              "counts": {key: sum(row[key] > 0 for row in rows) for key in
                         ("presentation_crossings", "cloth_metal_presentation_contacts",
                          "cloth_nonadjacent_self_crossings")},
              "cloth_scope": "CPU linear blend skin proxy only until actual Blender and Three evaluated equality is demonstrated",
              "grid": grid, "midpoints": midpoints,
              "elapsed_seconds": time.perf_counter()-start}
    write_json(RUN / "qa/finite-pose-report.json", report)
    print("ARM_PRODUCTION_SWEEP", report["counts"], len(grid), len(midpoints),
          round(report["elapsed_seconds"], 2), flush=True)


if __name__ == "__main__":
    main()
