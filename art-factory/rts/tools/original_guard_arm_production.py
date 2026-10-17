"""Original Quadri control surface for the guard's articulated right arm.

The working surface is the *connected source quad complex*, not a loft of
independently sampled arm sections. Source polygon cycles and vertices stay
addressable throughout the build for output-to-source QA.
"""
import numpy as np
import trimesh

from original_guard_arm_hinge import center_at, hinge_transform, source_axes
from original_guard_solid_arm import (AXIS, AXIS_LENGTH, AXIS_START,
                                      boundary_loops, build_arm_piece,
                                      face_components, source_geometry,
                                      triangulate, triangulate_planar_loop)


ROI = (.30, .78)


def station(points):
    return (np.asarray(points, float) - AXIS_START) @ AXIS / AXIS_LENGTH


def build_continuous_control_surface(vertices, faces):
    vertices = np.asarray(vertices, float)
    t = station(vertices)
    eligible = [(source_id, face) for source_id, face in enumerate(faces)
                if vertices[face, 0].mean() > .20 and
                t[face].min() > ROI[0] and t[face].max() < ROI[1]]
    islands = face_components([face for _, face in eligible])
    if not islands:
        raise ValueError("No source arm surface in requested ROI")
    dominant = max(islands, key=len)
    if len(dominant) < 150:
        raise ValueError("Arm source ROI is not a substantial connected surface")
    selected = [eligible[i] for i in dominant]
    ids = sorted({index for _, face in selected for index in face})
    remap = {old: new for new, old in enumerate(ids)}
    patch_faces = [[remap[index] for index in face] for _, face in selected]
    return {"vertices": vertices[ids].tolist(), "faces": patch_faces,
            "source_vertex_ids": ids,
            "source_face_ids": [source_id for source_id, _ in selected],
            "source_face_cycles": [face for _, face in selected],
            "roi_t": list(ROI), "topology": "single connected source Quadri control complex"}


def verify_source_correspondence(surface, source_vertices, source_faces):
    candidate = np.asarray(surface["vertices"], float)
    source_vertices = np.asarray(source_vertices, float)
    vertex_ids = surface["source_vertex_ids"]
    face_ids = surface["source_face_ids"]
    all_vertices = len(candidate) == len(vertex_ids) and np.array_equal(candidate, source_vertices[vertex_ids])
    all_faces = len(surface["faces"]) == len(face_ids)
    if all_faces:
        for local, source_id, cycle in zip(surface["faces"], face_ids,
                                           surface["source_face_cycles"]):
            if cycle != source_faces[source_id] or [vertex_ids[i] for i in local] != cycle:
                all_faces = False
                break
    return {"all_exact": bool(all_vertices and all_faces),
            "vertex_count": len(vertex_ids), "face_count": len(face_ids),
            "vertex_exact": bool(all_vertices), "face_cycles_exact": bool(all_faces)}


def feature_boundary(surface, t):
    """Ordered original-surface iso-curve, without polar resampling."""
    vertices = np.asarray(surface["vertices"], float)
    mesh = trimesh.Trimesh(vertices=vertices, faces=triangulate(surface["faces"]),
                           process=False)
    section = mesh.section(plane_origin=AXIS_START + t * AXIS_LENGTH * AXIS,
                           plane_normal=AXIS)
    if section is None:
        raise ValueError(f"Source has no feature curve at t={t}")
    loops = [np.asarray(loop) for loop in section.discrete if len(loop) > 8]
    if not loops:
        raise ValueError("Feature curve is absent or fragmented")
    hint = AXIS_START + t * AXIS_LENGTH * AXIS
    curve = min(loops, key=lambda loop: np.linalg.norm(loop.mean(axis=0) - hint))
    if np.linalg.norm(curve[0] - curve[-1]) < 1e-7:
        curve = curve[:-1]
    return [tuple(map(float, point)) for point in curve]


