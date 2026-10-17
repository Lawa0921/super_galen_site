"""Full-mesh and sampled-surface QA for the original grip low-poly candidate."""
from pathlib import Path
import hashlib
import json
import math
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_grip_fit_blender import source_geometry, bvh, inside
from original_guard_grip_fit_math import triangles_cross, axis_local_finger_side
from original_guard_grip_low_math import low_grip_verdict
from original_guard_grip_low_build import RUN, SOURCE, EXPECTED_SOURCE, CHANNEL_ORIGIN, CHANNEL_AXIS

ROOT = Path(__file__).resolve().parents[3]
FIT_RUN = ROOT / "art-factory/rts/runs/original-guard-grip-fit/2026-10-05"
SOURCE_FINGER_CONTACT = FIT_RUN / "qa/finger-side-contact.json"
SAMPLE_SEED = 20261005


def topology(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    seen = set()
    components = 0
    for vertex in bm.verts:
        if vertex.index in seen:
            continue
        components += 1
        stack = [vertex]
        seen.add(vertex.index)
        while stack:
            current = stack.pop()
            for edge in current.link_edges:
                other = edge.other_vert(current)
                if other.index not in seen:
                    seen.add(other.index)
                    stack.append(other)
    result = {"connected_components": components, "boundary_edges": sum(edge.is_boundary for edge in bm.edges),
              "nonmanifold_edges": sum(not edge.is_manifold for edge in bm.edges),
              "winding_edges": sum(edge.is_manifold and not edge.is_contiguous for edge in bm.edges),
              "bmesh_float_zero_area_faces": sum(face.calc_area() == 0 for face in bm.faces)}
    bm.free()
    # BMesh's float-area result underflows for sub-microscopic source triangles.
    # Check exact collinearity in float64 from the stored mesh coordinates too.
    mesh.calc_loop_triangles()
    vertices = np.asarray([tuple(vertex.co) for vertex in mesh.vertices], dtype=np.float64)
    faces = np.asarray([tuple(triangle.vertices) for triangle in mesh.loop_triangles], dtype=np.int32)
    triangles = vertices[faces]
    areas = np.linalg.norm(np.cross(triangles[:, 1]-triangles[:, 0],
                                    triangles[:, 2]-triangles[:, 0]), axis=1) * .5
    result.update({"zero_area_faces": int(np.count_nonzero(areas == 0)),
                   "submicroscopic_triangles_below_1e-10_m2": int(np.count_nonzero(areas < 1e-10)),
                   "minimum_triangle_area_m2": float(areas.min())})
    return result


def uv_coverage(mesh):
    mesh.calc_loop_triangles()
    layer = mesh.uv_layers.active
    if layer is None:
        return {"uv_layer": None, "uv_nonzero_triangle_fraction": 0.}
    areas = []
    geometric_areas = []
    for triangle in mesh.loop_triangles:
        a, b, c = [Vector(layer.data[index].uv) for index in triangle.loops]
        areas.append(abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) * .5)
        p, q, r = [np.asarray(mesh.vertices[index].co, dtype=np.float64) for index in triangle.vertices]
        geometric_areas.append(float(np.linalg.norm(np.cross(q-p, r-p)) * .5))
    areas = np.asarray(areas)
    resolvable = np.asarray(geometric_areas) >= 1e-10
    return {"uv_layer": layer.name, "uv_nonzero_triangle_fraction": float(np.mean(areas > 1e-10)),
            "uv_resolvable_nonzero_fraction": float(np.mean(areas[resolvable] > 1e-10)),
            "uv_resolvable_triangle_count": int(np.count_nonzero(resolvable)),
            "uv_submicroscopic_excluded_count": int(np.count_nonzero(~resolvable)),
            "uv_exact_zero_triangle_count": int(np.count_nonzero(areas == 0)),
            "uv_resolution_basis": "Stored 3D face area >= 1e-10 m2; first-pass all 196 low UV-area faces were below this physical area. Raw fraction remains visible.",
            "uv_triangle_area_min": float(min(areas)), "uv_triangle_area_p50": float(np.median(areas))}


def surface_samples(vertices, faces, amount, rng):
    triangles = vertices[faces]
    areas = np.linalg.norm(np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0]), axis=1) * .5
    chosen = rng.choice(len(faces), size=amount, replace=True, p=areas / areas.sum())
    selected = triangles[chosen]
    u = np.sqrt(rng.random(amount))
    v = rng.random(amount)
    return ((1. - u)[:, None] * selected[:, 0]
            + (u * (1. - v))[:, None] * selected[:, 1]
            + (u * v)[:, None] * selected[:, 2])


