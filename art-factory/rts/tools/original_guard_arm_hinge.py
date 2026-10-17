"""Finite CPU hinge sweep over the frozen original guard +X arm surfaces.

No mesh edits, remeshing, arbitrary armor translations, downloaded motions,
or GPU renders occur here. Every pose is a rigid rotation about a source-
derived anatomical hinge and a distal long-axis roll.
"""
import hashlib
import itertools
import json
import math
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
SOURCE_RUN = ROOT / "art-factory/rts/runs/original-guard-solid-arm/2026-10-05"
RUN = ROOT / "art-factory/rts/runs/original-guard-arm-hinge/2026-10-05"
GLB_SHA = "2f2f7ee68a9af21882f327545d7ed370a756f189e1e2ae964266dcea14f06d8f"
BLEND_SHA = "c106e3d1dc33cdba749e495e8f11c8dfd070652f7cffee957e94b9a849393b51"
AXIS = np.array([.3125957500029696, .012022913461652678, -.9498101634705614])
PIVOTS = (.48, .52, .56, .60)
ELBOW_FOLLOW = (0., .25, .50)
AXIS_MODES = ("global_anatomical", "local_elbow", "local_upper")
BEND_DEGREES = (0, 15, 30, 45, 60, 75, 90)
ROLL_DEGREES = (0, 45)


def unit(vector):
    vector = np.asarray(vector, float)
    length = np.linalg.norm(vector)
    if not np.isfinite(length) or length < 1e-12:
        raise ValueError("Finite nonzero direction required")
    return vector / length


def rotation(axis, degrees):
    axis = unit(axis)
    angle = math.radians(float(degrees))
    x, y, z = axis
    skew = np.array([[0., -z, y], [z, 0., -x], [-y, x, 0.]])
    return np.eye(3) * math.cos(angle) + (1 - math.cos(angle)) * np.outer(axis, axis) + math.sin(angle) * skew


def hinge_transform(points, pivot, axis, bend_degrees, roll_degrees=0,
                    roll_axis=None, roll_pivot=None):
    """Rigid hinge then rigid distal-axis roll, with no free translation."""
    points = np.asarray(points, float)
    pivot = np.asarray(pivot, float)
    bend_rotation = rotation(axis, bend_degrees)
    bent = (points - pivot) @ bend_rotation.T + pivot
    if roll_degrees == 0:
        return bent
    if roll_axis is None or roll_pivot is None:
        raise ValueError("Roll requires source-derived long axis and pivot")
    bent_axis = bend_rotation @ unit(roll_axis)
    bent_pivot = (np.asarray(roll_pivot) - pivot) @ bend_rotation.T + pivot
    roll_rotation = rotation(bent_axis, roll_degrees)
    return (bent - bent_pivot) @ roll_rotation.T + bent_pivot


def strict_triangle_crossings(first, second):
    """AABB broad phase followed by strict six-edge Moller-Trumbore test."""
    first = np.asarray(first, float)
    second = np.asarray(second, float)
    if first.ndim != 3 or second.ndim != 3 or first.shape[1:] != (3, 3) or second.shape[1:] != (3, 3):
        raise ValueError("Triangle arrays must have shape (n,3,3)")
    low_a, high_a = first.min(axis=1), first.max(axis=1)
    low_b, high_b = second.min(axis=1), second.max(axis=1)
    overlaps = np.all(low_a[:, None, :] <= high_b[None, :, :] + 1e-11, axis=2)
    overlaps &= np.all(low_b[None, :, :] <= high_a[:, None, :] + 1e-11, axis=2)
    ai, bi = np.nonzero(overlaps)
    if not len(ai):
        return np.empty((0, 2), int)
    a, b = first[ai], second[bi]
    hit = np.zeros(len(ai), bool)
    for start_tri, target_tri in ((a, b), (b, a)):
        e1 = target_tri[:, 1] - target_tri[:, 0]
        e2 = target_tri[:, 2] - target_tri[:, 0]
        for edge_index in range(3):
            start = start_tri[:, edge_index]
            direction = start_tri[:, (edge_index + 1) % 3] - start
            p = np.cross(direction, e2)
            determinant = np.einsum("ij,ij->i", e1, p)
            valid = abs(determinant) > 1e-11
            inverse = np.divide(1., determinant, out=np.zeros_like(determinant), where=valid)
            distance = start - target_tri[:, 0]
            u = np.einsum("ij,ij->i", distance, p) * inverse
            q = np.cross(distance, e1)
            v = np.einsum("ij,ij->i", direction, q) * inverse
            t = np.einsum("ij,ij->i", e2, q) * inverse
            hit |= valid & (u > 1e-6) & (u < 1 - 1e-6) & (v > 1e-6) & (v < 1 - u - 1e-6) & (t > 1e-6) & (t < 1 - 1e-6)
    return np.column_stack((ai[hit], bi[hit]))


