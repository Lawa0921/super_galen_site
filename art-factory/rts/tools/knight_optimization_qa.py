"""Read-only v2/v3 mounted-knight draw-count and preservation audit."""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import struct

import numpy as np


CLIPS = {"Idle", "Walk", "Attack", "Hurt", "Death"}
ATTRIBUTES = {"POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0"}
DTYPES = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_glb(path: Path) -> tuple[dict, bytes]:
    blob = path.read_bytes()
    if blob[:4] != b"glTF" or struct.unpack_from("<I", blob, 8)[0] != len(blob):
        raise AssertionError(f"Invalid GLB header: {path}")
    json_size, json_type = struct.unpack_from("<II", blob, 12)
    if json_type != 0x4E4F534A:
        raise AssertionError("GLB JSON chunk absent")
    gltf = json.loads(blob[20 : 20 + json_size])
    binary_offset = 20 + json_size
    binary_size, binary_type = struct.unpack_from("<II", blob, binary_offset)
    if binary_type != 0x004E4942:
        raise AssertionError("GLB BIN chunk absent")
    return gltf, blob[binary_offset + 8 : binary_offset + 8 + binary_size]


def accessor(gltf: dict, binary: bytes, number: int) -> np.ndarray:
    access = gltf["accessors"][number]
    if access.get("sparse"):
        raise AssertionError("Sparse accessors need explicit handling")
    view = gltf["bufferViews"][access["bufferView"]]
    dtype = np.dtype(DTYPES[access["componentType"]]).newbyteorder("<")
    count = access["count"]
    width = COMPONENTS[access["type"]]
    offset = view.get("byteOffset", 0) + access.get("byteOffset", 0)
    stride = view.get("byteStride", dtype.itemsize * width)
    if stride == dtype.itemsize * width:
        result = np.frombuffer(binary, dtype=dtype, count=count * width, offset=offset).reshape(count, width)
    else:
        result = np.ndarray((count, width), dtype=dtype, buffer=binary, offset=offset,
                            strides=(stride, dtype.itemsize))
    if access.get("normalized"):
        result = result.astype(np.float64) / np.iinfo(dtype).max
    return result


def inspect(path: Path) -> tuple[dict, dict, bytes]:
    gltf, binary = read_glb(path)
    nodes = gltf["nodes"]
    materials = [m["name"] for m in gltf["materials"]]
    triangle_by_material = Counter()
    draw_by_skin_material = Counter()
    all_primitive_weights_valid = True
    for node in nodes:
        if "mesh" not in node:
            continue
        skin = node.get("skin")
        if skin is None:
            raise AssertionError(f"Unexpected unskinned mesh {node.get('name')}")
        for primitive in gltf["meshes"][node["mesh"]]["primitives"]:
            if not ATTRIBUTES <= set(primitive["attributes"]):
                raise AssertionError(f"Missing UV/skin/normal attributes: {node.get('name')}")
            if primitive.get("mode", 4) != 4:
                raise AssertionError("Non-triangle primitive")
            mat = materials[primitive["material"]]
            triangle_by_material[mat] += gltf["accessors"][primitive["indices"]]["count"] // 3
            draw_by_skin_material[f"{skin}:{mat}"] += 1
            weights = accessor(gltf, binary, primitive["attributes"]["WEIGHTS_0"])
            joints = accessor(gltf, binary, primitive["attributes"]["JOINTS_0"])
            all_primitive_weights_valid &= bool(
                np.isfinite(weights).all()
                and np.max(np.abs(weights.sum(axis=1) - 1.0)) < 0.012
                and np.min(joints) >= 0
                and np.max(joints) < len(gltf["skins"][skin]["joints"])
            )
    channels = {
        anim["name"]: sorted(
            (nodes[ch["target"]["node"]].get("name", ""), ch["target"]["path"])
            for ch in anim["channels"]
        )
        for anim in gltf["animations"]
    }
    if set(channels) != CLIPS:
        raise AssertionError(f"Clip mismatch: {sorted(channels)}")
    if not all_primitive_weights_valid:
        raise AssertionError("Invalid bound joints or vertex weights")
    summary = {
        "path": str(path),
        "sha256": sha256(path),
        "bytes": path.stat().st_size,
        "mesh_count": len(gltf["meshes"]),
        "primitive_draw_count": sum(len(mesh["primitives"]) for mesh in gltf["meshes"]),
        "minimum_safe_draw_count_per_skin_material": len(draw_by_skin_material),
        "draw_by_skin_material": dict(sorted(draw_by_skin_material.items())),
        "material_names": materials,
        "triangle_by_material": dict(sorted(triangle_by_material.items())),
        "triangles": sum(triangle_by_material.values()),
        "skin_joint_names": [[nodes[joint].get("name", "") for joint in skin["joints"]]
                             for skin in gltf["skins"]],
        "clip_channels": channels,
        "all_primitive_weights_valid": all_primitive_weights_valid,
        "all_materials_pbr": all("pbrMetallicRoughness" in mat for mat in gltf["materials"]),
        "teamcloth_material_names": sorted(name for name in materials if "teamcloth" in name.lower()),
    }
    return summary, gltf, binary


