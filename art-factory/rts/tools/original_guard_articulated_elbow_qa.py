"""Finite motion and geometry audit for the one source-bound elbow rebuild."""
import hashlib
import itertools
import json
import time

import numpy as np

from original_guard_articulated_elbow import RUN, build_candidate, pose_components, source_boundary_fingerprint
from original_guard_arm_hinge import strict_triangle_crossings
from original_guard_solid_arm import SOURCE, SOURCE_SHA, build_arm_piece, source_geometry, triangulate, write_json

PAIRS = (("UpperArmArmor", "ElbowArmor"), ("UpperArmArmor", "ForearmArmor"),
         ("ElbowArmor", "ForearmArmor"), ("FlexibleSleeve", "UpperArmArmor"),
         ("FlexibleSleeve", "ElbowArmor"), ("FlexibleSleeve", "ForearmArmor"))


def triangle_data(part):
    triangles, labels = [], []
    for fi, face in enumerate(part["faces"]):
        if "face_labels" in part:
            label = part["face_labels"][fi]
        else:
            label = "presentation" if fi < part.get("pre_cap_exterior_polygon_count", 0) else "hidden_return"
        for k in range(1, len(face)-1):
            triangles.append([face[0], face[k], face[k+1]])
            labels.append(label)
    return np.asarray(triangles, int), np.asarray(labels)


def sample(candidate, bend, roll, topology):
    posed = pose_components(candidate, bend, roll)
    triangles = {name: posed[name][indices] for name, (indices, labels) in topology.items()}
    crossings = {}
    presentation = 0
    cloth_surface_contacts = 0
    for a, b in PAIRS:
        ids = strict_triangle_crossings(triangles[a], triangles[b])
        labels_a, labels_b = topology[a][1], topology[b][1]
        visible = sum(labels_a[i] == labels_b[j] == "presentation" for i, j in ids)
        if a == "FlexibleSleeve":
            # This is a contact candidate, not proof of an exposed cloth exit.
            cloth_surface_contacts += sum(labels_b[j] == "presentation" for _, j in ids)
        else:
            presentation += visible
        crossings[f"{a}/{b}"] = {"all": len(ids), "presentation": int(visible),
                                   "hidden_or_cap": int(len(ids)-visible)}
    cloth_faces = topology["FlexibleSleeve"][0]
    cloth_pairs = strict_triangle_crossings(triangles["FlexibleSleeve"], triangles["FlexibleSleeve"])
    cloth_self = sum(i < j and not set(cloth_faces[i]).intersection(cloth_faces[j])
                     for i, j in cloth_pairs)
    # A proximity hint selects at most one midpoint on each 5-degree edge.
    from scipy.spatial import cKDTree
    metal = np.vstack([posed[name] for name in ("UpperArmArmor", "ElbowArmor", "ForearmArmor")])
    distance = cKDTree(metal).query(posed["FlexibleSleeve"], k=1)[0].min()
    return {"bend": bend, "roll": roll, "presentation_crossings": int(presentation),
            "cloth_metal_surface_contacts": int(cloth_surface_contacts),
            "cloth_self_crossings": int(cloth_self),
            "minimum_vertex_to_vertex_m": float(distance), "pairs": crossings}


def main():
    started = time.perf_counter()
    vertices, faces = source_geometry()
    candidate = build_candidate(vertices, faces)
    topology = {name: triangle_data(part) for name, part in candidate["components"].items()}
    grid = {}
    for bend, roll in itertools.product(range(0, 91, 5), range(0, 46, 5)):
        row = sample(candidate, bend, roll, topology)
        grid[f"{bend}:{roll}"] = row
    midpoint_keys = set()
    for bend, roll in itertools.product(range(0, 91, 5), range(0, 46, 5)):
        first = grid[f"{bend}:{roll}"]
        for db, dr in ((5, 0), (0, 5)):
            next_key = f"{bend+db}:{roll+dr}"
            if next_key not in grid:
                continue
            other = grid[next_key]
            classification = (first["presentation_crossings"], first["cloth_metal_surface_contacts"])
            next_classification = (other["presentation_crossings"], other["cloth_metal_surface_contacts"])
            if classification != next_classification or min(first["minimum_vertex_to_vertex_m"],
                                                            other["minimum_vertex_to_vertex_m"]) < .002:
                midpoint_keys.add((bend+db/2, roll+dr/2))
    midpoints = {f"{bend}:{roll}": sample(candidate, bend, roll, topology)
                 for bend, roll in sorted(midpoint_keys)}
    all_rows = list(grid.values()) + list(midpoints.values())
    flags = {"presentation_crossing_samples": sum(r["presentation_crossings"] > 0 for r in all_rows),
             "cloth_metal_contact_samples": sum(r["cloth_metal_surface_contacts"] > 0 for r in all_rows),
             "cloth_self_samples": sum(r["cloth_self_crossings"] > 0 for r in all_rows)}
    old_forearm = build_arm_piece(vertices, faces, .72, .96)
    new_forearm = candidate["components"]["ForearmArmor"]
    preserved = (old_forearm["faces"][:old_forearm["pre_cap_exterior_polygon_count"]] ==
                 new_forearm["faces"][:old_forearm["pre_cap_exterior_polygon_count"]] and
                 np.array_equal(np.asarray(old_forearm["vertices"]),
                                np.asarray(new_forearm["vertices"])[:len(old_forearm["vertices"])]))
    report = {"status": "qa_failed" if flags["presentation_crossing_samples"] or flags["cloth_self_samples"] or not preserved else "mechanical_pass_pending_visual_review",
              "runtime_publish_allowed": False,
              "source_sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
              "source_geometry_sha256": candidate["source_sha256"],
              "source_hash_matches_frozen": hashlib.sha256(SOURCE.read_bytes()).hexdigest() == SOURCE_SHA,
              "forearm_original_exterior_and_vertices_preserved_t_greater_072": preserved,
              "outside_roi_fingerprint_match": candidate["preserved_source_fingerprint"] ==
              source_boundary_fingerprint(vertices, faces, .37, .72),
              "fixed_hinge": candidate["fixed_hinge"],
              "grid_step_degrees": 5, "grid_count": len(grid),
              "midpoint_count": len(midpoints), "flags": flags,
              "cloth_exit_classification": "Undetermined by triangle contact alone; inspect matched pose imagery for exposed fabric",
              "grid": grid, "midpoints": midpoints,
              "elapsed_seconds": time.perf_counter()-started}
    write_json(RUN / "qa/finite-pose-report.json", report)
    print("ARTICULATED_ELBOW_QA", report["status"], flags,
          len(grid), len(midpoints), round(report["elapsed_seconds"], 1), flush=True)


if __name__ == "__main__":
    main()
