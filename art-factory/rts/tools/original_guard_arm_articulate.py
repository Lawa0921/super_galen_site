"""Source-fit, local right-arm articulation geometry; candidate evidence only.

The generated shells follow the original high-poly arm contours. No whole-body
remesh, third-party mesh, downloaded rig, or runtime publication is involved.
"""
import hashlib
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
OLD = ROOT / "art-factory/rts/runs/original-guard-arm-cage/2026-10-05/candidate/source-fit-arm.json"
SOURCE = ROOT / "art-factory/rts/runs/original-guard-shape/2026-10-05/candidate/candidate-body.glb"
RUN = ROOT / "art-factory/rts/runs/original-guard-arm-articulation/2026-10-05"
EXPECTED_SHA = "b2a94ddd3c7f66ea8e1edf993fce13ce4c24a795b9106076648e773ebffecdfd"


def rotation(axis, degrees):
    axis = np.asarray(axis, float)
    axis /= np.linalg.norm(axis)
    a = np.deg2rad(degrees)
    x, y, z = axis
    k = np.array([[0, -z, y], [z, 0, -x], [-y, x, 0]])
    return np.eye(3) * np.cos(a) + (1 - np.cos(a)) * np.outer(axis, axis) + np.sin(a) * k


def control_rotation(local_axis, bend_axis, bend_degrees, roll_degrees):
    """Rigidly roll a forearm control about its bent anatomical long axis."""
    bend = rotation(bend_axis, bend_degrees)
    return rotation(bend @ np.asarray(local_axis, float), roll_degrees) @ bend


def rigid_transform(points, pivot, destination, bend_degrees, twist_degrees=0):
    """Rigid-motion regression helper; preserves all plate edge lengths."""
    r = rotation((1, 0, 0), bend_degrees) @ rotation((0, 0, -1), twist_degrees)
    return (np.asarray(points) - pivot) @ r.T + destination


def posed_centers(centers, ts, bend_degrees):
    """Integrate the actual source centerline into a smooth elbow arc."""
    centers = np.asarray(centers, float)
    ts = np.asarray(ts, float)
    axis = centers[-1] - centers[0]
    axis /= np.linalg.norm(axis)
    bend_axis = np.cross(axis, (0., 1., 0.))
    bend_axis /= np.linalg.norm(bend_axis)
    out = centers.copy()
    for i in range(1, len(centers)):
        t = (ts[i - 1] + ts[i]) / 2
        fraction = np.clip((t - .4) / .3, 0, 1)
        out[i] = out[i - 1] + rotation(bend_axis, bend_degrees * fraction) @ (centers[i] - centers[i - 1])
    return out


def pose_sleeve(rings, centers, ts, bend_degrees, twist_degrees):
    centers = np.asarray(centers, float)
    ts = np.asarray(ts, float)
    mapped = posed_centers(centers, ts, bend_degrees)
    axis = centers[-1] - centers[0]
    axis /= np.linalg.norm(axis)
    bend_axis = np.cross(axis, (0., 1., 0.))
    bend_axis /= np.linalg.norm(bend_axis)
    out = []
    for i, ring in enumerate(np.asarray(rings, float)):
        fraction = np.clip((ts[i] - .4) / .3, 0, 1)
        # Flex-axis bend points toward canonical +Y/front. Sleeve roll grows
        # along the local tangent; the distal armor rolls as one rigid piece.
        tangent = centers[min(i + 1, len(centers) - 1)] - centers[max(i - 1, 0)]
        r = control_rotation(tangent, bend_axis, bend_degrees * fraction, twist_degrees * fraction)
        out.append((ring - centers[i]) @ r.T + mapped[i])
    return np.asarray(out)


def minimum_longitudinal_spacing(rings):
    centers = np.asarray(rings).mean(axis=1)
    delta = np.diff(centers, axis=0)
    steps = np.diff(rings, axis=0)
    return float(np.min(np.sum(steps * delta[:, None, :], axis=2) / np.linalg.norm(delta, axis=1)[:, None]))


def vertex_bone_assignments(vertex_count, bone_names, rows):
    """Each rigid plate has one bone; each sleeve row has a separate control."""
    if len(bone_names) == 1:
        return {bone_names[0]: list(range(vertex_count))}
    if len(bone_names) != rows or vertex_count % (2 * rows):
        raise ValueError("Two shell layers and one bone per flexible ring required")
    width = vertex_count // (2 * rows)
    return {name: list(range(i * width, (i + 1) * width)) +
            list(range(rows * width + i * width, rows * width + (i + 1) * width))
            for i, name in enumerate(bone_names)}


