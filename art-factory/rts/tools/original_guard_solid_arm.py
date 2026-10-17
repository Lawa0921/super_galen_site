"""Preserve checkpoint Quadri faces while cutting a solid +X arm prototype.

The source is the checkpoint's exact polygon/vertex NPZ. Only faces crossing a
joint plane are split; every other selected polygon keeps its original shape.
The closure is a recessed cross-section cap, never a parallel inward shell.
"""
import hashlib
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "art-factory/rts/runs/original-guard-quadri-scaled/2026-10-05/revision-v2-checkpointed/candidate/raw-solver-scaled.npz"
RUN = ROOT / "art-factory/rts/runs/original-guard-solid-arm/2026-10-05"
SOURCE_SHA = "7afee7965c9167299c5fa13df914acec97b83af2db4aa3d228d1b75622614542"
AXIS_START = np.array([.29, .02, 1.42])
AXIS_END = np.array([.42, .025, 1.025])
AXIS_LENGTH = float(np.linalg.norm(AXIS_END - AXIS_START))
AXIS = (AXIS_END - AXIS_START) / AXIS_LENGTH


def source_geometry():
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != SOURCE_SHA:
        raise ValueError("Checkpoint source hash differs")
    data = np.load(SOURCE)
    native = data["vertices_scaled_float32"].astype(float) / 2048.
    vertices = np.column_stack((-native[:, 0], native[:, 2],
                                native[:, 1] + .9685986638069153)) * .9481278155956246
    offsets, ids = data["face_offsets"], data["face_vertex_indices"]
    faces = [ids[offsets[i]:offsets[i + 1]].astype(int).tolist()
             for i in range(len(offsets) - 1)]
    return vertices, faces


def clip_polygons(vertices, faces, plane_origin, plane_normal):
    """Keep the normal-positive halfspace and cache each cut edge once."""
    vertices = np.asarray(vertices, float)
    normal = np.asarray(plane_normal, float)
    if not np.isfinite(vertices).all() or not np.isfinite(normal).all() or np.linalg.norm(normal) < 1e-12:
        raise ValueError("Finite nonzero clipping plane and mesh required")
    normal = normal / np.linalg.norm(normal)
    signed = (vertices - plane_origin) @ normal
    result_vertices = vertices.tolist()
    result_faces = []
    kept_original = []
    cut_edges = {}

    def intersection(a, b):
        key = (min(a, b), max(a, b))
        if key not in cut_edges:
            t = signed[a] / (signed[a] - signed[b])
            cut_edges[key] = len(result_vertices)
            result_vertices.append((vertices[a] + t * (vertices[b] - vertices[a])).tolist())
        return cut_edges[key]

    for original_index, face in enumerate(faces):
        output = []
        all_inside = all(signed[vertex] >= -1e-10 for vertex in face)
        for a, b in zip(face, face[1:] + face[:1]):
            ia, ib = signed[a] >= -1e-10, signed[b] >= -1e-10
            if ia:
                output.append(a)
            if ia != ib:
                output.append(intersection(a, b))
        # Exact-on-plane vertices may duplicate a cached intersection.
        cleaned = []
        for vertex in output:
            if not cleaned or vertex != cleaned[-1]:
                cleaned.append(vertex)
        if len(cleaned) > 1 and cleaned[0] == cleaned[-1]:
            cleaned.pop()
        if len(cleaned) >= 3:
            result_faces.append(cleaned)
            if all_inside:
                kept_original.append(original_index)
    return np.asarray(result_vertices, float), result_faces, kept_original


def face_components(faces):
    edge_owner = {}
    neighbors = [[] for _ in faces]
    for i, face in enumerate(faces):
        for a, b in zip(face, face[1:] + face[:1]):
            key = (min(a, b), max(a, b))
            other = edge_owner.setdefault(key, i)
            if other != i:
                neighbors[i].append(other)
                neighbors[other].append(i)
    labels = np.full(len(faces), -1, int)
    components = []
    for i in range(len(faces)):
        if labels[i] >= 0:
            continue
        label = len(components)
        stack = [i]
        labels[i] = label
        component = []
        while stack:
            current = stack.pop()
            component.append(current)
            for neighbor in neighbors[current]:
                if labels[neighbor] < 0:
                    labels[neighbor] = label
                    stack.append(neighbor)
        components.append(component)
    return components


def compact_mesh(vertices, faces):
    ids = sorted({vertex for face in faces for vertex in face})
    mapping = {old: new for new, old in enumerate(ids)}
    return vertices[ids], [[mapping[i] for i in face] for face in faces], ids