def animation_data(gltf: dict, binary: bytes) -> dict:
    result = {}
    for anim in gltf["animations"]:
        tracks = {}
        for channel in anim["channels"]:
            target = channel["target"]
            name = gltf["nodes"][target["node"]].get("name", "")
            sampler = anim["samplers"][channel["sampler"]]
            tracks[(name, target["path"])] = (
                sampler.get("interpolation", "LINEAR"),
                accessor(gltf, binary, sampler["input"]),
                accessor(gltf, binary, sampler["output"]),
            )
        result[anim["name"]] = tracks
    return result


def compare(baseline: Path, candidate: Path) -> dict:
    old, old_gltf, old_binary = inspect(baseline)
    new, new_gltf, new_binary = inspect(candidate)
    if old["primitive_draw_count"] != 18:
        raise AssertionError(f"Baseline draw count changed: {old['primitive_draw_count']}")
    if new["primitive_draw_count"] > 13:
        raise AssertionError(f"Draw target is <=13, got {new['primitive_draw_count']}")
    for key in ("triangles", "triangle_by_material", "material_names", "skin_joint_names",
                "clip_channels", "teamcloth_material_names"):
        if old[key] != new[key]:
            raise AssertionError(f"Preservation mismatch: {key}")
    if not new["all_materials_pbr"]:
        raise AssertionError("Candidate lost a PBR material")
    old_tracks = animation_data(old_gltf, old_binary)
    new_tracks = animation_data(new_gltf, new_binary)
    max_sample_difference = 0.0
    for clip, tracks in old_tracks.items():
        for target, (old_interp, old_times, old_values) in tracks.items():
            new_interp, new_times, new_values = new_tracks[clip][target]
            if old_interp != new_interp or old_times.shape != new_times.shape or old_values.shape != new_values.shape:
                raise AssertionError(f"Animation shape changed: {clip} {target}")
            max_sample_difference = max(max_sample_difference,
                                        float(np.max(np.abs(old_times - new_times))),
                                        float(np.max(np.abs(old_values - new_values))))
    if max_sample_difference > 1e-4:
        raise AssertionError(f"Animation data changed: max delta {max_sample_difference}")
    return {"baseline": old, "candidate": new,
            "saved_draw_calls_per_knight": old["primitive_draw_count"] - new["primitive_draw_count"],
            "animation_max_sample_delta": max_sample_difference,
            "runtime_publish_allowed": False}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline-run", type=Path, required=True)
    parser.add_argument("--candidate-run", type=Path, required=True)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    rows = []
    for lod in (0, 1):
        rows.append(compare(args.baseline_run / "candidate" / f"knight-lod{lod}.glb",
                            args.candidate_run / "candidate" / f"knight-lod{lod}.glb"))
    result = {"status": "candidate-needs-scene-review", "lods": rows,
              "total_saved_draw_calls_per_lod_switch": [r["saved_draw_calls_per_knight"] for r in rows],
              "runtime_publish_allowed": False}
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps([{"lod": i, "before": r["baseline"]["primitive_draw_count"],
                       "after": r["candidate"]["primitive_draw_count"],
                       "animation_max_delta": r["animation_max_sample_delta"]}
                      for i, r in enumerate(rows)], indent=2))


if __name__ == "__main__":
    main()
