"""Actual v1/v3 glTF vertex differential over every clip key and midpoint."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from knight_optimization_qa import accessor, read_glb
from siege_rigid_skin_math import (animation_sample, animation_times, instance_matrix,
                                   normalized, rigid_world_normals, three_skin_normals,
                                   transform_positions, world_matrices)


def compare(old: dict, old_bin: bytes, new: dict, new_bin: bytes, bounds: dict) -> dict:
    bind_world = world_matrices(old)
    joints = new["skins"][0]["joints"]
    ibm = accessor(new, new_bin, new["skins"][0]["inverseBindMatrices"])
    inverse_binds = [mat.reshape(4, 4, order="F") for mat in ibm]
    max_bind = max(float(np.abs(np.eye(4) - bind_world[node] @ inverse_binds[i]).max())
                   for i, node in enumerate(joints))
    batched = new["meshes"][0]["primitives"]
    by_material = {p["material"]: p for p in batched}
    offsets = {material: 0 for material in by_material}
    pieces = []
    max_uv = 0.0
    max_bind_pos = 0.0
    max_bind_normal = 0.0
    for joint, node in enumerate(joints):
        for primitive in old["meshes"][old["nodes"][node]["mesh"]]["primitives"]:
            material = primitive["material"]
            new_attrs = by_material[material]["attributes"]
            old_attrs = primitive["attributes"]
            local = accessor(old, old_bin, old_attrs["POSITION"])
            normals = accessor(old, old_bin, old_attrs["NORMAL"])
            offset = offsets[material]
            offsets[material] += len(local)
            take = slice(offset, offset + len(local))
            bind_pos = accessor(new, new_bin, new_attrs["POSITION"])[take]
            bind_normal = accessor(new, new_bin, new_attrs["NORMAL"])[take]
            uv_old = accessor(old, old_bin, old_attrs["TEXCOORD_0"])
            uv_new = accessor(new, new_bin, new_attrs["TEXCOORD_0"])[take]
            max_uv = max(max_uv, float(np.abs(uv_old - uv_new).max()))
            max_bind_pos = max(max_bind_pos, float(np.abs(transform_positions(bind_world[node], local) - bind_pos).max()))
            max_bind_normal = max(max_bind_normal, float(np.abs(rigid_world_normals(bind_world[node], normals) - bind_normal).max()))
            pieces.append((node, joint, local, normals, bind_pos, bind_normal))
    for material, count in offsets.items():
        if count != new["accessors"][by_material[material]["attributes"]["POSITION"]]["count"]:
            raise AssertionError(f"Unmapped candidate vertices for material {material}")
    mesh_nodes = [node for node, item in enumerate(old["nodes"]) if "mesh" in item]
    original_positions = {node: [accessor(old, old_bin, p["attributes"]["POSITION"])
                                 for p in old["meshes"][old["nodes"][node]["mesh"]]["primitives"]]
                          for node in mesh_nodes}
    instance = instance_matrix()
    instance_inv3 = np.linalg.inv(instance[:3, :3])
    lo = np.asarray(bounds["aabb_min_y_up_m"])
    hi = np.asarray(bounds["aabb_max_y_up_m"])
    radius = float(bounds["sphere_radius_m"])
    errors = {"bind_identity": max_bind, "bind_position_m": max_bind_pos,
              "bind_normal": max_bind_normal, "uv": max_uv,
              "animated_position_m": 0.0, "animated_normal": 0.0,
              "instance_position_m": 0.0, "instance_normal": 0.0,
              "bounds_overflow_m": 0.0}
    sample_counts = {}
    for animation in old["animations"]:
        times = animation_times(old, old_bin, animation)
        sample_counts[animation["name"]] = len(times)
        for t in times:
            world = world_matrices(old, animation_sample(old, old_bin, animation, t))
            for node, joint, local, normals, bind_pos, bind_normal in pieces:
                source_pos = transform_positions(world[node], local)
                batched_pos = transform_positions(world[node] @ inverse_binds[joint], bind_pos)
                errors["animated_position_m"] = max(errors["animated_position_m"], float(np.abs(source_pos - batched_pos).max()))
                rigid_normal = rigid_world_normals(world[node], normals)
                # Three skinnormal_vertex multiplies by skinMatrix, without inverse transpose.
                skin_normal = three_skin_normals(world[node], inverse_binds[joint], bind_normal)
                errors["animated_normal"] = max(errors["animated_normal"], float(np.abs(rigid_normal - skin_normal).max()))
                errors["instance_position_m"] = max(errors["instance_position_m"],
                                                      float(np.abs(transform_positions(instance, source_pos) - transform_positions(instance, batched_pos)).max()))
                rigid_instance_normal = rigid_world_normals(instance @ world[node], normals)
                skin_instance_normal = normalized(skin_normal @ instance_inv3)
                errors["instance_normal"] = max(errors["instance_normal"],
                                                float(np.abs(rigid_instance_normal - skin_instance_normal).max()))
            # The two original rigid bowstrings are included in conservative bounds.
            for node in mesh_nodes:
                for local in original_positions[node]:
                    pos = transform_positions(world[node], local)
                    outside = np.maximum(np.maximum(lo - pos, pos - hi), 0)
                    errors["bounds_overflow_m"] = max(errors["bounds_overflow_m"], float(outside.max()),
                                                       float(np.maximum(np.linalg.norm(pos, axis=1) - radius, 0).max()))
    if max(errors.values()) >= 1e-5:
        raise AssertionError(f"glTF source/candidate animation differential exceeds 1e-5: {errors}")
    return {"sampled_times_by_clip": sample_counts, "sampled_total": sum(sample_counts.values()),
            "batched_source_primitives": len(pieces), "instance_translation_y_up_m": instance[:3, 3].tolist(),
            "instance_yaw_radians": 1.123, "errors": errors}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline-run", type=Path, required=True)
    parser.add_argument("--candidate-run", type=Path, required=True)
    args = parser.parse_args()
    rows = []
    for lod in (0, 1):
        old, old_bin = read_glb(args.baseline_run / "candidate" / f"siege-lod{lod}.glb")
        new, new_bin = read_glb(args.candidate_run / "candidate" / f"siege-lod{lod}.glb")
        bounds = json.loads((args.candidate_run / "qa" / f"conservative-bounds-lod{lod}.json").read_text(encoding="utf-8"))
        rows.append({"lod": lod, **compare(old, old_bin, new, new_bin, bounds)})
    output = args.candidate_run / "qa" / "numeric-animation.json"
    output.write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(rows, indent=2))


if __name__ == "__main__":
    main()
