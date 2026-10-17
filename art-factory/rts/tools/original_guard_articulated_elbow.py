"""Source-bound complete elbow ROI: original outer plates, couter, and cloth.

Only the elbow armor and proximal forearm are rebuilt. This file never writes
to the runtime asset tree. The generated meshes remain factory candidates.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
import trimesh

from original_guard_solid_arm import (AXIS, AXIS_LENGTH, AXIS_START, SOURCE,
                                      SOURCE_SHA, boundary_loops, build_arm_piece,
                                      cap_cut_loops, source_geometry, triangulate,
                                      triangulate_planar_loop, write_json)
from original_guard_arm_hinge import center_at, hinge_transform, rotation, source_axes
from source_fit_cage import align_ring, contour_resample, select_local_loop

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-articulated-elbow/2026-10-05"
PIVOT_T = .48
AXIS_MODE = "global_anatomical"
ROI = (.37, .72)


def station(points):
    return (np.asarray(points, float) - AXIS_START) @ AXIS / AXIS_LENGTH


def source_boundary_fingerprint(vertices, faces, lo, hi):
    """Hash unmodified source polygons whose full vertex cycles lie outside ROI."""
    vertices = np.asarray(vertices, float)
    t = station(vertices)
    selected = [face for face in faces if vertices[face, 0].mean() > .2 and
                (np.max(t[face]) < lo - 1e-8 or np.min(t[face]) > hi + 1e-8)]
    payload = [(face, np.round(vertices[face], 9).tolist()) for face in selected]
    return hashlib.sha256(json.dumps(payload, separators=(",", ":")).encode()).hexdigest()


def valid_solid(part):
    mesh = trimesh.Trimesh(vertices=np.asarray(part["vertices"]),
                           faces=triangulate(part["faces"]), process=False)
    if not mesh.is_watertight or not mesh.is_winding_consistent or abs(mesh.volume) < 1e-8:
        raise ValueError("Generated section is not a closed, consistently wound solid")
    tri = np.asarray(part["vertices"])[triangulate(part["faces"])]
    areas = np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1)
    if areas.min() < 1e-9:
        raise ValueError("Zero-area armor or sleeve triangle")
    if mesh.volume < 0:
        part["faces"] = [list(reversed(face)) for face in part["faces"]]
        mesh.invert()
    part["qa"] = {"closed": True, "winding_consistent": True,
                  "minimum_double_triangle_area_m2": float(areas.min()),
                  "volume_m3": float(mesh.volume), "triangles": len(mesh.faces)}
    return part


def build_forearm(vertices, faces):
    """Attach three asymmetric source-perimeter mouth rows to the .72 cut."""
    part = build_arm_piece(vertices, faces, .72, .96)
    points = np.asarray(part["vertices"], float).tolist()
    exterior_count = part["pre_cap_exterior_polygon_count"]
    exterior = part["faces"][:exterior_count]
    cap = [face for face in part["faces"][exterior_count:]
           if np.mean(station(np.asarray(points)[face])) > .84]
    loops = boundary_loops(exterior)
    proximal = [loop for loop in loops if abs(np.mean(station(np.asarray(points)[loop])) - .72) < .002]
    if len(proximal) != 1:
        raise ValueError("Expected one source proximal forearm perimeter")
    loop = proximal[0]
    origin = np.asarray(points)[loop]
    center = np.mean(origin, axis=0)
    radial = origin - center
    radial -= np.outer(radial @ AXIS, AXIS)
    front = np.array([0., 1., 0.])
    cosine = radial @ front / np.maximum(np.linalg.norm(radial, axis=1), 1e-9)
    rows = [loop]
    for targets, scale in (((.714 + 0 * cosine), 1.005),
                           ((.695 + .013 * cosine), .975),
                           ((.68 + .025 * cosine), .92)):
        ids = []
        for base, rv, t in zip(origin, radial, targets):
            ids.append(len(points))
            points.append((base + (t - .72) * AXIS_LENGTH * AXIS + (scale - 1) * rv).tolist())
        rows.append(ids)
    rebuilt = list(exterior)
    for old, new in zip(rows[:-1], rows[1:]):
        for j in range(len(old)):
            k = (j + 1) % len(old)
            rebuilt.append([old[k], old[j], new[j], new[k]])
    # The mouth rolls inward under the couter. Its return and nonplanar inner
    # closure are hidden geometry, classified separately by the QA sweep.
    last = rows[-1]
    inner = []
    for idx in last:
        point = np.asarray(points[idx]); t = station(point)
        rv = point - center
        rv -= np.dot(rv, AXIS) * AXIS
        inner.append(len(points))
        points.append((point - .17 * rv + .006 * AXIS_LENGTH * AXIS).tolist())
    for j in range(len(last)):
        k = (j + 1) % len(last)
        rebuilt.append([last[k], last[j], inner[j], inner[k]])
    # A fan is kept deep behind the mouth; the last band is a return wall.
    center_id = len(points)
    points.append(np.asarray(points)[inner].mean(axis=0).tolist())
    for j in range(len(inner)):
        rebuilt.append([inner[(j + 1) % len(inner)], inner[j], center_id])
    part.update(vertices=points, faces=rebuilt + cap,
                pre_cap_exterior_polygon_count=len(exterior) + (len(rows)-1)*len(loop),
                design={"source_boundary_t": .72, "mouth_rows": 3,
                        "inner_edge_shortens": True, "outer_edge_extends": True,
                        "hidden_return_faces": len(rebuilt)-len(exterior)-(len(rows)-1)*len(loop)})
    return valid_solid(part)


def polar_source_profile(mesh, t, angles, u, v):
    hint = AXIS_START + t * AXIS_LENGTH * AXIS
    section = mesh.section(plane_origin=hint, plane_normal=AXIS)
    if section is None:
        raise ValueError(f"Source elbow section absent at {t}")
    loop = select_local_loop(section.discrete, hint, AXIS, .22, .11)
    center = (loop.min(axis=0) + loop.max(axis=0)) * .5
    center -= np.dot(center - hint, AXIS) * AXIS
    delta = loop - center
    theta = np.mod(np.arctan2(delta @ v, delta @ u), 2*np.pi)
    radius = np.linalg.norm(delta - np.outer(delta @ AXIS, AXIS), axis=1)
    order = np.argsort(theta)
    theta, radius = theta[order], radius[order]
    theta = np.r_[theta[-1] - 2*np.pi, theta, theta[0] + 2*np.pi]
    radius = np.r_[radius[-1], radius, radius[0]]
    return center, np.interp(np.mod(angles, 2*np.pi), theta, radius)


def build_couter(vertices, faces):
    """Convex source-profile shield wrapping the outside of the fixed hinge."""
    source = trimesh.Trimesh(vertices=vertices, faces=triangulate(faces), process=False)
    u = np.array([0., 1., 0.]); u -= np.dot(u, AXIS)*AXIS; u /= np.linalg.norm(u)
    v = np.cross(AXIS, u); v /= np.linalg.norm(v)
    angles = np.linspace(np.deg2rad(65), np.deg2rad(295), 25)
    stations = np.array([.410, .435, .460, .485, .510, .535, .560, .585, .610])
    outer, inner = [], []
    for t in stations:
        center, radius = polar_source_profile(source, float(t), angles, u, v)
        convexity = np.sin(np.pi * (t - stations[0]) / (stations[-1] - stations[0]))
        angular = np.sin(np.pi * (angles - angles[0]) / (angles[-1] - angles[0]))
        radius = radius * (.92 + .14 * angular) + .008 * convexity * angular
        rays = np.outer(np.cos(angles), u) + np.outer(np.sin(angles), v)
        outer.extend((center + radius[:, None] * rays).tolist())
        inner.extend((center + (radius - .004)[:, None] * rays + .002 * AXIS).tolist())
    m, n = len(stations), len(angles)
    points = outer + inner
    faces_out = []
    labels = []
    for i in range(m-1):
        for j in range(n-1):
            a = i*n+j; b = a+1; c = a+n; d = c+1
            faces_out.append([a, c, d, b])
            labels.append("presentation")
            offset = m*n
            faces_out.append([offset+b, offset+d, offset+c, offset+a])
            labels.append("hidden_return")
    for i in range(m-1):
        for j in (0, n-1):
            a=i*n+j; b=(i+1)*n+j; o=m*n
            faces_out.append([a, o+a, o+b, b] if j == 0 else [b, o+b, o+a, a])
            labels.append("hidden_return")
    for j in range(n-1):
        a=j; b=j+1; o=m*n
        faces_out.append([b, o+b, o+a, a])
        labels.append("hidden_return")
        a=(m-1)*n+j; b=a+1
        faces_out.append([a, o+a, o+b, b])
        labels.append("hidden_return")
    part = {"vertices": points, "faces": faces_out,
            "face_labels": labels,
            "pre_cap_exterior_polygon_count": (m-1)*(n-1),
            "source_type": "Quadri elbow contour sampled at nine ROI stations",
            "design": {"source_stations": stations.tolist(), "arc_degrees": [65, 295],
                       "thickness_m": .004, "convexity_max_m": .008,
                       "pivot_t": .48, "rigid_follow_fraction": .5}}
    return valid_solid(part)


def build_sleeve(vertices, faces):
    source = trimesh.Trimesh(vertices=vertices, faces=triangulate(faces), process=False)
    stations = np.linspace(.365, .735, 9)
    rings, centers = [], []
    for t in stations:
        hint = AXIS_START + t*AXIS_LENGTH*AXIS
        loop = select_local_loop(source.section(plane_origin=hint, plane_normal=AXIS).discrete,
                                 hint, AXIS, .22, .11)
        center = (loop.min(axis=0) + loop.max(axis=0)) * .5
        center -= np.dot(center-hint, AXIS)*AXIS
        ring = contour_resample(loop, center, AXIS, 32)
        if rings:
            ring = align_ring(rings[-1], ring)
        fill = .90 + .05 * np.sin(np.pi * (t-stations[0])/(stations[-1]-stations[0]))
        rings.append(center + fill * (ring-center))
        centers.append(center)
    points = np.asarray(rings).reshape(-1, 3)
    faces_out = []
    for i in range(8):
        for j in range(32):
            k = (j+1)%32
            faces_out.append([i*32+j, i*32+k, (i+1)*32+k, (i+1)*32+j])
    points, faces_out = cap_cut_loops(points, faces_out, AXIS)
    x = np.repeat(np.linspace(0, 1, 9), 32)
    weights = np.column_stack(((1-x)**2, 2*x*(1-x), x*x))
    part = {"vertices": points.tolist(), "faces": faces_out,
            "pre_cap_exterior_polygon_count": 8*32,
            "stations": stations.tolist(), "centers": np.asarray(centers).tolist(),
            "ring_size": 32, "weights": weights.tolist(),
            "source_type": "Nine source-section cloth rings recessed beneath armor"}
    return valid_solid(part)


def build_candidate(vertices=None, faces=None):
    if vertices is None or faces is None:
        vertices, faces = source_geometry()
    upper = valid_solid(build_arm_piece(vertices, faces, .255, .385))
    result = {"status": "candidate", "runtime_publish_allowed": False,
              "source": str(SOURCE.relative_to(ROOT)).replace("\\", "/"),
              "source_sha256": SOURCE_SHA, "roi_t": list(ROI),
              "preserved_source_fingerprint": source_boundary_fingerprint(vertices, faces, *ROI),
              "fixed_hinge": {"pivot_t": PIVOT_T, "axis_mode": AXIS_MODE},
              "components": {"UpperArmArmor": upper,
                             "ElbowArmor": build_couter(vertices, faces),
                             "ForearmArmor": build_forearm(vertices, faces),
                             "FlexibleSleeve": build_sleeve(vertices, faces)}}
    return result


def pose_components(candidate, bend, roll):
    if not (0 <= bend <= 90 and 0 <= roll <= 45):
        raise ValueError("Elbow QA motion is limited to bend 0..90 and roll 0..45")
    sleeve = candidate["components"]["FlexibleSleeve"]
    stations, centers = np.asarray(sleeve["stations"]), np.asarray(sleeve["centers"])
    axes, distal = source_axes(stations, centers)
    pivot = center_at(stations, centers, PIVOT_T)
    roll_pivot = center_at(stations, centers, .69)
    result = {}
    for name, part in candidate["components"].items():
        points = np.asarray(part["vertices"], float)
        if name == "UpperArmArmor":
            result[name] = points.copy()
        elif name == "ElbowArmor":
            result[name] = hinge_transform(points, pivot, axes[AXIS_MODE], .5*bend)
        elif name == "ForearmArmor":
            result[name] = hinge_transform(points, pivot, axes[AXIS_MODE], bend,
                                           roll, distal, roll_pivot)
        else:
            fractions = np.clip((station(points) - .365)/(.735-.365), 0, 1)
            posed = np.empty_like(points)
            for i, point in enumerate(points):
                s = fractions[i]
                posed[i] = hinge_transform(point[None, :], pivot, axes[AXIS_MODE],
                                           bend*s, roll*s, distal, roll_pivot)[0]
            result[name] = posed
    return result


def main():
    candidate = build_candidate()
    write_json(RUN / "candidate/original-guard-articulated-elbow-geometry.json", candidate)
    print("ARTICULATED_ELBOW_GEOMETRY", RUN, flush=True)


if __name__ == "__main__":
    main()
