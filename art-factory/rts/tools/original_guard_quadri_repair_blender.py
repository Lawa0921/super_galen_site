"""Export exact local topology repair from frozen NPZ; no QuadriFlow invocation."""

import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_quadri_scaled_blender import extended_topology, mesh_positions


ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-quadri-repair/2026-10-05"
INPUT = RUN / "candidate/original-guard-quadri-repaired-canonical.npz"
CANDIDATE = RUN / "candidate"
QA = RUN / "qa"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    if not INPUT.exists():
        raise FileNotFoundError("Run exact local repair preparation before Blender export")
    data = np.load(INPUT)
    vertices = data["vertices"]
    offsets = data["face_offsets"]
    indices = data["face_vertex_indices"]
    polygons = [indices[offsets[i]:offsets[i + 1]].tolist()
                for i in range(len(offsets) - 1)]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mesh = bpy.data.meshes.new("OriginalGuardExactLocalRepairMesh")
    mesh.from_pydata(vertices.tolist(), [], polygons)
    mesh.update()
    body = bpy.data.objects.new("OriginalGuardExactLocalRepairTemporaryCaps", mesh)
    bpy.context.collection.objects.link(body)
    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    actual = mesh_positions(body)
    if not np.array_equal(actual.view(np.uint32), vertices.view(np.uint32)):
        raise ValueError("Blender changed a repaired vertex coordinate")
    topology = extended_topology(body)
    for key in ("boundary_edges", "nonmanifold_edges", "zero_area_faces",
                "inconsistent_winding_edges", "nonmanifold_vertices"):
        if topology[key] != 0:
            raise ValueError(f"Post-repair {key}={topology[key]}")
    if topology["vertex_components"] != 1:
        raise ValueError("Post-repair mesh is not one connected body")
    blend = CANDIDATE / "original-guard-quadri-repaired.blend"
    glb = CANDIDATE / "original-guard-quadri-repaired.glb"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB",
                              use_selection=True, export_animations=False,
                              export_materials="NONE")
    report = {
        "status": "topology_pass_pending_surface_and_visual_qa",
        "runtime_publish_allowed": False,
        "blender_version": bpy.app.version_string,
        "blender_commit": bpy.app.build_hash.decode("ascii"),
        "repaired_npz_sha256": digest(INPUT),
        "blender_positions_bits_equal_npz": True,
        "topology": topology,
        "blend_sha256": digest(blend),
        "glb_sha256": digest(glb),
        "repair_method": "named exact-coordinate welds, 11 zero-area quad removals, 3/3/3/7 temporary hole caps only",
    }
    (QA / "blender-export.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("REPAIR_EXPORT_DONE " + json.dumps(report), flush=True)


if __name__ == "__main__":
    QA.mkdir(parents=True, exist_ok=True)
    main()
