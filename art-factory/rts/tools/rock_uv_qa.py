"""Measure rock UV texel-density collapse and stretch before/after repair."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from knight_optimization_qa import accessor, read_glb


RUN = Path(__file__).resolve().parents[1] / "runs" / "all-models" / "2026-10-14-props"


def measure(path: Path) -> dict:
    gltf, binary = read_glb(path)
    primitive = gltf["meshes"][0]["primitives"][0]
    positions = accessor(gltf, binary, primitive["attributes"]["POSITION"])
    uv = accessor(gltf, binary, primitive["attributes"]["TEXCOORD_0"])
    indices = accessor(gltf, binary, primitive["indices"]).reshape(-1)
    densities = []
    collapsed = 0
    for triangle in indices.reshape(-1, 3):
        for first, second in ((triangle[0], triangle[1]), (triangle[1], triangle[2]), (triangle[2], triangle[0])):
            world_length = float(np.linalg.norm(positions[first] - positions[second]))
            uv_length = float(np.linalg.norm(uv[first] - uv[second]))
            density = uv_length / max(world_length, 1.0e-8)
            densities.append(density)
            collapsed += int(density < 0.05)
    values = np.asarray(densities)
    return {"path": str(path), "edges": len(values), "density_min": float(values.min()),
            "density_p01": float(np.percentile(values, 1)), "density_median": float(np.median(values)),
            "density_p99": float(np.percentile(values, 99)), "density_max": float(values.max()),
            "density_max_min": float(values.max() / max(values.min(), 1.0e-8)),
            "collapsed_edges_lt_0_05": collapsed}


def main() -> None:
    baseline = measure(RUN / "raw" / "before" / "rock.glb")
    candidate = measure(RUN / "final" / "candidate" / "rock.glb")
    result = {"baseline": baseline, "candidate": candidate,
              "pass": candidate["collapsed_edges_lt_0_05"] == 0 and candidate["density_max_min"] < 4.0,
              "runtime_publish_allowed": False}
    output = RUN / "qa" / "rock-uv-qa.json"
    output.write_bytes((json.dumps(result, indent=2) + "\n").encode("utf-8"))
    print(json.dumps(result, indent=2))
    if not result["pass"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