def boundary_loops(faces):
    directed = {}
    counts = {}
    for face in faces:
        for a, b in zip(face, face[1:] + face[:1]):
            key = (min(a, b), max(a, b))
            counts[key] = counts.get(key, 0) + 1
            directed[key] = (a, b)
    if max(counts.values(), default=0) > 2:
        raise ValueError("Nonmanifold cut edge")
    edges = [directed[key] for key, count in counts.items() if count == 1]
    following = {}
    for a, b in edges:
        if a in following:
            raise ValueError("Boundary branches")
        following[a] = b
    loops = []
    while following:
        first = next(iter(following))
        current = first
        loop = []
        while current in following:
            loop.append(current)
            current = following.pop(current)
            if current == first:
                break
        if current != first or len(loop) < 3:
            raise ValueError("Open or tiny boundary loop")
        loops.append(loop)
    return loops


def triangulate_planar_loop(vertices, loop, axis):
    """Constrained ear clipping of one possibly concave section contour."""
    vertices = np.asarray(vertices, float)
    axis = np.asarray(axis, float)
    axis = axis / np.linalg.norm(axis)
    seed = np.array([1., 0., 0.]) if abs(axis[0]) < .9 else np.array([0., 1., 0.])
    u = seed - np.dot(seed, axis) * axis
    u /= np.linalg.norm(u)
    v = np.cross(axis, u)
    xy = np.column_stack((vertices[loop] @ u, vertices[loop] @ v))
    signed_area = np.sum(xy[:, 0] * np.roll(xy[:, 1], -1) -
                         xy[:, 1] * np.roll(xy[:, 0], -1))
    if abs(signed_area) < 1e-10:
        raise ValueError("Collapsed planar cut loop")
    direction = 1 if signed_area > 0 else -1
    remaining = list(range(len(loop)))
    triangles = []

    def cross(a, b):
        return a[0] * b[1] - a[1] * b[0]

    while len(remaining) > 3:
        ear = None
        for index, middle in enumerate(remaining):
            prev = remaining[index - 1]
            following = remaining[(index + 1) % len(remaining)]
            a, b, c = xy[[prev, middle, following]]
            double_area = cross(b - a, c - a) * direction
            if double_area <= 1e-11:
                continue
            occupied = False
            for candidate in remaining:
                if candidate in (prev, middle, following):
                    continue
                p = xy[candidate]
                if (cross(b - a, p - a) * direction >= -1e-10 and
                    cross(c - b, p - b) * direction >= -1e-10 and
                    cross(a - c, p - c) * direction >= -1e-10):
                    occupied = True
                    break
            if not occupied:
                ear = (index, prev, middle, following)
                break
        if ear is None:
            raise ValueError("Could not triangulate concave joint section")
        index, prev, middle, following = ear
        triangles.append([loop[prev], loop[middle], loop[following]])
        remaining.pop(index)
    triangles.append([loop[i] for i in remaining])
    return triangles


def cap_cut_loops(vertices, faces, axis):
    """Seal the physical section plane; never offset a concave exterior."""
    vertices = np.asarray(vertices, float)
    axis = np.asarray(axis, float)
    axis = axis / np.linalg.norm(axis)
    output = [list(face) for face in faces]
    loops = boundary_loops(faces)
    if not loops:
        raise ValueError("Expected cut boundaries")
    heights = vertices @ axis
    low, high = float(heights.min()), float(heights.max())
    for loop in loops:
        points = vertices[loop]
        if len(set(loop)) != len(loop) or np.min(np.linalg.norm(points - np.roll(points, 1, axis=0), axis=1)) < 1e-8:
            raise ValueError("Degenerate cut loop")
        projected = points @ axis
        if np.ptp(projected) > .001:
            raise ValueError("Boundary is not a planar joint cut")
        if min(abs(float(projected.mean()) - low), abs(float(projected.mean()) - high)) >= .001:
            raise ValueError("Unrelated boundary in arm component")
        output.extend(triangulate_planar_loop(vertices, list(reversed(loop)), axis))
    points = vertices
    for face in output:
        for i in range(1, len(face) - 1):
            a, b, c = points[[face[0], face[i], face[i + 1]]]
            if np.linalg.norm(np.cross(b - a, c - a)) < 1e-10:
                raise ValueError("Degenerate face after cap")
    return points, output


def rigid_weights(vertex_count, bone_name):
    return {bone_name: np.ones(vertex_count).tolist()}


def triangulate(faces):
    return np.asarray([[face[0], face[i], face[i + 1]]
                       for face in faces for i in range(1, len(face) - 1)], int)


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes((json.dumps(payload, indent=2) + "\n").encode("utf-8"))


