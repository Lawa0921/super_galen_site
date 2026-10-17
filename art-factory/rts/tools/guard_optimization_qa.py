"""Read-only production guard draw reduction and glTF preservation checks."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

from knight_optimization_qa import animation_data, inspect


def embedded_image_hashes(gltf: dict, binary: bytes) -> list[str]:
    hashes = []
    for image in gltf.get("images", []):
        view = gltf["bufferViews"][image["bufferView"]]
        offset = view.get("byteOffset", 0)
        hashes.append(hashlib.sha256(binary[offset : offset + view["byteLength"]]).hexdigest())
    return hashes


def compare(old_path: Path, new_path: Path) -> dict:
    old, old_gltf, old_binary = inspect(old_path)
    new, new_gltf, new_binary = inspect(new_path)
    if old["primitive_draw_count"] != 9:
        raise AssertionError(f"Baseline draw count changed: {old['primitive_draw_count']}")
    if new["primitive_draw_count"] != 6:
        raise AssertionError(f"Draw target is 6, got {new['primitive_draw_count']}")
    for key in ("triangles", "triangle_by_material", "skin_joint_names", "clip_channels",
                "teamcloth_material_names"):
        if old[key] != new[key]:
            raise AssertionError(f"Preservation mismatch: {key}")
    if sorted(old["material_names"]) != sorted(new["material_names"]):
        raise AssertionError("Material names changed")
    if len(new["skin_joint_names"]) != 1 or len(new["skin_joint_names"][0]) != 20:
        raise AssertionError("Guard 20-bone skin changed")
    if not new["all_materials_pbr"]:
        raise AssertionError("PBR material lost")
    if old_gltf["materials"] != new_gltf["materials"]:
        raise AssertionError("Material definitions changed")
    old_images = embedded_image_hashes(old_gltf, old_binary)
    new_images = embedded_image_hashes(new_gltf, new_binary)
    if old_images != new_images:
        raise AssertionError("Embedded JPEG images changed")
    old_tracks = animation_data(old_gltf, old_binary)
    new_tracks = animation_data(new_gltf, new_binary)
    max_delta = 0.0
    for clip, tracks in old_tracks.items():
        for target, (old_interp, old_times, old_values) in tracks.items():
            new_interp, new_times, new_values = new_tracks[clip][target]
            if old_interp != new_interp or old_times.shape != new_times.shape or old_values.shape != new_values.shape:
                raise AssertionError(f"Animation shape changed: {clip} {target}")
            max_delta = max(max_delta, float(np.max(np.abs(old_times - new_times))),
                            float(np.max(np.abs(old_values - new_values))))
    if max_delta > 1e-4:
        raise AssertionError(f"Animation samples changed by {max_delta}")
    return {"baseline": old, "candidate": new,
            "saved_draw_calls_per_guard": old["primitive_draw_count"] - new["primitive_draw_count"],
            "animation_max_sample_delta": max_delta,
            "material_definitions_exact": True, "embedded_image_sha256": new_images,
            "runtime_publish_allowed": False}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline-run", type=Path, required=True)
    parser.add_argument("--candidate-run", type=Path, required=True)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    rows = [compare(args.baseline_run / "candidate" / f"guard-production-lod{lod}.glb",
                    args.candidate_run / "candidate" / f"guard-production-lod{lod}.glb") for lod in (0, 1)]
    result = {"status": "candidate-needs-scene-review", "lods": rows,
              "runtime_publish_allowed": False}
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps([{"lod": lod, "draws_before": row["baseline"]["primitive_draw_count"],
                       "draws_after": row["candidate"]["primitive_draw_count"],
                       "animation_max_sample_delta": row["animation_max_sample_delta"]}
                      for lod, row in enumerate(rows)], indent=2))


if __name__ == "__main__":
    main()