def triangulate(part):
    triangles = []
    labels = []
    source_end = int(part["pre_cap_exterior_polygon_count"])
    for index, face in enumerate(part["faces"]):
        for k in range(1, len(face) - 1):
            triangles.append([face[0], face[k], face[k + 1]])
            labels.append("surface" if index < source_end else "cap")
    return np.asarray(triangles, int), np.asarray(labels)


def center_at(stations, centers, t):
    return np.array([np.interp(t, stations, centers[:, i]) for i in range(3)])


def source_axes(stations, centers):
    def tangent(t):
        return unit(center_at(stations, centers, t + .015) - center_at(stations, centers, t - .015))
    front = np.array([0., 1., 0.])
    axes = {"global_anatomical": unit(np.cross(AXIS, front)),
            "local_elbow": unit(np.cross(tangent(.50), front)),
            "local_upper": unit(np.cross(tangent(.42), front))}
    distal = unit(center_at(stations, centers, .69) - center_at(stations, centers, .61))
    return axes, distal


def edge_error(reference, transformed, triangle_indices):
    edges = np.vstack((triangle_indices[:, [0, 1]], triangle_indices[:, [1, 2]], triangle_indices[:, [2, 0]]))
    before = np.linalg.norm(reference[edges[:, 0]] - reference[edges[:, 1]], axis=1)
    after = np.linalg.norm(transformed[edges[:, 0]] - transformed[edges[:, 1]], axis=1)
    return float(np.max(abs(before - after)))


def category_counts(a, b, indices):
    labels_a, labels_b = a["labels"], b["labels"]
    counts = {"surface_surface": 0, "cap_surface": 0, "cap_cap": 0}
    for i, j in indices:
        types = sorted((labels_a[i], labels_b[j]))
        counts["_".join(types)] += 1
    return counts


def load_source():
    blend = SOURCE_RUN / "candidate/original-guard-solid-arm.blend"
    glb = SOURCE_RUN / "candidate/original-guard-solid-arm.glb"
    if hashlib.sha256(blend.read_bytes()).hexdigest() != BLEND_SHA or hashlib.sha256(glb.read_bytes()).hexdigest() != GLB_SHA:
        raise ValueError("Frozen source model binary changed")
    geometry = json.loads((SOURCE_RUN / "candidate/original-guard-solid-arm-geometry.json").read_text(encoding="utf-8"))
    parts = {}
    for name in ("UpperArmArmor", "ElbowArmor", "ForearmArmor"):
        part = geometry["components"][name]
        triangles, labels = triangulate(part)
        parts[name] = {"vertices": np.asarray(part["vertices"], float),
                       "triangles": triangles, "labels": labels}
    sleeve = geometry["components"]["FlexibleSleeve"]
    stations, centers = np.asarray(sleeve["stations"], float), np.asarray(sleeve["centers"], float)
    return parts, stations, centers