def sampled_error(points, tree):
    distances = np.asarray([tree.find_nearest(Vector(point))[3] for point in points], dtype=np.float64)
    return {"samples": len(points), "p50_m": float(np.quantile(distances, .5)),
            "p95_m": float(np.quantile(distances, .95)),
            "p99_m": float(np.quantile(distances, .99)),
            "sampled_max_m": float(distances.max()),
            "interpretation": "Area-weighted random surface samples with fixed seed; quantiles and sampled maximum are not continuous global bounds."}


def main():
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != EXPECTED_SOURCE:
        raise ValueError("Frozen source changed")
    build = json.loads((RUN / "qa/build.json").read_text(encoding="utf-8"))
    low_file = RUN / "candidate/original-guard-grip-low.blend"
    if hashlib.sha256(low_file.read_bytes()).hexdigest() != build["sha256"]["blend"]:
        raise ValueError("Low-poly checkpoint changed")
    fit_contacts = json.loads(SOURCE_FINGER_CONTACT.read_text(encoding="utf-8"))
    if not fit_contacts["verdict"]["pass"]:
        raise ValueError("Frozen high-poly finger-side fit was not accepted")
    high, high_faces = source_geometry(SOURCE, "OriginalGripRigidFitReviewOnly")
    low, low_faces = source_geometry(low_file, "OriginalGripLowCandidate")
    low_obj = bpy.data.objects["OriginalGripLowCandidate"]
    sword_obj = bpy.data.objects["KingdomSteelSword_LOD0"]
    sword_obj.data.calc_loop_triangles()
    sword = np.asarray([tuple(sword_obj.matrix_world @ vertex.co) for vertex in sword_obj.data.vertices], dtype=np.float64)
    sword_faces = np.asarray([tuple(triangle.vertices) for triangle in sword_obj.data.loop_triangles], dtype=np.int32)
    high_tree = bvh(high, high_faces)
    low_tree = bvh(low, low_faces)
    sword_tree = bvh(sword, sword_faces)
    metrics = {"triangles": len(low_faces), **topology(low_obj.data), **uv_coverage(low_obj.data),
               "protected_input_vertices": build["protected_input_vertices"],
               "protected_vertices_kept_exact": build["protected_vertices_kept_exact"]}
    sword_topology = topology(sword_obj.data)
    overlaps = low_tree.overlap(sword_tree)
    crossings = [(int(li), int(si)) for li, si in overlaps if triangles_cross(low[low_faces[li]], sword[sword_faces[si]])]
    contained = [int(i) for i, vertex in enumerate(sword) if inside(low_tree, vertex)]
    whole_parity_positive = [int(i) for i, vertex in enumerate(low) if inside(sword_tree, vertex)]
    metrics.update({"bvh_sword_candidate_pairs": len(overlaps), "exact_sword_crossings": len(crossings),
                    "exact_sword_crossing_examples": crossings[:10], "sword_vertices_inside_glove": len(contained),
                    "contained_sword_vertex_examples": contained[:10],
                    "whole_sword_parity_positive_glove_vertices": len(whole_parity_positive),
                    "whole_sword_parity_positive_examples": whole_parity_positive[:10],
                    "closed_sword_component_containment_complete": False,
                    "glove_vertices_confirmed_inside_closed_sword_components": None})
    metrics["whole_sword_parity_positive_records"] = [
        {"vertex": index, "world_point_m": low[index].tolist(),
         "source_local_point_m": list(low_obj.matrix_world.inverted() @ Vector(low[index])),
         "nearest_sword_surface_gap_m": float(sword_tree.find_nearest(Vector(low[index]))[3]),
         "nearest_sword_triangle": int(sword_tree.find_nearest(Vector(low[index]))[2]),
         "nearest_high_surface_gap_m": float(high_tree.find_nearest(Vector(low[index]))[3]),
         "nearest_high_surface_point_inside_sword": bool(inside(sword_tree, high_tree.find_nearest(Vector(low[index]))[0]))}
        for index in whole_parity_positive]
    local_diagnosis = json.loads((RUN / "qa/vertex-3262-containment-diagnosis.json").read_text(encoding="utf-8"))
    if (local_diagnosis["candidate_blend_sha256"] != build["sha256"]["blend"]
            or whole_parity_positive != [local_diagnosis["vertex"]]):
        raise ValueError("Local parity counterexample does not match candidate QA")
    metrics["locally_disproved_joined_parity_positives"] = int(
        not local_diagnosis["point_inside_any_closed_component_by_majority"]
        and all(not edge["whole_sword_segment_hit_from_point"]
                and not edge["whole_sword_segment_hit_from_neighbor"]
                for edge in local_diagnosis["incident_glove_edges"]))
    local_axis = Vector(CHANNEL_AXIS).normalized()
    matrix = low_obj.matrix_world
    world_axis = (matrix.to_3x3() @ local_axis).normalized()
    world_origin = matrix @ Vector(CHANNEL_ORIGIN)
    axis_hit = low_tree.ray_cast(world_origin - world_axis * .25, world_axis, .5)[0] is not None
    axis_distances = []
    for z in np.linspace(.075, .255, 19):
        local = Vector(CHANNEL_ORIGIN) + local_axis * (float(z) - CHANNEL_ORIGIN[2])
        world = matrix @ local
        axis_distances.append(float(low_tree.find_nearest(world)[3]))
    metrics.update({"central_axis_hit": axis_hit,
                    "bore_axis_minimum_sample_distance_m": min(axis_distances),
                    "bore_axis_sample_distances_m": axis_distances})
    # Compare low triangle orientation to the nearby original source surface.
    low_tri = low[low_faces]
    cross = np.cross(low_tri[:, 1] - low_tri[:, 0], low_tri[:, 2] - low_tri[:, 0])
    normals = cross / np.linalg.norm(cross, axis=1)[:, None]
    centres = low_tri.mean(axis=1)
    nearest_high = [high_tree.find_nearest(Vector(point)) for point in centres]
    normal_dots = np.asarray([float(np.dot(normal, np.asarray(hit[1]))) for normal, hit in zip(normals, nearest_high)])
    near_high = np.asarray([hit[3] <= .002 for hit in nearest_high])
    opposed = np.flatnonzero(near_high & (normal_dots < -.2))
    inverse_matrix = low_obj.matrix_world.inverted()
    axis = np.asarray(CHANNEL_AXIS, dtype=np.float64)
    axis /= np.linalg.norm(axis)
    origin = np.asarray(CHANNEL_ORIGIN, dtype=np.float64)
    opposition_records = []
    for i in opposed:
        local = np.asarray(inverse_matrix @ Vector(centres[i]), dtype=np.float64)
        offset = local - origin
        radial = float(np.linalg.norm(offset - np.dot(offset, axis) * axis))
        opposition_records.append({"triangle": int(i), "source_nearest_triangle": int(nearest_high[i][2]),
                     "source_local_center_m": local.tolist(),
                     "axis_local_radial_distance_m": radial,
                     "geometric_roi": "channel_wall_neighborhood" if .065 <= local[2] <= .28 and abs(radial-.02728495049705316) < .003 else "exterior_or_transition",
                     "triangle_area_m2": float(np.linalg.norm(cross[i]) * .5),
                     "nearest_high_gap_m": float(nearest_high[i][3]), "normal_dot": float(normal_dots[i]),
                     "normal_angle_degrees": float(math.degrees(math.acos(np.clip(normal_dots[i], -1., 1.))))})
    metrics.update({"near_source_normal_oppositions": len(opposed),
                    "near_source_normal_opposition_triangle_examples": opposed[:10].tolist(),
                    "near_source_normal_opposition_records": opposition_records,
                    "near_source_normal_opposition_rule": "Triangle-centre nearest high-poly face <=2 mm away and low/high face-normal dot < -0.2. This is not a topological winding defect or a mesh self-intersection proof.",
                    "local_face_normal_dot_p01": float(np.quantile(normal_dots, .01)),
                    "local_face_near_source_count": int(near_high.sum())})
    rng = np.random.default_rng(SAMPLE_SEED)
    high_error = sampled_error(surface_samples(high, high_faces, 25000, rng), low_tree)
    low_error = sampled_error(surface_samples(low, low_faces, 15000, rng), high_tree)
    metrics.update({"high_to_low_sample_p95_m": high_error["p95_m"],
                    "low_to_high_sample_p95_m": low_error["p95_m"]})
    sword_samples = np.vstack((sword, sword[sword_faces].mean(axis=1)))
    sword_nearest = [low_tree.find_nearest(Vector(point)) for point in sword_samples]
    sword_gaps = np.asarray([hit[3] for hit in sword_nearest])
    sword_radial = np.linalg.norm(sword_samples[:, :2] - [.45, .075], axis=1)
    fingers = []
    inverse = matrix.inverted()
    for old_zone in fit_contacts["zones"]:
        zlo, zhi = old_zone["sword_z_window_m"]
        on_wrap = np.zeros(len(sword_samples), dtype=bool)
        for band in range(7):
            low_z = .82 + band * .026
            high_z = low_z + .008
            on_wrap |= (sword_samples[:, 2] >= max(low_z, zlo)) & (sword_samples[:, 2] <= min(high_z, zhi))
        zone_indices = np.flatnonzero(on_wrap & (sword_radial > .0225) & (sword_radial < .027))
        accepted, too_close, too_far = [], [], []
        for sample_id in zone_indices:
            nearest_world = sword_nearest[sample_id][0]
            source_local = inverse @ nearest_world
            side = axis_local_finger_side(source_local, CHANNEL_ORIGIN, CHANNEL_AXIS)
            if not side["finger_side"]:
                continue
            gap = float(sword_gaps[sample_id])
            record = {"sword_sample_id": int(sample_id), "nearest_low_triangle": int(sword_nearest[sample_id][2]),
                      "sword_surface_point_m": sword_samples[sample_id].tolist(),
                      "nearest_low_point_m": list(nearest_world), "gap_m": gap,
                      "finger_side_azimuth_degrees": side["azimuth_degrees"]}
            if gap < .0003:
                too_close.append(record)
            elif gap <= .0008:
                accepted.append(record)
            else:
                too_far.append(record)
        fingers.append({"finger_from_guard": old_zone["finger_from_guard"],
                        "source_z_window_m": old_zone["source_z_window_m"],
                        "sword_z_window_m": old_zone["sword_z_window_m"],
                        "highpoly_finger_side_near_count": old_zone["finger_side_near_count"],
                        "lowpoly_finger_side_near_count": len(accepted),
                        "lowpoly_distinct_contact_triangles": len(set(x["nearest_low_triangle"] for x in accepted)),
                        "closest_finger_side_gap_m": min((x["gap_m"] for x in accepted), default=None),
                        "too_close_count": len(too_close), "too_far_count": len(too_far),
                        "accepted_samples": accepted, "too_close_examples": too_close[:5], "too_far_examples": too_far[:5]})
    metrics.update({"four_finger_side_contacts": [zone["lowpoly_finger_side_near_count"] for zone in fingers],
                    "four_finger_side_distinct_faces": [zone["lowpoly_distinct_contact_triangles"] for zone in fingers],
                    "four_finger_side_closest_gap_m": [zone["closest_finger_side_gap_m"] for zone in fingers]})
    verdict = low_grip_verdict(metrics)
    if axis_hit:
        verdict["checks"]["protected_bore_preserved"] = False
        verdict["pass"] = False
    report = {"status": "candidate_geometry_pass" if verdict["pass"] else "qa_failed",
              "runtime_publish_allowed": False,
              "source_fit_blend_sha256": EXPECTED_SOURCE,
              "candidate_sha256": build["sha256"], "sample_seed": SAMPLE_SEED,
              "sample_method": "Area-weighted deterministic barycentric mesh samples; reported p95, p99 and sampled maxima do not bound all surface points.",
              "metrics": metrics,
              "crossing_records": [{"low_triangle": li, "sword_triangle": si,
                                    "low_source_local_center_m": list(inverse_matrix @ Vector(low[low_faces[li]].mean(axis=0)))}
                                   for li, si in crossings],
              "surface_sample_error": {"high_to_low": high_error, "low_to_high": low_error},
              "finger_contact": fingers, "verdict": verdict,
              "scope_notes": {"low_mesh_self_intersection": "not measured",
                              "sword_topology": sword_topology,
                              "glove_point_inside_sword": "Joined-shell parity produced one positive, but local per-component and incident-edge checks disprove it as physical containment. Full closed-component containment was not scanned, so no global zero-containment claim is made.",
                              "local_containment_diagnosis": "qa/vertex-3262-containment-diagnosis.json",
                              "own_winding": "Measured by winding_edges; zero inconsistent edges is separate from nearest-source normal opposition.",
                              "normal_opposition": "Conservative sample rejection near source creases; not proof of true inverted topology or sword penetration."},
              "source_constraints": ["Rounded fingertip forms", "Unaccepted thumb web", "Closed wrist opening"]}
    path = RUN / "qa/geometry.json"
    path.write_bytes((json.dumps(report, indent=2) + "\n").encode("utf-8"))
    print("GRIP_LOW_QA " + json.dumps({"verdict": verdict, "triangles": metrics["triangles"],
                                   "contacts": metrics["four_finger_side_contacts"],
                                   "surface_p95_m": [high_error["p95_m"], low_error["p95_m"]],
                                   "near_source_normal_oppositions": len(opposed), "exact_sword_crossings": len(crossings),
                                   "contained_sword_vertices": len(contained),
                                   "joined_parity_positive_glove_vertices": len(whole_parity_positive),
                                   "local_parity_false_positives": metrics["locally_disproved_joined_parity_positives"]}), flush=True)


if __name__ == "__main__":
    main()
