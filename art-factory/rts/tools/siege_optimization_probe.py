"""Audit siege draw calls by animated rigid domain before any mesh mutation.

The runtime-v1 GLB is read-only. A primitive is join-compatible only with the
same material under the same animated self/ancestor domain. Different wheel,
bow, winch, bolt, pennant and string pivots are never conflated.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import struct


EXPECTED_CLIPS = {"Idle", "Walk", "Attack", "Hurt", "Death"}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def glb_json(path: Path) -> dict:
    data = path.read_bytes()
    if data[:4] != b"glTF" or struct.unpack_from("<I", data, 8)[0] != len(data):
        raise AssertionError(f"Invalid GLB: {path}")
    size, kind = struct.unpack_from("<II", data, 12)
    if kind != 0x4E4F534A:
        raise AssertionError("No JSON chunk")
    return json.loads(data[20 : 20 + size])


def inventory(path: Path) -> dict:
    gltf = glb_json(path)
    nodes = gltf["nodes"]
    parents = {child: index for index, node in enumerate(nodes) for child in node.get("children", [])}
    if len(parents) != len(set(parents)):
        raise AssertionError("Multiple parents in node tree")
    animations = gltf.get("animations", [])
    if {animation["name"] for animation in animations} != EXPECTED_CLIPS:
        raise AssertionError("Unexpected clip names")
    animated = {channel["target"]["node"] for animation in animations
                for channel in animation["channels"] if "node" in channel["target"]}
    targets_by_clip = {
        animation["name"]: sorted({nodes[channel["target"]["node"]].get("name", "")
                                   for channel in animation["channels"] if "node" in channel["target"]})
        for animation in animations
    }
    records = []
    groups = defaultdict(list)
    for index, node in enumerate(nodes):
        if "mesh" not in node:
            continue
        current = index
        chain = []
        while True:
            chain.append(current)
            if current not in parents:
                break
            current = parents[current]
        domain_index = next((item for item in chain if item in animated), chain[-1])
        domain_name = nodes[domain_index].get("name", f"node-{domain_index}")
        for primitive in gltf["meshes"][node["mesh"]]["primitives"]:
            material = gltf["materials"][primitive["material"]]["name"]
            record = {
                "mesh_node": node.get("name", f"node-{index}"),
                "mesh_node_index": index,
                "material": material,
                "triangles": gltf["accessors"][primitive["indices"]]["count"] // 3,
                "animated_self": index in animated,
                "rigid_domain": domain_name,
                "rigid_domain_index": domain_index,
                "ancestor_chain": [nodes[item].get("name", f"node-{item}") for item in chain],
                "local_translation": node.get("translation", [0, 0, 0]),
                "local_rotation": node.get("rotation", [0, 0, 0, 1]),
            }
            records.append(record)
            groups[(domain_index, material)].append(record["mesh_node"])
    opportunities = [
        {"rigid_domain": nodes[domain].get("name", f"node-{domain}"),
         "material": material, "parts": parts, "potential_draw_saving": len(parts) - 1}
        for (domain, material), parts in sorted(groups.items()) if len(parts) > 1
    ]
    by_domain = defaultdict(list)
    for row in records:
        by_domain[row["rigid_domain"]].append(row["material"])
    return {
        "source": str(path), "source_sha256": sha256(path), "bytes": path.stat().st_size,
        "mesh_nodes": sum("mesh" in node for node in nodes),
        "primitive_draws": len(records),
        "materials": [material["name"] for material in gltf["materials"]],
        "triangles": sum(record["triangles"] for record in records),
        "clips": {animation["name"]: len(animation["channels"]) for animation in animations},
        "animated_target_nodes_by_clip": targets_by_clip,
        "animated_rigid_domain_materials": {key: value for key, value in sorted(by_domain.items())},
        "safe_join_opportunities": opportunities,
        "unique_rigid_domain_material_pairs": len(groups),
        "safe_primitive_draw_saving": sum(item["potential_draw_saving"] for item in opportunities),
        "primitive_records": records,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-run", type=Path, required=True)
    parser.add_argument("--output-run", type=Path, required=True)
    args = parser.parse_args()
    source = args.source_run.resolve()
    output = args.output_run.resolve()
    if source == output or output.is_relative_to(source):
        raise AssertionError("Never write into source run")
    qa = output / "qa"
    qa.mkdir(parents=True, exist_ok=True)
    rows = [inventory(source / "candidate" / f"siege-lod{lod}.glb") for lod in (0, 1)]
    if any(row["primitive_draws"] != 29 for row in rows):
        raise AssertionError("Expected runtime-v1 29-draw baseline")
    (qa / "animated-domain-inventory.json").write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")
    savings = [row["safe_primitive_draw_saving"] for row in rows]
    decision = {
        "status": "no_candidate_below_minimum_saving",
        "source": "2026-10-04-runtime-v1",
        "lod_primitive_draws": [row["primitive_draws"] for row in rows],
        "lod_animated_domain_material_lower_bound": [row["unique_rigid_domain_material_pairs"] for row in rows],
        "lod_safe_draw_savings": savings,
        "minimum_required_saving_per_lod": 6,
        "candidate_glb_or_blend_created": False,
        "reason": "Every primitive has a unique (animated rigid domain, material) pair. Cross-pivot joins would change independent animation; within each pivot, materials differ.",
        "runtime_publish_allowed": False,
    }
    if any(saving >= 6 for saving in savings):
        raise AssertionError("A qualifying opportunity was found; stop and build a reviewed candidate")
    (qa / "decision.json").write_text(json.dumps(decision, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(decision, indent=2))


if __name__ == "__main__":
    main()
