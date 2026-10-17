"""Audit the actual project sword against a rigidly placed original grip candidate."""
from pathlib import Path
import hashlib
import json
import math
import sys
import time

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_grip_fit_math import (
    rigid_fit, transform_points, triangles_cross, fit_verdict,
    axis_local_finger_side, finger_side_fit_verdict,
)

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / "art-factory/rts/runs"
RUN = BASE / "original-guard-grip-fit/2026-10-05"
GLOVE = BASE / "original-guard-grip-channel/2026-10-05/candidate/original-guard-grip-channel.blend"
SWORD = BASE / "guard-neural-pilot/production-v1/candidate/guard-production-v1.blend"
EXPECTED_GLOVE = "314e914e04a8a6a095338afe1c6d558a7976639796ebc6c81a7dad71001f9628"
EXPECTED_SWORD = "61f426ec6df5865798d34cd79ea6bd34472a60c04661e0a2fb971da8003bebf2"
SOURCE_ORIGIN = [.0696278259687629, .020799771149057955, .17]
SOURCE_AXIS = [-.011295106135510071, .0011887328837747986, .9999355016657416]
TARGET = [.45, .075, .904]


def source_geometry(path, name):
    bpy.ops.wm.open_mainfile(filepath=str(path))
    obj = bpy.data.objects[name]
    obj.data.calc_loop_triangles()
    vertices = np.asarray([tuple(obj.matrix_world @ vertex.co) for vertex in obj.data.vertices], dtype=np.float64)
    faces = np.asarray([tuple(triangle.vertices) for triangle in obj.data.loop_triangles], dtype=np.int32)
    return vertices, faces


def bvh(vertices, faces):
    return BVHTree.FromPolygons(vertices.tolist(), faces.tolist(), all_triangles=True, epsilon=0)


def inside(tree, position):
    """Three ray parity votes avoid tangencies and coincident edge artefacts."""
    votes = []
    for vector in [(1., .173, .311), (-.417, 1., .239), (.181, -.393, 1.)]:
        direction = Vector(vector).normalized()
        origin = Vector(position) + direction * 1e-6
        count = 0
        for _ in range(64):
            hit, _, _, distance = tree.ray_cast(origin, direction, 2.0)
            if hit is None:
                break
            count += 1
            origin = hit + direction * 1e-5
        votes.append(count % 2)
    return sum(votes) >= 2


