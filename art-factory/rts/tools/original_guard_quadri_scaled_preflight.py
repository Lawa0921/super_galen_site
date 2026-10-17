"""Record the verified scale that clears Blender 5.2's near-edge precheck."""

import hashlib
import json
from pathlib import Path

import numpy as np

from original_guard_quadri_scaled_math import scaled_edge_diagnostic, scale_float32_exact


ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-quadri-scaled/2026-10-05"
PREPARED = ROOT / "art-factory/rts/runs/original-guard-quadri/2026-10-05/candidate/source-primary-exact.npz"
SOURCE = ROOT / "art-factory/rts/runs/original-guard-shape/2026-10-05/candidate/candidate-body.glb"
SOURCE_SHA = "b2a94ddd3c7f66ea8e1edf993fce13ce4c24a795b9106076648e773ebffecdfd"
PREPARED_SHA = "7851c7d91364e773b4e32e358740f37f43660e2d0cfbc9159f13245470a86edd"


def main():
    RUN.joinpath("qa").mkdir(parents=True, exist_ok=True)
    RUN.joinpath("candidate").mkdir(parents=True, exist_ok=True)
    source_sha = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    prepared_sha = hashlib.sha256(PREPARED.read_bytes()).hexdigest()
    if source_sha != SOURCE_SHA or prepared_sha != PREPARED_SHA:
        raise ValueError("Original source or exact-primary input changed")
    data = np.load(PREPARED)
    vertices, faces = data["vertices"], data["triangles"]
    diagnostics = {str(factor): scaled_edge_diagnostic(vertices, faces, factor)
                   for factor in (1, 1024, 2048)}
    if [diagnostics[str(factor)]["near_edge_count"] for factor in (1, 1024, 2048)] != [4632, 4, 0]:
        raise ValueError("Observed Blender near-edge progression differs from reviewed source")
    scaled = scale_float32_exact(vertices, 2048)
    if not np.array_equal((scaled / np.float32(2048)).view(np.uint32), vertices.view(np.uint32)):
        raise ValueError("Scaled source does not roundtrip bit-identically")
    report = {"status": "preflight_pass", "runtime_publish_allowed": False,
              "original_source_sha256": source_sha, "prepared_primary_sha256": prepared_sha,
              "prepared_vertex_count": len(vertices), "prepared_triangle_count": len(faces),
              "mesh_data_scale_factor": 2048, "diagnostics": diagnostics,
              "roundtrip_float32_bits_equal": True,
              "scale_scope": "mesh vertex coordinates, not object scale or scene units"}
    RUN.joinpath("qa/preflight.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