def build_arm_piece(source_vertices, source_faces, lo, hi):
    # Intersections are local to two joint planes; all other Quadri polygons
    # survive exactly. The isolated +X arm island excludes the torso.
    v, f, _ = clip_polygons(source_vertices, source_faces, AXIS_START + lo * AXIS_LENGTH * AXIS, AXIS)
    v, f, _ = clip_polygons(v, f, AXIS_START + hi * AXIS_LENGTH * AXIS, -AXIS)
    parts = face_components(f)
    hint = AXIS_START + (lo + hi) * .5 * AXIS_LENGTH * AXIS
    ratings = []
    for part in parts:
        used = list({index for fi in part for index in f[fi]})
        center = v[used].mean(axis=0)
        ratings.append((np.linalg.norm(center - hint), len(part), center.tolist()))
    candidate = min(range(len(parts)), key=lambda i: ratings[i][0])
    v, f, old_ids = compact_mesh(v, [f[i] for i in parts[candidate]])
    # A clipped source polygon can still contain only original vertex IDs
    # when a section follows existing edges. Match complete vertex cycles,
    # not vertex-ID ranges, to count truly untouched polygons.
    original_cycles = {tuple(face) for face in source_faces}
    untouched = sum(tuple(old_ids[i] for i in face) in original_cycles for face in f)
    pre_cap = len(f)
    clipped = pre_cap - untouched
    v, f = cap_cut_loops(v, f, AXIS)
    return {"vertices": v.tolist(), "faces": f, "source_vertex_ids": [i for i in old_ids if i < len(source_vertices)],
            "fully_unchanged_source_polygon_count": untouched,
            "plane_clipped_source_polygon_count": clipped,
            "pre_cap_exterior_polygon_count": pre_cap,
            "component_candidates": ratings, "selected_component": candidate}


def build_sleeve(source_vertices, source_faces):
    """Derive flexible cloth rings from the same Quadri source under armor lips."""
    import trimesh
    from source_fit_cage import align_ring, contour_resample, select_local_loop

    triangles = triangulate(source_faces)
    mesh = trimesh.Trimesh(vertices=source_vertices, faces=triangles, process=False)
    stations = np.round(np.arange(.37, .691, .01), 3)
    rings = []
    centers = []
    for station in stations:
        hint = AXIS_START + station * AXIS_LENGTH * AXIS
        section = mesh.section(plane_origin=hint, plane_normal=AXIS)
        loop = select_local_loop(section.discrete, hint, AXIS, .22, .11)
        center = (loop.min(axis=0) + loop.max(axis=0)) * .5
        center -= np.dot(center - hint, AXIS) * AXIS
        ring = contour_resample(loop, center, AXIS, 48)
        if rings:
            ring = align_ring(rings[-1], ring)
        # Actual source silhouette determines every cloth station. Recession
        # puts the fabric beneath the three independently moving plate lips.
        scaled = center + .80 * (ring - center)
        rings.append(scaled)
        centers.append(center)
    count = len(rings[0])
    verts = np.asarray(rings).reshape(-1, 3)
    faces = []
    for i in range(len(rings) - 1):
        for j in range(count):
            k = (j + 1) % count
            faces.append([i * count + j, i * count + k,
                          (i + 1) * count + k, (i + 1) * count + j])
    closed, faces = cap_cut_loops(verts, faces, AXIS)
    return {"vertices": closed.tolist(), "faces": faces, "ring_size": count,
            "stations": stations.tolist(), "centers": np.asarray(centers).tolist(),
            "surface_vertices": len(verts), "source_type": "Quadri plane contours; 80% radial underlayer"}


def main():
    import trimesh
    vertices, faces = source_geometry()
    specs = {"UpperArmArmor": (.255, .385), "ElbowArmor": (.415, .58),
             "ForearmArmor": (.665, .96)}
    pieces = {}
    for name, (lo, hi) in specs.items():
        part = build_arm_piece(vertices, faces, lo, hi)
        points = np.asarray(part["vertices"])
        mesh = trimesh.Trimesh(vertices=points, faces=triangulate(part["faces"]), process=False)
        part["qa"] = {"watertight": bool(mesh.is_watertight),
                      "winding_consistent": bool(mesh.is_winding_consistent),
                      "volume_m3": float(mesh.volume), "faces": len(part["faces"])}
        pieces[name] = part
        print(name, part["qa"], "fully_unchanged", part["fully_unchanged_source_polygon_count"],
              "plane_clipped", part["plane_clipped_source_polygon_count"], flush=True)
    sleeve = build_sleeve(vertices, faces)
    cloth_mesh = trimesh.Trimesh(vertices=np.asarray(sleeve["vertices"]),
                                faces=triangulate(sleeve["faces"]), process=False)
    sleeve["qa"] = {"watertight": bool(cloth_mesh.is_watertight),
                    "winding_consistent": bool(cloth_mesh.is_winding_consistent),
                    "volume_m3": float(cloth_mesh.volume), "faces": len(sleeve["faces"])}
    pieces["FlexibleSleeve"] = sleeve
    print("FlexibleSleeve", sleeve["qa"], flush=True)
    write_json(RUN / "candidate/original-guard-solid-arm-geometry.json",
               {"status": "candidate", "runtime_publish_allowed": False,
                "source": str(SOURCE.relative_to(ROOT)).replace('\\', '/'),
                "source_sha256": SOURCE_SHA, "components": pieces})


if __name__ == "__main__":
    main()