def rolled_source_piece(source_vertices, source_faces, lo, hi, outward=0.):
    """Close a source quad patch with continuous bevel and recessed return.

    The complete source exterior remains in the output. New polygons are
    exclusively an edge band and hidden closure cut from the same contour.
    """
    base = build_arm_piece(source_vertices, source_faces, lo, hi)
    outer_count = base["pre_cap_exterior_polygon_count"]
    exterior = [list(face) for face in base["faces"][:outer_count]]
    vertices = np.asarray(base["vertices"], float).copy()
    loops = boundary_loops(exterior)
    if len(loops) != 2:
        raise ValueError(f"Expected two continuous feature edges; got {len(loops)}")
    if outward:
        source_mesh = trimesh.Trimesh(vertices=vertices, faces=triangulate(exterior),
                                      process=False)
        normals = source_mesh.vertex_normals
        t = station(vertices)
        u = np.clip((t-lo)/(hi-lo), 0, 1)
        lift = outward * (.55 + .45 * np.sin(np.pi*u)**2)
        vertices += lift[:, None] * normals
    points = vertices.tolist()
    faces = list(exterior)
    labels = ["presentation"] * len(faces)
    feature_length = 0.
    for loop in loops:
        boundary = np.asarray(points)[loop]
        feature_length += float(np.linalg.norm(boundary-np.roll(boundary, -1, axis=0), axis=1).sum())
        center = boundary.mean(axis=0)
        center += AXIS * (np.mean(boundary @ AXIS) - center @ AXIS)
        # The bevel turns continuously along the original feature edge. Its
        # inner return is deliberately buried, and never becomes an exposed
        # planar triangular cap.
        rings = [loop]
        for inset, axial in ((.0018, .0025), (.010, .008)):
            new_ring = []
            for p in boundary:
                radial = p-center
                radial -= np.dot(radial, AXIS)*AXIS
                direction = AXIS if abs(station(boundary).mean()-lo) < .005 else -AXIS
                new_ring.append(len(points))
                points.append((p - inset * radial / max(np.linalg.norm(radial), 1e-8)
                               + axial * direction).tolist())
            rings.append(new_ring)
        for previous, following in zip(rings[:-1], rings[1:]):
            for j in range(len(loop)):
                k = (j+1) % len(loop)
                faces.append([previous[k], previous[j], following[j], following[k]])
                labels.append("bevel" if previous is rings[0] else "hidden_return")
        # The closure triangulation is deep behind two curved rings.
        closed = triangulate_planar_loop(np.asarray(points), list(reversed(rings[-1])), AXIS)
        faces.extend(closed)
        labels.extend(["hidden_return"] * len(closed))
    mesh = trimesh.Trimesh(vertices=np.asarray(points), faces=triangulate(faces), process=False)
    if not mesh.is_watertight or not mesh.is_winding_consistent:
        raise ValueError("Rolled source plate has a topological opening")
    return {"vertices": points, "faces": faces, "face_labels": labels,
            "pre_cap_exterior_polygon_count": outer_count,
            "qa": {"closed": bool(mesh.is_watertight),
                   "winding_consistent": bool(mesh.is_winding_consistent),
                   "feature_edge_length_m": feature_length,
                   "source_exterior_polygons": outer_count,
                   "triangles": len(mesh.faces)},
            "design": {"source_control": "one connected original Quadri surface",
                       "section_t": [lo, hi], "bevel_m": .0018,
                       "hidden_return_m": .010, "surface_lift_m": outward}}


