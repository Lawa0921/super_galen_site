"""Topology and component evidence for the bounded Hunyuan guard candidate."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import trimesh


def load_mesh(path: Path) -> trimesh.Trimesh:
    loaded = trimesh.load(path, force="scene", process=False)
    if isinstance(loaded, trimesh.Scene):
        mesh = trimesh.util.concatenate(tuple(loaded.geometry.values()))
    else:
        mesh = loaded
    mesh.merge_vertices()
    mesh.remove_unreferenced_vertices()
    return mesh


def component_rows(mesh: trimesh.Trimesh) -> list[dict]:
    components = sorted(mesh.split(only_watertight=False), key=lambda item: len(item.faces), reverse=True)
    return [
        {
            "rank": index + 1,
            "vertices": int(len(component.vertices)),
            "faces": int(len(component.faces)),
            "watertight": bool(component.is_watertight),
            "bounds": component.bounds.tolist(),
            "extents": component.extents.tolist(),
        }
        for index, component in enumerate(components)
    ]


def assess_cleaned_body(mesh: trimesh.Trimesh, vertical_axis: int = 2, tolerance: float = 3e-4) -> dict:
    candidate = mesh.copy()
    candidate.merge_vertices()
    candidate.remove_unreferenced_vertices()
    vertices = np.asarray(candidate.vertices)
    faces = np.asarray(candidate.faces)
    low = float(vertices[:, vertical_axis].min())
    face_vertical = vertices[faces][:, :, vertical_axis]
    cap_mask = np.ptp(face_vertical, axis=1) <= tolerance
    cap_mask &= np.abs(face_vertical.mean(axis=1) - low) <= tolerance
    cap_mesh = trimesh.Trimesh(vertices=vertices, faces=faces[cap_mask], process=True)
    islands = sorted(cap_mesh.split(only_watertight=False), key=lambda item: float(item.centroid[0]))
    rows = [
        {
            "faces": int(len(island.faces)),
            "area": float(island.area),
            "center_xyz": island.centroid.tolist(),
            "bounds": island.bounds.tolist(),
        }
        for island in islands
    ]
    two_opposed = len(rows) == 2 and rows[0]["center_xyz"][0] < 0 < rows[1]["center_xyz"][0]
    return {
        "vertices_after_merge": int(len(candidate.vertices)),
        "faces": int(len(candidate.faces)),
        "watertight": bool(candidate.is_watertight),
        "connected_components": len(candidate.split(only_watertight=False)),
        "bounds": candidate.bounds.tolist(),
        "cap_vertical_coordinate": low,
        "cap_face_count": int(cap_mask.sum()),
        "cap_island_count": len(rows),
        "cap_islands": rows,
        "feet_preserved": bool(candidate.is_watertight and two_opposed),
    }


def floor_slab_measurement(raw: trimesh.Trimesh) -> dict:
    vertices = np.asarray(raw.vertices)
    # Native Hunyuan space is X horizontal, Y vertical, Z depth. The body is
    # inside this conservative footprint; vertices outside it form the slab.
    outer = (np.abs(vertices[:, 0]) > 0.60) | (np.abs(vertices[:, 2]) > 0.40)
    samples = vertices[outer]
    return {
        "selection": "abs(x) > 0.60 or abs(z) > 0.40 in native Hunyuan coordinates",
        "vertex_count": int(len(samples)),
        "source_y_min": float(samples[:, 1].min()),
        "source_y_max": float(samples[:, 1].max()),
        "source_xz_bounds": [samples[:, [0, 2]].min(axis=0).tolist(), samples[:, [0, 2]].max(axis=0).tolist()],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--cleaned", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    raw = load_mesh(args.raw)
    cleaned = load_mesh(args.cleaned)
    clean = assess_cleaned_body(cleaned, vertical_axis=1)
    clean_extents = np.asarray(cleaned.extents)
    floor_removed = bool(clean_extents[0] < 1.2 and clean_extents[2] < 0.7)
    report = {
        "status": "cleanup_candidate_manual_review_required",
        "runtime_publish_allowed": False,
        "raw": {
            "vertices_after_merge": int(len(raw.vertices)),
            "faces": int(len(raw.faces)),
            "watertight": bool(raw.is_watertight),
            "bounds": raw.bounds.tolist(),
            "components": component_rows(raw),
            "floor_slab": floor_slab_measurement(raw),
        },
        "cleaned": {**clean, "components": component_rows(cleaned)},
        "checks": {
            "wide_floor_extent_removed": floor_removed,
            "two_capped_boot_boundaries": clean["feet_preserved"],
            "cleaned_mesh_watertight": clean["watertight"],
        },
        "mechanical_cleanup_pass": bool(floor_removed and clean["feet_preserved"] and clean["watertight"]),
        "visual_qa_still_required": True,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n"
    )
    print(json.dumps({"status": report["status"], "mechanical_cleanup_pass": report["mechanical_cleanup_pass"]}))
    return 0 if report["mechanical_cleanup_pass"] else 4


if __name__ == "__main__":
    raise SystemExit(main())
