"""Mechanical and animated numerical QA for siege rigid-skin batching."""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path

import numpy as np

from knight_optimization_qa import accessor, read_glb
from siege_rigid_skin_math import (animation_sample, animation_times, instance_matrix,
                                   normalized, rigid_world_normals, three_skin_normals,
                                   transform_positions, world_matrices)


CLIPS = {"Idle", "Walk", "Attack", "Hurt", "Death"}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def image_hashes(gltf: dict, binary: bytes) -> list[str]:
    hashes = []
    for image in gltf.get("images", []):
        view = gltf["bufferViews"][image["bufferView"]]
        offset = view.get("byteOffset", 0)
        hashes.append(hashlib.sha256(binary[offset : offset + view["byteLength"]]).hexdigest())
    return hashes


def material_triangles(gltf: dict) -> dict:
    result = Counter()
    for mesh in gltf["meshes"]:
        for primitive in mesh["primitives"]:
            name = gltf["materials"][primitive["material"]]["name"]
            result[name] += gltf["accessors"][primitive["indices"]]["count"] // 3
    return dict(sorted(result.items()))


def structural(baseline: Path, candidate: Path) -> tuple[dict, dict, bytes, dict, bytes]:
    old, old_bin = read_glb(baseline)
    new, new_bin = read_glb(candidate)
    original_nodes = len(old["nodes"])
    baseline_draws = sum(len(mesh["primitives"]) for mesh in old["meshes"])
    candidate_draws = sum(len(mesh["primitives"]) for mesh in new["meshes"])
    if baseline_draws != 29 or candidate_draws != 8:
        raise AssertionError(f"Expected 29 to 8 draws, got {baseline_draws} to {candidate_draws}")
    if len(new.get("skins", [])) != 1 or len(new["skins"][0]["joints"]) != 13:
        raise AssertionError("Expected one skin with 13 original mesh-node joints")
    if len(new["nodes"]) != original_nodes + 1:
        raise AssertionError("Expected exactly one appended skinned-mesh node")
    if not new_bin.startswith(old_bin):
        raise AssertionError("Original binary animation, geometry, or image payload changed")
    for index, before in enumerate(old["nodes"]):
        after = new["nodes"][index].copy()
        after.pop("mesh", None)
        expected = before.copy()
        expected.pop("mesh", None)
        if after != expected:
            raise AssertionError(f"Original hierarchy/TRS altered at node {index}")
    for key in ("animations", "materials", "images", "textures", "samplers"):
        if old.get(key) != new.get(key):
            raise AssertionError(f"Original {key} changed")
    if {anim["name"] for anim in new["animations"]} != CLIPS:
        raise AssertionError("Five exact clips missing")
    original_roots = old["scenes"][old.get("scene", 0)]["nodes"]
    candidate_roots = new["scenes"][new.get("scene", 0)]["nodes"]
    if candidate_roots != original_roots + [original_nodes]:
        raise AssertionError("Skinned batch must be scene-root identity alongside original SiegeRoot")
    if image_hashes(old, old_bin) != image_hashes(new, new_bin):
        raise AssertionError("Original embedded texture payload changed")
    if material_triangles(old) != material_triangles(new):
        raise AssertionError("Per-material triangle count changed")
    retained = [i for i, node in enumerate(old["nodes"])
                if node.get("name") in {"WaxedBowstring_1", "WaxedBowstring_-1"}]
    if len(retained) != 2:
        raise AssertionError("Both animated non-uniform bowstrings must remain rigid")
    for node in retained:
        before = old["meshes"][old["nodes"][node]["mesh"]]
        after = new["meshes"][new["nodes"][node]["mesh"]]
        if before != after:
            raise AssertionError(f"Rigid string mesh altered: node {node}")
    for primitive in new["meshes"][0]["primitives"]:
        if not {"POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0"} <= set(primitive["attributes"]):
            raise AssertionError("Position/normal/UV/rigid skin attribute missing")
        joints = accessor(new, new_bin, primitive["attributes"]["JOINTS_0"])
        weights = accessor(new, new_bin, primitive["attributes"]["WEIGHTS_0"])
        if not np.all(joints[:, 1:] == 0) or not np.all(weights[:, 0] == 1) or not np.all(weights[:, 1:] == 0):
            raise AssertionError("Rigid joint assignment is not exactly weight-one")
        if int(joints[:, 0].max()) >= 13:
            raise AssertionError("Joint index exceeds skin")
    return ({"baseline": str(baseline), "baseline_sha256": sha256(baseline),
             "candidate": str(candidate), "candidate_sha256": sha256(candidate),
             "draws_before": baseline_draws, "draws_after": candidate_draws,
             "triangles_by_material": material_triangles(new),
             "image_sha256": image_hashes(new, new_bin),
             "original_node_count": original_nodes, "skin_joints": new["skins"][0]["joints"]},
            old, old_bin, new, new_bin)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline-run", type=Path, required=True)
    parser.add_argument("--candidate-run", type=Path, required=True)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    rows = []
    for lod in (0, 1):
        baseline = args.baseline_run / "candidate" / f"siege-lod{lod}.glb"
        candidate = args.candidate_run / "candidate" / f"siege-lod{lod}.glb"
        row, _, _, _, _ = structural(baseline, candidate)
        row["lod"] = lod
        rows.append(row)
    result = {"status": "candidate-needs-scene-review", "lods": rows,
              "runtime_publish_allowed": False}
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps([{"lod": r["lod"], "draws_before": r["draws_before"],
                       "draws_after": r["draws_after"]} for r in rows], indent=2))


if __name__ == "__main__":
    main()
