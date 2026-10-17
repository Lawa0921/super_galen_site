"""One authorized identical QuadriFlow rebuild with immediate raw/Blend/GLB checkpoints."""

import hashlib
import json
import subprocess
import sys
import time
import traceback
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_quadri_blender import create_mesh
from original_guard_quadri_scaled_blender import (FACTOR, PREPARED, PREPARED_SHA,
                                                  SOURCE, SOURCE_SHA,
                                                  actual_blender_preflight,
                                                  canonical_from_native,
                                                  extended_topology, mesh_positions,
                                                  set_positions)
from original_guard_quadri_scaled_math import scale_float32_exact


ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-quadri-scaled/2026-10-05/revision-v2-checkpointed"
QA = RUN / "qa"
CANDIDATE = RUN / "candidate"


def record(stage, **details):
    entry = {"stage": stage, "utc_epoch": time.time(), **details}
    (QA / "progress.json").write_text(json.dumps(entry, indent=2) + "\n", encoding="utf-8")
    print("CHECKPOINTED_QUADRI_STAGE " + json.dumps(entry), flush=True)


def raw_polygon_arrays(mesh):
    offsets = np.zeros(len(mesh.polygons) + 1, dtype=np.int32)
    sizes = np.array([len(poly.vertices) for poly in mesh.polygons], dtype=np.int32)
    offsets[1:] = np.cumsum(sizes)
    indices = np.empty(int(offsets[-1]), dtype=np.int32)
    for index, poly in enumerate(mesh.polygons):
        indices[offsets[index]:offsets[index + 1]] = poly.vertices[:]
    return offsets, indices


def main():
    started = time.perf_counter()
    QA.mkdir(parents=True, exist_ok=True)
    CANDIDATE.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != SOURCE_SHA:
        raise ValueError("Accepted original GLB hash changed")
    if hashlib.sha256(PREPARED.read_bytes()).hexdigest() != PREPARED_SHA:
        raise ValueError("Exact-primary NPZ hash changed")
    data = np.load(PREPARED)
    native, faces = data["vertices"], data["triangles"]
    scaled = scale_float32_exact(native, FACTOR)
    body = create_mesh("OriginalGuardQuadriScaledInput", scaled, faces)
    preflight = actual_blender_preflight(body, scaled, faces)
    (QA / "blender-preflight.json").write_text(json.dumps(preflight, indent=2) + "\n", encoding="utf-8")
    record("preflight_pass", near_edges=preflight["near_edge_count"],
           minimum_linf=preflight["minimum_linf_scaled_edge_m"])
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    operator = {"mode": "FACES", "target_faces": 12000,
                "use_preserve_sharp": True, "use_preserve_boundary": True,
                "use_mesh_symmetry": False, "preserve_attributes": False, "seed": 0}
    record("solver_running", operator=operator)
    solver_started = time.perf_counter()
    result = bpy.ops.object.quadriflow_remesh(**operator)
    solver_seconds = time.perf_counter() - solver_started
    record("solver_returned", result=list(result), solver_seconds=solver_seconds)
    if "FINISHED" not in result:
        raise RuntimeError(f"Checkpointed QuadriFlow returned {result}")

    # First persist the exact float32 solver output. No camera, distance, or
    # render setup can run before this checkpoint is on disk.
    solved_scaled = mesh_positions(body)
    offsets, polygon_indices = raw_polygon_arrays(body.data)
    raw = CANDIDATE / "raw-solver-scaled.npz"
    np.savez(raw, vertices_scaled_float32=solved_scaled,
             face_offsets=offsets, face_vertex_indices=polygon_indices)
    record("raw_npz_saved", raw_sha256=hashlib.sha256(raw.read_bytes()).hexdigest(),
           raw_vertices=len(solved_scaled), raw_faces=len(body.data.polygons))

    canonical = canonical_from_native(solved_scaled / np.float32(FACTOR))
    set_positions(body, canonical)
    body.name = "OriginalGuardQuadriCanonicalCandidate"
    blend = CANDIDATE / "original-guard-quadri-scaled-checkpoint.blend"
    glb = CANDIDATE / "original-guard-quadri-scaled-checkpoint.glb"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    record("blend_checkpoint_saved", blend_sha256=hashlib.sha256(blend.read_bytes()).hexdigest())
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", use_selection=True,
                              export_animations=False, export_materials="NONE")
    record("glb_checkpoint_saved", glb_sha256=hashlib.sha256(glb.read_bytes()).hexdigest())

    mesh_topology = extended_topology(body)
    report = {"status": "qa_failed_pending_visual_diagnosis", "runtime_publish_allowed": False,
              "rebuild_reason": "First scaled solver succeeded but unsaved geometry was lost to scene.world render setup bug",
              "input_unchanged": True, "source_sha256": SOURCE_SHA, "prepared_sha256": PREPARED_SHA,
              "blender_version": bpy.app.version_string,
              "blender_commit": bpy.app.build_hash.decode("ascii"),
              "operator": operator, "operator_result": list(result),
              "mesh_data_scale": FACTOR, "preflight": preflight,
              "checkpoint_topology": mesh_topology,
              "canonical_bounds": [canonical.min(axis=0).tolist(), canonical.max(axis=0).tolist()],
              "solver_seconds": solver_seconds, "total_seconds": time.perf_counter() - started,
              "checkpoint_sha256": {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                                    for p in (raw, blend, glb)},
              "checkpoint_written_before_qa": True,
              "topology_not_automatically_repaired": True}
    (QA / "checkpoint-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    record("checkpoint_complete", status=report["status"], topology=mesh_topology)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        QA.mkdir(parents=True, exist_ok=True)
        (QA / "solver-failure.json").write_text(json.dumps({
            "status": "qa_failed", "runtime_publish_allowed": False,
            "error": str(exc), "error_type": type(exc).__name__,
            "traceback": traceback.format_exc()}, indent=2) + "\n", encoding="utf-8")
        raise