def closed_shell(rings, angular_start=0, angular_stop=None, inner_scale=.9, inner_offset_m=None):
    """Closed source-fit plate/sleeve shell with inner offset and real side walls."""
    rings = np.asarray(rings, float)
    rows, n, _ = rings.shape
    stop = n if angular_stop is None else angular_stop
    complete = stop - angular_start == n
    ids = [j % n for j in range(angular_start, stop + (not complete))]
    outer = rings[:, ids]
    if inner_offset_m is None:
        inner = rings.mean(axis=1)[:, None, :] + inner_scale * (outer - rings.mean(axis=1)[:, None, :])
    else:
        if inner_offset_m <= 0:
            raise ValueError("Positive shell thickness required")
        axial = np.gradient(outer, axis=0)
        if complete:
            angular = np.roll(outer, -1, axis=1) - np.roll(outer, 1, axis=1)
        else:
            angular = np.gradient(outer, axis=1)
        normals = np.cross(axial, angular)
        normals /= np.linalg.norm(normals, axis=2)[:, :, None]
        radial = outer - rings.mean(axis=1)[:, None, :]
        normals *= np.where(np.sum(normals * radial, axis=2) < 0, -1, 1)[:, :, None]
        inner = outer - inner_offset_m * normals
    m = len(ids)
    vertices = np.concatenate((outer.reshape(-1, 3), inner.reshape(-1, 3)))
    faces = []

    def quad(a, b, c, d):
        faces.extend(((a, b, c), (a, c, d)))

    strips = m if complete else m - 1
    for i in range(rows - 1):
        for j in range(strips):
            k = (j + 1) % m
            a, b, c, d = i * m + j, i * m + k, (i + 1) * m + k, (i + 1) * m + j
            quad(a, d, c, b)
            quad(rows * m + a, rows * m + b, rows * m + c, rows * m + d)
    for j in range(strips):
        k = (j + 1) % m
        quad(j, k, rows * m + k, rows * m + j)
        a, b = (rows - 1) * m + j, (rows - 1) * m + k
        quad(a, rows * m + a, rows * m + b, b)
    if not complete:
        for j in (0, m - 1):
            for i in range(rows - 1):
                a, b = i * m + j, (i + 1) * m + j
                if j == 0:
                    quad(a, rows * m + a, rows * m + b, b)
                else:
                    quad(a, b, rows * m + b, rows * m + a)
    return vertices, np.asarray(faces, int)


def mesh_checks(vertices, faces):
    import trimesh
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=False)
    a = vertices[faces[:, 1]] - vertices[faces[:, 0]]
    b = vertices[faces[:, 2]] - vertices[faces[:, 0]]
    return {"watertight": bool(mesh.is_watertight),
            "winding_consistent": bool(mesh.is_winding_consistent),
            "minimum_double_area": float(np.min(np.linalg.norm(np.cross(a, b), axis=1))),
            "face_count": int(len(faces))}


def nearest_statistics(query, target):
    from scipy.spatial import cKDTree
    d = cKDTree(target).query(query, k=1, workers=-1)[0]
    return {"median_m": float(np.median(d)), "p95_m": float(np.quantile(d, .95)), "max_m": float(d.max())}


def main():
    import trimesh
    sha = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    if sha != EXPECTED_SHA:
        raise RuntimeError("Original source hash changed")
    data = json.loads(OLD.read_text(encoding="utf8"))
    ts = np.asarray(data["ts"])
    rings = np.asarray(data["vertices"][:len(ts) * data["ring_size"]]).reshape(len(ts), data["ring_size"], 3)
    centers = np.asarray(data["centers"])
    # Source-fit metal plates are independent closed shells. No faces are
    # inherited from the rejected V-bridging cage.
    specs = {
        "UpperArmArmor": (.25, .375, 23, 55, .99),
        # Angular index 8 is dorsal (-Y), the outside of a forward elbow bend.
        "ElbowArmor": (.4, .575, 1, 15, .99),
        "ForearmArmor": (.725, .975, 0, 32, .99),
    }
    components = {}
    for name, (lo, hi, start, stop, inner) in specs.items():
        use = np.flatnonzero((ts >= lo - 1e-9) & (ts <= hi + 1e-9))
        use = np.unique(np.r_[use[::2], use[-1]])
        v, f = closed_shell(rings[use], start, stop, inner_offset_m=.002)
        components[name] = {"vertices": v.tolist(), "faces": f.tolist(), "stations": ts[use].tolist(),
                            "checks": mesh_checks(v, f), "armor_single_bone_weight": 1.0}
    # The active flex interval is .40-.70. One static ring under each armor lip
    # prevents a visible axial gap without widening the bending region.
    use = np.flatnonzero((ts >= .375 - 1e-9) & (ts <= .725 + 1e-9))
    cloth = centers[use, None, :] + .64 * (rings[use] - centers[use, None, :])
    v, f = closed_shell(cloth, inner_offset_m=.002)
    components["FlexibleElbowSleeve"] = {"vertices": v.tolist(), "faces": f.tolist(),
        "stations": ts[use].tolist(), "checks": mesh_checks(v, f), "ring_size": data["ring_size"],
        "centers": centers[use].tolist(), "active_flex_interval": [.4, .7]}
    source_mesh = trimesh.load(SOURCE, force="mesh", process=False)
    native = np.asarray(source_mesh.vertices)
    scale = data["canonical_transform"]["scale"]
    ground = data["canonical_transform"]["ground_native_y"]
    source_points = np.column_stack((-native[:, 0], native[:, 2], native[:, 1] - ground)) * scale
    residuals = {}
    for name, component in components.items():
        outer = np.asarray(component["vertices"][:len(component["vertices"]) // 2])
        margin = .012
        region = source_points[np.all((source_points >= outer.min(axis=0) - margin) &
                                      (source_points <= outer.max(axis=0) + margin), axis=1)]
        if len(region) == 0:
            raise RuntimeError(f"No original source points in {name} bounds")
        residuals[name] = {"source_roi_vertex_count": len(region),
            "candidate_to_source": nearest_statistics(outer, region),
            "source_to_candidate": nearest_statistics(region, outer),
            "measurement": "bidirectional nearest sampled vertices, not exact surface Hausdorff"}
    RUN.joinpath("candidate").mkdir(parents=True, exist_ok=True)
    output = RUN / "candidate/original-guard-arm-articulation.json"
    output.write_bytes((json.dumps({"status": "candidate", "runtime_publish_allowed": False,
        "source": str(SOURCE.relative_to(ROOT)).replace('\\', '/'), "source_sha256": sha,
        "contour_data_sha256": hashlib.sha256(OLD.read_bytes()).hexdigest(),
        "rig_controls": "one rigid bone per armor piece; one sampled control per cloth ring",
        "source_residuals": residuals, "components": components}, indent=2) + "\n").encode("utf8"))
    print(output)


if __name__ == "__main__":
    main()