def evaluate_configuration(parts, stations, centers, axes, distal_axis, pivot_t, axis_mode, elbow_follow):
    pivot = center_at(stations, centers, pivot_t)
    roll_pivot = center_at(stations, centers, .69)
    axis = axes[axis_mode]
    samples = []
    worst_edge_error = 0.
    surface_count = 0
    cap_count = 0
    upper_elbow_surface = 0
    for roll, bend in itertools.product(ROLL_DEGREES, BEND_DEGREES):
        transformed = {
            "UpperArmArmor": parts["UpperArmArmor"]["vertices"],
            "ElbowArmor": hinge_transform(parts["ElbowArmor"]["vertices"], pivot, axis, bend * elbow_follow),
            "ForearmArmor": hinge_transform(parts["ForearmArmor"]["vertices"], pivot, axis, bend,
                                             roll, distal_axis, roll_pivot),
        }
        triangles = {name: points[parts[name]["triangles"]] for name, points in transformed.items()}
        collisions = {}
        for first, second in (("UpperArmArmor", "ElbowArmor"),
                              ("UpperArmArmor", "ForearmArmor"),
                              ("ElbowArmor", "ForearmArmor")):
            exact = strict_triangle_crossings(triangles[first], triangles[second])
            result = category_counts(parts[first], parts[second], exact)
            collisions[f"{first}/{second}"] = result
            surface_count += result["surface_surface"]
            cap_count += result["cap_surface"] + result["cap_cap"]
            if first == "UpperArmArmor" and second == "ElbowArmor":
                upper_elbow_surface += result["surface_surface"]
        for name in ("ElbowArmor", "ForearmArmor"):
            worst_edge_error = max(worst_edge_error,
                                   edge_error(parts[name]["vertices"], transformed[name], parts[name]["triangles"]))
        samples.append({"bend_degrees": bend, "roll_degrees": roll, "metal_crossings": collisions})
    return {"pivot_t": pivot_t, "pivot_xyz_m": pivot.tolist(), "hinge_axis": axis.tolist(),
            "axis_mode": axis_mode, "elbow_follow": elbow_follow,
            "poses": samples, "surface_surface_total": surface_count,
            "upper_elbow_surface_surface_total": upper_elbow_surface,
            "cap_involved_total": cap_count, "max_rigid_edge_error_m": worst_edge_error,
            "surface_channel_pass": surface_count == 0 and worst_edge_error < 1e-6}


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes((json.dumps(data, indent=2) + "\n").encode("utf-8"))


def main():
    started = time.perf_counter()
    parts, stations, centers = load_source()
    axes, distal_axis = source_axes(stations, centers)
    configs = list(itertools.product(PIVOTS, AXIS_MODES, ELBOW_FOLLOW))
    if len(configs) > 40:
        raise RuntimeError("Sweep cap exceeded")
    results = []
    for index, (pivot, axis_mode, follow) in enumerate(configs, 1):
        result = evaluate_configuration(parts, stations, centers, axes, distal_axis,
                                        pivot, axis_mode, follow)
        result["configuration_index"] = index
        results.append(result)
        print("HINGE_SWEEP", index, "/", len(configs), pivot, axis_mode, follow,
              "surface", result["surface_surface_total"], "cap", result["cap_involved_total"], flush=True)
    passing = [item for item in results if item["surface_channel_pass"]]
    winner = min(passing, key=lambda item: (item["cap_involved_total"],
                                            abs(item["pivot_t"] - .54), item["elbow_follow"])) if passing else None
    report = {"status": "surface_channel_found_cap_qa_pending" if winner else "no_surface_channel",
              "runtime_publish_allowed": False,
              "scope": "CPU rigid-hinge mechanism only; frozen geometry unchanged",
              "source_binary_sha256": {"blend": BLEND_SHA, "glb": GLB_SHA},
              "sweep_limit": 40, "configurations_tested": len(configs),
              "poses_per_configuration": len(BEND_DEGREES) * len(ROLL_DEGREES),
              "hinge_basis": {key: axis.tolist() for key, axis in axes.items()},
              "distal_roll_axis": distal_axis.tolist(),
              "elapsed_seconds": time.perf_counter() - started,
              "passing_configurations": [item["configuration_index"] for item in passing],
              "winner_configuration_index": winner["configuration_index"] if winner else None,
              "configurations": results}
    write_json(RUN / "qa/sweep-report.json", report)
    if winner:
        write_json(RUN / "candidate/selected-hinge.json",
                   {"status": "candidate_cap_qa_pending", "runtime_publish_allowed": False,
                    "source_binary_sha256": report["source_binary_sha256"],
                    "pivot_t": winner["pivot_t"], "pivot_xyz_m": winner["pivot_xyz_m"],
                    "hinge_axis": winner["hinge_axis"], "axis_mode": winner["axis_mode"],
                    "elbow_follow": winner["elbow_follow"],
                    "distal_roll_axis": distal_axis.tolist(),
                    "surface_surface_total": 0,
                    "cap_involved_total": winner["cap_involved_total"],
                    "max_rigid_edge_error_m": winner["max_rigid_edge_error_m"]})
    print("HINGE_SWEEP_DONE", report["status"], report["winner_configuration_index"],
          report["elapsed_seconds"], flush=True)


if __name__ == "__main__":
    main()