def diagnose(scale, spin_degrees):
    for path, expected in [(GLOVE, EXPECTED_GLOVE), (SWORD, EXPECTED_SWORD)]:
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != expected:
            raise ValueError(f"Source changed: {path.name} {actual}")
    glove, glove_faces = source_geometry(GLOVE, "OriginalGripChannelCandidate")
    sword, sword_faces = source_geometry(SWORD, "KingdomSteelSword_LOD0")
    rotation, translation = rigid_fit(SOURCE_ORIGIN, SOURCE_AXIS, TARGET, scale, math.radians(spin_degrees))
    placed = transform_points(glove, rotation, translation, scale)
    started = time.perf_counter()
    glove_tree = bvh(placed, glove_faces)
    sword_tree = bvh(sword, sword_faces)
    candidates = glove_tree.overlap(sword_tree)
    crossings = [(int(gi), int(si)) for gi, si in candidates if triangles_cross(placed[glove_faces[gi]], sword[sword_faces[si]])]
    # Full containment is separate from triangle crossings. Every sword vertex
    # belongs to the actual source mesh; points on the boundary are inconclusive.
    contained = [int(i) for i, point in enumerate(sword) if inside(glove_tree, point)]
    # Query actual sword vertices and triangle centres; a band needs several
    # nearby samples in each of four longitudinal finger zones.
    centres = sword[sword_faces].mean(axis=1)
    samples = np.vstack((sword, centres))
    sample_nearest = [glove_tree.find_nearest(Vector(point)) for point in samples]
    gaps = np.asarray([hit[3] if hit[0] is not None else float("inf") for hit in sample_nearest])
    guard_mask = ((samples[:, 2] >= .775) & (samples[:, 2] <= .809)) | (
        (samples[:, 2] >= .792) & (samples[:, 2] <= .843) & (np.abs(samples[:, 0] - .45) > .035))
    pommel_mask = samples[:, 2] >= 1.0015
    guard_gap = float(gaps[guard_mask].min())
    pommel_gap = float(gaps[pommel_mask].min())
    finger_windows = [[.073, .111], [.112, .150], [.151, .189], [.190, .228]]
    fingers = []
    for index, (lo, hi) in enumerate(finger_windows, start=1):
        zlo = TARGET[2] + scale * (lo - SOURCE_ORIGIN[2])
        zhi = TARGET[2] + scale * (hi - SOURCE_ORIGIN[2])
        # The seven raised wrap bands are 0.82 + i * .026 to +.008.
        eligible = np.zeros(len(samples), dtype=bool)
        for band in range(7):
            low = .82 + band * .026
            high = low + .008
            eligible |= (samples[:, 2] >= max(low, zlo)) & (samples[:, 2] <= min(high, zhi))
        radial = np.linalg.norm(samples[:, :2] - TARGET[:2], axis=1)
        eligible &= (radial > .0225) & (radial < .027)
        distances = gaps[eligible]
        contact_ids = np.flatnonzero(eligible & (gaps >= .0003) & (gaps <= .0008))
        example = None
        if len(contact_ids):
            sample_id = int(contact_ids[np.argmin(gaps[contact_ids])])
            nearest_world = np.asarray(sample_nearest[sample_id][0], dtype=np.float64)
            nearest_source = (nearest_world - translation) @ rotation / scale
            local_axis_x = SOURCE_ORIGIN[0] + SOURCE_AXIS[0] * (nearest_source[2] - SOURCE_ORIGIN[2])
            example = {"sword_surface_point_m": samples[sample_id].tolist(),
                       "nearest_glove_point_m": nearest_world.tolist(),
                       "nearest_glove_source_point_m": nearest_source.tolist(),
                       "finger_side_offset_from_axis_m": float(nearest_source[0] - local_axis_x),
                       "gap_m": float(gaps[sample_id])}
        fingers.append({"finger_from_guard": index, "source_z_window_m": [lo, hi], "sword_z_window_m": [zlo, zhi],
                        "wrap_samples": len(distances), "closest_gap_m": float(distances.min()) if len(distances) else None,
                        "samples_within_0p8mm": len(contact_ids), "contact_example": example})
    result = {"status": "diagnostic", "source_sha256": {"glove_blend": EXPECTED_GLOVE, "sword_blend": EXPECTED_SWORD},
              "scale": scale, "spin_degrees": spin_degrees, "rotation": rotation.tolist(), "translation": translation.tolist(),
              "bvh_candidate_pairs": len(candidates), "exact_triangle_crossings": len(crossings),
              "crossing_examples": crossings[:20], "sword_vertices_contained_in_glove": len(contained),
              "contained_vertex_examples": contained[:20], "fingers": fingers,
              "crossguard_and_ricasso_minimum_sample_gap_m": guard_gap,
              "pommel_minimum_sample_gap_m": pommel_gap,
              "minimum_surface_sample_gap_m": float(gaps.min()), "seconds": time.perf_counter() - started,
              "note": "Exact crossing and point containment are separate; BVH overlap count alone is not a verdict."}
    result["verdict"] = fit_verdict(len(crossings), len(contained), fingers, guard_gap, pommel_gap)
    RUN.joinpath("qa").mkdir(parents=True, exist_ok=True)
    path = RUN / "qa" / f"diagnose-s{scale:.3f}-spin{spin_degrees:g}.json"
    path.write_bytes((json.dumps(result, indent=2) + "\n").encode("utf-8"))
    print("FIT_DIAGNOSE " + json.dumps(result), flush=True)


