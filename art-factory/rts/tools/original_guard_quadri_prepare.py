"""Prepare the accepted source for QuadriFlow without changing its coordinates."""

import hashlib
import json
import time
from pathlib import Path

import numpy as np
import trimesh

from original_guard_quadri_mesh import retain_largest_closed_component


ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-quadri/2026-10-05"
SOURCE = ROOT / "art-factory/rts/runs/original-guard-shape/2026-10-05/candidate/candidate-body.glb"
SOURCE_SHA = "b2a94ddd3c7f66ea8e1edf993fce13ce4c24a795b9106076648e773ebffecdfd"


def main():
    start = time.perf_counter()
    RUN.joinpath("qa").mkdir(parents=True, exist_ok=True)
    RUN.joinpath("candidate").mkdir(parents=True, exist_ok=True)
    actual = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    if actual != SOURCE_SHA:
        raise ValueError(f"Unexpected original-source hash {actual}")
    mesh = trimesh.load(SOURCE, force="mesh", process=False)
    vertices, faces, report = retain_largest_closed_component(mesh.vertices, mesh.faces)
    if len(report["dropped_component_faces"]) != 4:
        raise ValueError(f"Expected four documented tiny islands: {report['dropped_component_faces']}")
    prepared = RUN / "candidate/source-primary-exact.npz"
    np.savez(prepared, vertices=vertices.astype(np.float32), triangles=faces.astype(np.int32))
    report.update({"source_sha256": actual,
                   "prepared_npz_sha256": hashlib.sha256(prepared.read_bytes()).hexdigest(),
                   "elapsed_seconds": time.perf_counter() - start,
                   "cleanup_policy": "exact position weld, zero-area and duplicate-triangle removal, largest closed component only; no coordinate averaging or voxel operation"})
    RUN.joinpath("qa/source-preparation.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()