def source_quad_side_shield(source_vertices, source_faces):
    """One source-connected elbow side patch, with a single bevel/return loop.

    This revision removes the full-circumference couter which intersected
    both neighboring plates throughout the finite bend/roll sweep.
    """
    source_vertices = np.asarray(source_vertices, float)
    t = station(source_vertices)
    selected = []
    for source_id, face in enumerate(source_faces):
        p = source_vertices[face].mean(axis=0)
        radial = p - (AXIS_START + np.dot(p-AXIS_START, AXIS)*AXIS)
        if p[0] > .20 and .38 < t[face].mean() < .64 and radial[1] < -.01:
            selected.append((source_id, face))
    islands = face_components([face for _, face in selected])
    dominant = max(islands, key=len)
    selected = [selected[i] for i in dominant]
    ids = sorted({index for _, face in selected for index in face})
    remap = {old: new for new, old in enumerate(ids)}
    outer_faces = [[remap[index] for index in face] for _, face in selected]
    source_points = source_vertices[ids]
    source_mesh = trimesh.Trimesh(vertices=source_points,
                                  faces=triangulate(outer_faces), process=False)
    normals = np.asarray(source_mesh.vertex_normals)
    local_t = t[ids]
    envelope = np.sin(np.pi * np.clip((local_t-.38)/(.64-.38), 0, 1))**2
    outer = source_points + (.006 + .006*envelope)[:, None] * normals
    inner = source_points - .004 * normals
    n = len(ids)
    points = np.vstack((outer, inner)).tolist()
    faces = list(outer_faces) + [[n+i for i in reversed(face)] for face in outer_faces]
    labels = (["presentation"] * len(outer_faces) +
              ["hidden_return"] * len(outer_faces))
    loops = boundary_loops(outer_faces)
    if len(loops) != 1:
        raise ValueError(f"Couter source patch must have one edge loop, got {len(loops)}")
    loop = loops[0]
    for j, a in enumerate(loop):
        b = loop[(j+1) % len(loop)]
        faces.append([b, a, n+a, n+b])
        labels.append("bevel")
    mesh = trimesh.Trimesh(vertices=np.asarray(points), faces=triangulate(faces), process=False)
    if not mesh.is_watertight or not mesh.is_winding_consistent:
        raise ValueError("Source-side couter has an opening or inconsistent winding")
    edge = outer[loop]
    edge_length = float(np.linalg.norm(edge-np.roll(edge, -1, axis=0), axis=1).sum())
    return {"vertices": points, "faces": faces, "face_labels": labels,
            "pre_cap_exterior_polygon_count": len(outer_faces),
            "source_face_ids": [source_id for source_id, _ in selected],
            "qa": {"closed": True, "winding_consistent": True,
                   "feature_edge_length_m": edge_length,
                   "source_exterior_polygons": len(outer_faces),
                   "triangles": len(mesh.faces)},
            "design": {"geometry": "source_quad_side_patch",
                       "source_quad_faces": len(outer_faces),
                       "boundary_loops": len(loops),
                       "surface_lift_m": [.006, .012],
                       "hidden_return_m": .004}}


def build_candidate(vertices=None, faces=None):
    if vertices is None or faces is None:
        vertices, faces = source_geometry()
    surface = build_continuous_control_surface(vertices, faces)
    components = {
        "UpperArmArmor": rolled_source_piece(vertices, faces, .255, .47),
        "ElbowArmor": source_quad_side_shield(vertices, faces),
        "ForearmArmor": rolled_source_piece(vertices, faces, .54, .96),
        "FlexibleSleeve": build_sleeve(vertices, faces),
    }
    return {"status": "candidate_pending_sweep", "runtime_publish_allowed": False,
            "source_control": surface, "components": components,
            "mechanism": {"pivot_t": .48, "bend_axis": "global_anatomical",
                          "couter_bend_fraction": .5, "couter_roll_fraction": 0,
                          "forearm_order": "bend_then_long_axis_roll"}}


