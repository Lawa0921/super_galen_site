"""Batch 13 siege rigid meshes into six material primitives via a rigid skin.

The two non-uniformly animated bowstrings remain original rigid mesh nodes.
All original nodes, TRS and animation channels stay at their original indices.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import struct

import numpy as np

from knight_optimization_qa import accessor, read_glb
from siege_rigid_skin_math import (animation_sample, animation_times, normalized,
                                   rigid_world_normals, transform_positions,
                                   world_matrices)


RETAIN_RIGID = {"WaxedBowstring_1", "WaxedBowstring_-1"}
SUPPORTED_ATTRIBUTES = {"POSITION", "NORMAL", "TEXCOORD_0", "TANGENT", "COLOR_0"}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class BufferWriter:
    def __init__(self, gltf: dict, original: bytes):
        self.gltf = gltf
        self.binary = bytearray(original)

    def accessor(self, array: np.ndarray, component_type: int, kind: str,
                 target: int | None = None, bounds: bool = False) -> int:
        while len(self.binary) % 4:
            self.binary.append(0)
        offset = len(self.binary)
        packed = np.ascontiguousarray(array).tobytes()
        self.binary.extend(packed)
        view = {"buffer": 0, "byteOffset": offset, "byteLength": len(packed)}
        if target is not None:
            view["target"] = target
        view_index = len(self.gltf["bufferViews"])
        self.gltf["bufferViews"].append(view)
        result = {"bufferView": view_index, "componentType": component_type,
                  "count": int(len(array)), "type": kind}
        if bounds:
            result["min"] = np.min(array, axis=0).astype(float).tolist()
            result["max"] = np.max(array, axis=0).astype(float).tolist()
        index = len(self.gltf["accessors"])
        self.gltf["accessors"].append(result)
        return index


def safe_node_sets(gltf: dict) -> tuple[list[int], list[int]]:
    mesh_nodes = [i for i, node in enumerate(gltf["nodes"]) if "mesh" in node]
    retained = [i for i in mesh_nodes if gltf["nodes"][i].get("name") in RETAIN_RIGID]
    batched = [i for i in mesh_nodes if i not in retained]
    if len(mesh_nodes) != 15 or len(retained) != 2 or len(batched) != 13:
        raise AssertionError("Unexpected siege runtime-v1 node structure")
    # Exactly these two mesh nodes have authored non-uniform scale. Others may
    # inherit LoadedQuarrelPivot's nearly uniform temporary 0.001 shot scale.
    for index in batched:
        scale = gltf["nodes"][index].get("scale", [1, 1, 1])
        if max(scale) - min(scale) > 1e-5:
            raise AssertionError(f"Non-uniform bind scale needs rigid retention: {index}")
    return batched, retained


def sample_bounds(gltf: dict, binary: bytes, mesh_nodes: list[int]) -> dict:
    local_positions = {
        node: [accessor(gltf, binary, primitive["attributes"]["POSITION"])
               for primitive in gltf["meshes"][gltf["nodes"][node]["mesh"]]["primitives"]]
        for node in mesh_nodes
    }
    all_min = np.full(3, np.inf)
    all_max = np.full(3, -np.inf)
    max_origin_radius = 0.0
    per_clip = {}
    sample_count = 0
    for animation in gltf["animations"]:
        clip_min = np.full(3, np.inf)
        clip_max = np.full(3, -np.inf)
        times = animation_times(gltf, binary, animation)
        for time in times:
            world = world_matrices(gltf, animation_sample(gltf, binary, animation, time))
            sample_count += 1
            for node in mesh_nodes:
                for positions in local_positions[node]:
                    transformed = transform_positions(world[node], positions)
                    clip_min = np.minimum(clip_min, transformed.min(axis=0))
                    clip_max = np.maximum(clip_max, transformed.max(axis=0))
                    max_origin_radius = max(max_origin_radius, float(np.linalg.norm(transformed, axis=1).max()))
        all_min = np.minimum(all_min, clip_min)
        all_max = np.maximum(all_max, clip_max)
        per_clip[animation["name"]] = {"sample_count": len(times),
                                        "aabb_min_y_up_m": clip_min.tolist(),
                                        "aabb_max_y_up_m": clip_max.tolist()}
    pad = 0.05
    return {
        "method": "all clip key times and adjacent midpoints; 5 cm AABB pad and >=5% origin-radius pad",
        "sample_count": sample_count,
        "aabb_min_y_up_m": (all_min - pad).tolist(),
        "aabb_max_y_up_m": (all_max + pad).tolist(),
        "sphere_center_y_up_m": [0.0, 0.0, 0.0],
        "sphere_radius_m": max_origin_radius * 1.05 + pad,
        "per_clip": per_clip,
    }


def convert(source: Path, target: Path, bounds_path: Path) -> dict:
    old, source_bin = read_glb(source)
    gltf = deepcopy(old)
    batched, retained = safe_node_sets(old)
    bind_world = world_matrices(old)
    mesh_nodes = [i for i, node in enumerate(old["nodes"]) if "mesh" in node]
    bounds = sample_bounds(old, source_bin, mesh_nodes)
    bounds_path.parent.mkdir(parents=True, exist_ok=True)
    bounds_path.write_text(json.dumps(bounds, indent=2) + "\n", encoding="utf-8")
    joint_index = {node: index for index, node in enumerate(batched)}
    by_material = defaultdict(list)
    negative_determinant_parts = []
    source_triangle_count = 0
    for node in batched:
        matrix = bind_world[node]
        determinant = float(np.linalg.det(matrix[:3, :3]))
        if abs(determinant) < 1e-10:
            raise AssertionError(f"Singular bind transform: {old['nodes'][node]['name']}")
        for primitive in old["meshes"][old["nodes"][node]["mesh"]]["primitives"]:
            attributes = primitive["attributes"]
            if not {"POSITION", "NORMAL", "TEXCOORD_0"} <= set(attributes):
                raise AssertionError("Source position/normal/UV absent")
            if not set(attributes) <= SUPPORTED_ATTRIBUTES:
                raise AssertionError(f"Unsupported vertex attributes: {set(attributes) - SUPPORTED_ATTRIBUTES}")
            positions = accessor(old, source_bin, attributes["POSITION"])
            normals = accessor(old, source_bin, attributes["NORMAL"])
            indices = accessor(old, source_bin, primitive["indices"]).reshape(-1).astype(np.uint32)
            if len(indices) % 3:
                raise AssertionError("Non-triangle index count")
            source_triangle_count += len(indices) // 3
            if determinant < 0:
                indices = indices.reshape(-1, 3)[:, [0, 2, 1]].reshape(-1)
                negative_determinant_parts.append(old["nodes"][node]["name"])
            entry = {
                "positions": transform_positions(matrix, positions).astype("<f4"),
                "normals": rigid_world_normals(matrix, normals).astype("<f4"),
                "uv": accessor(old, source_bin, attributes["TEXCOORD_0"]).astype("<f4"),
                "joint": np.full((len(positions), 4), [joint_index[node], 0, 0, 0], dtype="<u2"),
                "weight": np.tile(np.array([1, 0, 0, 0], dtype="<f4"), (len(positions), 1)),
                "indices": indices,
            }
            if "TANGENT" in attributes:
                tangent = accessor(old, source_bin, attributes["TANGENT"])
                direction = normalized(tangent[:, :3] @ matrix[:3, :3].T)
                direction = normalized(direction - entry["normals"] *
                                       np.sum(direction * entry["normals"], axis=1)[:, None])
                handedness = tangent[:, 3] * (-1 if determinant < 0 else 1)
                entry["tangent"] = np.column_stack((direction, handedness)).astype("<f4")
            if "COLOR_0" in attributes:
                entry["color"] = accessor(old, source_bin, attributes["COLOR_0"]).astype("<f4")
            by_material[primitive["material"]].append(entry)
    writer = BufferWriter(gltf, source_bin)
    primitive_list = []
    for material in sorted(by_material):
        pieces = by_material[material]
        optional = {(piece.get("tangent") is not None, piece.get("color") is not None) for piece in pieces}
        if len(optional) != 1:
            raise AssertionError("Cannot silently drop mixed optional vertex attributes")
        combined = {}
        for name in ("positions", "normals", "uv", "joint", "weight"):
            combined[name] = np.concatenate([piece[name] for piece in pieces], axis=0)
        if pieces[0].get("tangent") is not None:
            combined["tangent"] = np.concatenate([piece["tangent"] for piece in pieces], axis=0)
        if pieces[0].get("color") is not None:
            combined["color"] = np.concatenate([piece["color"] for piece in pieces], axis=0)
        offsets = np.cumsum([0] + [len(piece["positions"]) for piece in pieces[:-1]])
        indices = np.concatenate([piece["indices"] + offset for piece, offset in zip(pieces, offsets)]).astype("<u4")
        attrs = {
            "POSITION": writer.accessor(combined["positions"], 5126, "VEC3", 34962, bounds=True),
            "NORMAL": writer.accessor(combined["normals"], 5126, "VEC3", 34962),
            "TEXCOORD_0": writer.accessor(combined["uv"], 5126, "VEC2", 34962),
            "JOINTS_0": writer.accessor(combined["joint"], 5123, "VEC4", 34962),
            "WEIGHTS_0": writer.accessor(combined["weight"], 5126, "VEC4", 34962),
        }
        if "tangent" in combined:
            attrs["TANGENT"] = writer.accessor(combined["tangent"], 5126, "VEC4", 34962)
        if "color" in combined:
            attrs["COLOR_0"] = writer.accessor(combined["color"], 5126, "VEC4", 34962)
        primitive_list.append({"attributes": attrs,
                               "indices": writer.accessor(indices.reshape(-1, 1), 5125, "SCALAR", 34963),
                               "material": material, "mode": 4})
    if len(primitive_list) != 6:
        raise AssertionError(f"Expected six batched material primitives, got {len(primitive_list)}")
    original_meshes = old["meshes"]
    copied_rigid_meshes = [deepcopy(original_meshes[old["nodes"][node]["mesh"]]) for node in retained]
    gltf["meshes"] = [{"name": "SiegeRigidSkinBatch", "primitives": primitive_list,
                       "extras": {"rtsConservativeBounds": bounds}}] + copied_rigid_meshes
    for node in batched:
        gltf["nodes"][node].pop("mesh")
    for number, node in enumerate(retained, start=1):
        gltf["nodes"][node]["mesh"] = number
    inverse_binds = np.stack([np.linalg.inv(bind_world[node]).flatten(order="F")
                              for node in batched]).astype("<f4")
    ibm_accessor = writer.accessor(inverse_binds, 5126, "MAT4")
    scene_root = old["scenes"][old.get("scene", 0)]["nodes"]
    if len(scene_root) != 1 or old["nodes"][scene_root[0]].get("name") != "SiegeRoot":
        raise AssertionError("Expected original SiegeRoot as skeleton ancestor")
    gltf["skins"] = [{"name": "SiegeRigidSkin", "inverseBindMatrices": ibm_accessor,
                       "joints": batched, "skeleton": scene_root[0]}]
    new_node = len(gltf["nodes"])
    gltf["nodes"].append({"name": "SiegeRigidSkinBatch", "mesh": 0, "skin": 0})
    gltf["scenes"][old.get("scene", 0)]["nodes"].append(new_node)
    while len(writer.binary) % 4:
        writer.binary.append(0)
    gltf["buffers"][0]["byteLength"] = len(writer.binary)
    gltf["asset"]["generator"] = old["asset"].get("generator", "") + " + RTS rigid-skin batching"
    encoded = json.dumps(gltf, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    encoded += b" " * ((-len(encoded)) % 4)
    bin_chunk = bytes(writer.binary)
    length = 12 + 8 + len(encoded) + 8 + len(bin_chunk)
    output = (struct.pack("<4sII", b"glTF", 2, length)
              + struct.pack("<I4s", len(encoded), b"JSON") + encoded
              + struct.pack("<I4s", len(bin_chunk), b"BIN\0") + bin_chunk)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(output)
    return {
        "source": str(source), "source_sha256": sha256(source), "source_bytes": source.stat().st_size,
        "candidate": str(target), "candidate_sha256": sha256(target), "candidate_bytes": target.stat().st_size,
        "batched_joint_node_indices": batched, "retained_rigid_node_indices": retained,
        "batch_material_primitives": len(primitive_list), "rigid_string_primitives": 2,
        "source_batched_triangles": source_triangle_count,
        "negative_determinant_mesh_nodes": negative_determinant_parts,
        "bounds_file": str(bounds_path), "runtime_publish_allowed": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-run", type=Path, required=True)
    parser.add_argument("--output-run", type=Path, required=True)
    args = parser.parse_args()
    source = args.source_run.resolve()
    output = args.output_run.resolve()
    if source == output or output.is_relative_to(source):
        raise AssertionError("Never write into runtime-v1 source")
    rows = []
    for lod in (0, 1):
        rows.append(convert(source / "candidate" / f"siege-lod{lod}.glb",
                            output / "candidate" / f"siege-lod{lod}.glb",
                            output / "qa" / f"conservative-bounds-lod{lod}.json"))
    (output / "qa" / "build.json").write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")
    print(json.dumps([{"lod": lod, "bytes": row["candidate_bytes"],
                       "batch_draws": row["batch_material_primitives"],
                       "rigid_draws": row["rigid_string_primitives"]}
                      for lod, row in enumerate(rows)], indent=2))


if __name__ == "__main__":
    main()
