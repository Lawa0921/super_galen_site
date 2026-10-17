"""Bounded outer-patch fairing against the original guard's high-poly surface.

Only small source-fit arm regions change. The local patch perimeter stays fixed;
the old arm, source and runtime artifacts remain untouched.
"""
import hashlib
import json
from pathlib import Path
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "art-factory/rts/runs/original-guard-shape/2026-10-05/candidate/candidate-body.glb"
BASE = ROOT / "art-factory/rts/runs/original-guard-arm-articulation/2026-10-05/candidate/original-guard-arm-articulation.json"
RUN = ROOT / "art-factory/rts/runs/original-guard-arm-surface-patch/2026-10-05"
SOURCE_SHA = "b2a94ddd3c7f66ea8e1edf993fce13ce4c24a795b9106076648e773ebffecdfd"


def fair_outer_patch(outer, rows, width, editable, source_target, max_displacement, iterations=12):
    """Fair a tiny grid patch toward source points, keeping every other point exact."""
    outer = np.asarray(outer, float)
    target = np.asarray(source_target, float)
    editable = sorted(set(int(i) for i in editable))
    if (outer.shape != (rows * width, 3) or target.shape != outer.shape or
        not np.isfinite(outer).all() or not np.isfinite(target).all() or
        max_displacement <= 0 or not np.isfinite(max_displacement) or
        not editable or any(i < 0 or i >= len(outer) for i in editable)):
        raise ValueError("finite matching grid, bounded displacement and valid patch required")
    original = outer.copy()
    result = outer.copy()
    for _ in range(iterations):
        previous = result.copy()
        for index in editable:
            row, col = divmod(index, width)
            neighbors = [row * width + (col - 1) % width,
                         row * width + (col + 1) % width]
            if row:
                neighbors.append((row - 1) * width + col)
            if row + 1 < rows:
                neighbors.append((row + 1) * width + col)
            destination = .68 * previous[neighbors].mean(axis=0) + .32 * target[index]
            delta = destination - original[index]
            length = np.linalg.norm(delta)
            if length > max_displacement:
                destination = original[index] + delta * max_displacement / length
            result[index] = destination
    return result


def patch_indices(rows, width, row_range, col_range):
    return sorted({r * width + c % width for r in row_range for c in col_range
                   if 0 <= r < rows})


def main():
    import trimesh
    from scipy.spatial import cKDTree
    sys.path.insert(0, str(Path(__file__).parent))
    from local_shell_offset import miter_offsets
    from original_guard_arm_articulate import mesh_checks

    if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != SOURCE_SHA:
        raise RuntimeError("Original high-poly source hash changed")
    data = json.loads(BASE.read_text(encoding="utf8"))
    mesh = trimesh.load(SOURCE, force="mesh", process=False)
    native = np.asarray(mesh.vertices)
    scale = .9481278155956246
    source = np.column_stack((-native[:, 0], native[:, 2], native[:, 1] + .9685986638069153)) * scale
    tree = cKDTree(source)
    patches = {
        "UpperArmArmor": [(range(1, 3), range(8, 15))],
        "ForearmArmor": [(range(0, 4), range(5, 13))],
        "FlexibleElbowSleeve": [(range(0, 4), range(0, 6)), (range(0, 4), range(24, 29))],
    }
    report = {"status": "candidate_pending_full_qa", "runtime_publish_allowed": False,
              "original_source_sha256": SOURCE_SHA, "articulation_json_sha256": hashlib.sha256(BASE.read_bytes()).hexdigest(),
              "method": "source-nearest guided bounded local outer-grid fairing, fixed patch perimeter; inner co-moves continuously; miter feasibility is diagnostic only",
              "maximum_outer_displacement_m": .006, "target_shell_thickness_m": .002,
              "parts": {}}
    for name, regions in patches.items():
        component = data["components"][name]
        vertices = np.asarray(component["vertices"], float)
        half = len(vertices) // 2
        rows = len(component["stations"])
        width = half // rows
        original = vertices[:half].copy()
        ids = sorted({i for rr, cc in regions for i in patch_indices(rows, width, rr, cc)})
        _, nearest = tree.query(original, workers=-1)
        matched = source[nearest]
        repaired = fair_outer_patch(original, rows, width, ids, matched, .006)
        vertices[:half] = repaired
        vertices[half:] += repaired - original
        outer_faces = np.asarray(component["faces"], int)
        outer_faces = outer_faces[np.all(outer_faces < half, axis=1)]
        feasibility = []
        feasible_count = 0
        for index in ids:
            try:
                miter_offsets(repaired, outer_faces, [index], .002, .006)
                feasible_count += 1
            except ValueError as error:
                feasibility.append({"vertex": index, "reason": str(error)})
        component["vertices"] = vertices.tolist()
        component["checks"] = mesh_checks(vertices, np.asarray(component["faces"], int))
        fixed = sorted(set(range(half)) - set(ids))
        assert np.array_equal(repaired[fixed], original[fixed])
        source_old = np.linalg.norm(original[ids] - matched[ids], axis=1)
        source_new = tree.query(repaired[ids], workers=-1)[0]
        report["parts"][name] = {"edited_vertex_count": len(ids),
            "fixed_outer_vertices_exact": len(fixed), "maximum_outer_displacement_m": float(np.max(np.linalg.norm(repaired - original, axis=1))),
            "source_nearest_old_p95_m": float(np.quantile(source_old, .95)),
            "source_nearest_new_p95_m": float(np.quantile(source_new, .95)),
            "local_miter_feasible_count": feasible_count,
            "local_miter_infeasible": feasibility, "edited_indices": ids}
    data["status"] = "candidate_pending_full_qa"
    data["runtime_publish_allowed"] = False
    candidate = RUN / "candidate/original-guard-arm-articulation.json"
    candidate.parent.mkdir(parents=True, exist_ok=True)
    candidate.write_bytes((json.dumps(data, indent=2) + "\n").encode("utf8"))
    qa = RUN / "qa/source-patch.json"
    qa.parent.mkdir(parents=True, exist_ok=True)
    qa.write_bytes((json.dumps(report, indent=2) + "\n").encode("utf8"))
    print(json.dumps({name: {"edited": part["edited_vertex_count"],
        "failed_miters": len(part["local_miter_infeasible"]),
        "move_mm": round(part["maximum_outer_displacement_m"] * 1000, 3)}
        for name, part in report["parts"].items()}))


if __name__ == "__main__":
    main()