def build_sleeve(source_vertices, source_faces):
    """Use the same connected Quadri face flow, inset below armor."""
    part = build_arm_piece(source_vertices, source_faces, .33, .74)
    points = np.asarray(part["vertices"], float)
    t = station(points)
    axis_point = AXIS_START + t[:, None] * AXIS_LENGTH * AXIS
    points = axis_point + .80 * (points-axis_point)
    s = np.clip((t-.33)/(.74-.33), 0, 1)
    weights = np.column_stack(((1-s)**2, 2*s*(1-s), s*s))
    mesh = trimesh.Trimesh(vertices=points, faces=triangulate(part["faces"]), process=False)
    if not mesh.is_watertight:
        raise ValueError("Source-following sleeve is not closed")
    return {"vertices": points.tolist(), "faces": part["faces"],
            "weights": weights.tolist(),
            "pre_cap_exterior_polygon_count": part["pre_cap_exterior_polygon_count"],
            "face_labels": ["presentation"] * part["pre_cap_exterior_polygon_count"] +
                           ["hidden_return"] * (len(part["faces"])-part["pre_cap_exterior_polygon_count"]),
            "qa": {"closed": True, "triangles": len(mesh.faces)},
            "source_type": "continuous original Quadri arm topology inward fitted"}


def mechanism_axes(candidate):
    surface = candidate["source_control"]
    stations = np.asarray([.39, .42, .46, .50, .54, .58, .62, .66, .68])
    centers = np.asarray([np.mean(feature_boundary(surface, float(t)), axis=0)
                          for t in stations])
    axes, distal = source_axes(stations, centers)
    return stations, centers, axes["global_anatomical"], distal


def pose_components(candidate, bend, roll, mechanism=None):
    if not (0 <= bend <= 90 and 0 <= roll <= 45):
        raise ValueError("Pose outside bounded production QA sweep")
    stations, centers, axis, distal = mechanism if mechanism is not None else mechanism_axes(candidate)
    pivot = center_at(stations, centers, .48)
    roll_pivot = center_at(stations, centers, .69)
    result = {}
    for name, part in candidate["components"].items():
        points = np.asarray(part["vertices"], float)
        if name == "UpperArmArmor":
            result[name] = points.copy()
        elif name == "ElbowArmor":
            result[name] = hinge_transform(points, pivot, axis, .5*bend)
        elif name == "ForearmArmor":
            result[name] = hinge_transform(points, pivot, axis, bend, roll,
                                           distal, roll_pivot)
        else:
            weights = np.asarray(part["weights"], float)
            upper = points
            middle = hinge_transform(points, pivot, axis, .5*bend)
            lower = hinge_transform(points, pivot, axis, bend, roll,
                                    distal, roll_pivot)
            result[name] = (weights[:, 0, None]*upper +
                            weights[:, 1, None]*middle +
                            weights[:, 2, None]*lower)
    return result


def _cycle(points):
    keys = [tuple(np.round(p, 10)) for p in points]
    return min(tuple(keys[i:]+keys[:i]) for i in range(len(keys)))


def verify_outer_roi_preservation(candidate, source_vertices, source_faces):
    """Compare actual output exterior cycles with source, not a source hash."""
    source_vertices = np.asarray(source_vertices, float)
    t = station(source_vertices)
    baseline = build_arm_piece(source_vertices, source_faces, .255, .96)
    source_cycles = set()
    source_face_cycles = {_cycle(source_vertices[face]): tuple(face)
                          for face in source_faces}
    for face in baseline["faces"][:baseline["pre_cap_exterior_polygon_count"]]:
        coords = np.asarray(baseline["vertices"])[face]
        key = _cycle(coords)
        if key not in source_face_cycles:
            continue
        source_ids = source_face_cycles[key]
        if max(t[list(source_ids)]) < ROI[0] or min(t[list(source_ids)]) > ROI[1]:
            source_cycles.add(key)
    output_cycles = set()
    for name in ("UpperArmArmor", "ForearmArmor"):
        part = candidate["components"][name]
        points = np.asarray(part["vertices"])
        for face in part["faces"][:part["pre_cap_exterior_polygon_count"]]:
            output_cycles.add(_cycle(points[face]))
    missing = source_cycles - output_cycles
    return {"all_exact": len(missing) == 0 and len(source_cycles) > 0,
            "source_complete_face_count": len(source_cycles),
            "output_matching_face_count": len(source_cycles)-len(missing),
            "missing_face_count": len(missing),
            "missing_cycles": [list(cycle) for cycle in list(missing)[:5]]}