def finger_side_supplement():
    """Recheck near-wrap samples against source-axis finger half-space.

    This writes a separate report. The frozen fit diagnosis and all geometry
    artifacts remain byte-for-byte untouched.
    """
    original_path = RUN / "qa/diagnose-s0.900-spin90.json"
    original = json.loads(original_path.read_text(encoding="utf-8"))
    if original["scale"] != .9 or original["spin_degrees"] != 90.:
        raise ValueError("Frozen fit transform changed")
    candidate = json.loads((RUN / "qa/candidate.json").read_text(encoding="utf-8"))
    for source, expected in [(GLOVE, EXPECTED_GLOVE), (SWORD, EXPECTED_SWORD)]:
        if hashlib.sha256(source.read_bytes()).hexdigest() != expected:
            raise ValueError(f"Source changed: {source}")
    for suffix in ("blend", "glb"):
        path = RUN / "candidate" / ("original-guard-grip-fit." + suffix)
        if hashlib.sha256(path.read_bytes()).hexdigest() != candidate["sha256"][suffix]:
            raise ValueError(f"Frozen candidate changed: {path}")
    glove, glove_faces = source_geometry(GLOVE, "OriginalGripChannelCandidate")
    sword, sword_faces = source_geometry(SWORD, "KingdomSteelSword_LOD0")
    scale = original["scale"]
    rotation, translation = rigid_fit(SOURCE_ORIGIN, SOURCE_AXIS, TARGET, scale, math.radians(original["spin_degrees"]))
    if not np.allclose(rotation, original["rotation"], atol=1e-12, rtol=0) or not np.allclose(
        translation, original["translation"], atol=1e-12, rtol=0
    ):
        raise ValueError("Frozen transform does not reproduce")
    glove_tree = bvh(transform_points(glove, rotation, translation, scale), glove_faces)
    samples = np.vstack((sword, sword[sword_faces].mean(axis=1)))
    nearest = [glove_tree.find_nearest(Vector(point)) for point in samples]
    gaps = np.asarray([hit[3] if hit[0] is not None else float("inf") for hit in nearest])
    radial = np.linalg.norm(samples[:, :2] - TARGET[:2], axis=1)
    zones = []
    for previous in original["fingers"]:
        zlo, zhi = previous["sword_z_window_m"]
        on_wrap = np.zeros(len(samples), dtype=bool)
        for band in range(7):
            low = .82 + band * .026
            high = low + .008
            on_wrap |= (samples[:, 2] >= max(low, zlo)) & (samples[:, 2] <= min(high, zhi))
        near = on_wrap & (radial > .0225) & (radial < .027) & (gaps >= .0003) & (gaps <= .0008)
        accepted, rejected = [], []
        for sample_id in np.flatnonzero(near):
            world = np.asarray(nearest[sample_id][0], dtype=np.float64)
            source = (world - translation) @ rotation / scale
            side = axis_local_finger_side(source, SOURCE_ORIGIN, SOURCE_AXIS)
            record = {"sample_id": int(sample_id), "sword_surface_point_m": samples[sample_id].tolist(),
                      "nearest_glove_point_m": world.tolist(), "nearest_glove_source_point_m": source.tolist(),
                      "gap_m": float(gaps[sample_id]), **side}
            (accepted if side["finger_side"] else rejected).append(record)
        zones.append({"finger_from_guard": previous["finger_from_guard"],
                      "source_z_window_m": previous["source_z_window_m"],
                      "sword_z_window_m": previous["sword_z_window_m"],
                      "original_near_count": int(previous["samples_within_0p8mm"]),
                      "recomputed_near_count": len(accepted) + len(rejected),
                      "finger_side_near_count": len(accepted), "opposite_side_near_count": len(rejected),
                      "finger_side_azimuth_range_degrees": [min(x["azimuth_degrees"] for x in accepted),
                                                           max(x["azimuth_degrees"] for x in accepted)] if accepted else None,
                      "finger_side_offset_range_m": [min(x["finger_side_offset_m"] for x in accepted),
                                                     max(x["finger_side_offset_m"] for x in accepted)] if accepted else None,
                      "closest_finger_side_gap_m": min((x["gap_m"] for x in accepted), default=None),
                      "contact_example": min(accepted, key=lambda item: item["gap_m"]) if accepted else None,
                      "finger_side_samples": accepted, "opposite_side_samples": rejected})
    side_verdict = finger_side_fit_verdict(zones)
    counts_reproduced = all(zone["original_near_count"] == zone["recomputed_near_count"] for zone in zones)
    verdict = {"pass": original["verdict"]["pass"] and side_verdict["pass"] and counts_reproduced,
               "baseline_full_mesh_checks_pass": original["verdict"]["pass"],
               "near_counts_reproduced": counts_reproduced,
               "finger_side_zone_pass": side_verdict["zone_pass"]}
    report = {"status": "finger_side_contact_supplement", "runtime_publish_allowed": False,
              "method": "Source-local +X projected perpendicular to measured channel axis; strict positive signed half-space. Azimuth is atan2 about that same axis. A longitudinal window and wrap radius alone do not qualify a finger-side contact.",
              "finger_side_half_space": "axis-local signed +X > 0 m (open boundary; azimuth within -90 to +90 degrees)",
              "source_channel_axis": {"origin_m": SOURCE_ORIGIN, "direction": SOURCE_AXIS},
              "near_gap_m": [.0003, .0008], "source_sha256": original["source_sha256"],
              "candidate_sha256": candidate["sha256"],
              "frozen_diagnosis_sha256": hashlib.sha256(original_path.read_bytes()).hexdigest(),
              "zones": zones, "verdict": verdict,
              "limitations": ["Four axial zones and the finger-side half-space are geometric proxies, not semantic finger-pad segmentation.",
                              "Guard and pommel values in the frozen report are discrete sample gaps, not continuous surface lower bounds."]}
    output = RUN / "qa/finger-side-contact.json"
    output.write_bytes((json.dumps(report, indent=2) + "\n").encode("utf-8"))
    print("FIT_FINGER_SIDE " + json.dumps({"verdict": verdict,
                                          "counts": [zone["finger_side_near_count"] for zone in zones],
                                          "opposite": [zone["opposite_side_near_count"] for zone in zones],
                                          "qa_path": str(output)}), flush=True)


if __name__ == "__main__":
    arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if arguments and arguments[0] == "--finger-side-supplement":
        finger_side_supplement()
    else:
        diagnose(float(arguments[0]) if arguments else .9, float(arguments[1]) if len(arguments) > 1 else 90.)
