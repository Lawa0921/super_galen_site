"""Project only seven one-ring interior vertices to accepted source BVH and checkpoint."""

import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_quadri_scaled_blender import (PREPARED, canonical_from_native,
                                                  extended_topology, mesh_positions)


ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-quadri-repair/2026-10-05/revision-one-ring-source-guided"
PROPOSAL = RUN / "candidate/one-ring-topology-proposal.npz"
SOURCE_SHA = "7851c7d91364e773b4e32e358740f37f43660e2d0cfbc9159f13245470a86edd"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if sha(PREPARED) != SOURCE_SHA:
        raise ValueError("Accepted original source preparation changed")
    proposal = np.load(PROPOSAL)
    initial = proposal["vertices_initial"]
    outer = proposal["outer_vertex_ids"]
    inner = proposal["inner_vertex_ids"]
    source = np.load(PREPARED)
    source_vertices = canonical_from_native(source["vertices"])
    source_triangles = source["triangles"]
    triples = source_vertices[source_triangles].astype(np.float64)
    double_area = np.linalg.norm(np.cross(triples[:, 1] - triples[:, 0],
                                          triples[:, 2] - triples[:, 0]), axis=1)
    true_degenerate = double_area == 0
    clean_triangles = source_triangles[~true_degenerate]
    source_bvh = BVHTree.FromPolygons(source_vertices.tolist(), clean_triangles.tolist(),
                                     all_triangles=True)
    final = initial.copy()
    moves = []
    for vertex_id in inner:
        vertex_id = int(vertex_id)
        hit = source_bvh.find_nearest(Vector(initial[vertex_id]))
        if hit[0] is None:
            raise ValueError(f"No source surface near ROI interior vertex {vertex_id}")
        projected = np.asarray(hit[0][:], dtype=np.float32)
        final[vertex_id] = projected
        moves.append({"vertex_id": vertex_id, "before_m": initial[vertex_id].tolist(),
                      "source_guided_after_m": projected.tolist(),
                      "source_triangle_index_after_degenerate_filter": int(hit[2]),
                      "source_nearest_distance_before_m": float(hit[3]),
                      "actual_displacement_m": float(np.linalg.norm(projected.astype(np.float64) - initial[vertex_id]))})
    if not np.array_equal(final[outer].view(np.uint32), initial[outer].view(np.uint32)):
        raise ValueError("Fixed 21-vertex outer boundary moved")
    if np.count_nonzero(np.any(final.view(np.uint32) != initial.view(np.uint32), axis=1)) > len(inner):
        raise ValueError("A vertex outside the seven source-guided intermediates moved")
    offsets, indices = proposal["face_offsets"], proposal["face_vertex_indices"]
    faces = [indices[offsets[i]:offsets[i + 1]].tolist() for i in range(len(offsets) - 1)]
    output = RUN / "candidate/one-ring-source-guided-canonical.npz"
    np.savez_compressed(output, vertices=final, face_offsets=offsets,
                        face_vertex_indices=indices,
                        patch_face_indices=proposal["patch_face_indices"],
                        outer_vertex_ids=outer, inner_vertex_ids=inner)
    mesh = bpy.data.meshes.new("OriginalGuardSourceGuidedOneRingMesh")
    mesh.from_pydata(final.tolist(), [], faces)
    mesh.update()
    body = bpy.data.objects.new("OriginalGuardSourceGuidedOneRingTemporaryPatch", mesh)
    bpy.context.collection.objects.link(body)
    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    if not np.array_equal(mesh_positions(body).view(np.uint32), final.view(np.uint32)):
        raise ValueError("Blender changed a one-ring vertex coordinate")
    topology = extended_topology(body)
    blend = RUN / "candidate/original-guard-quadri-one-ring.blend"
    glb = RUN / "candidate/original-guard-quadri-one-ring.glb"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB",
                              use_selection=True, export_animations=False,
                              export_materials="NONE")
    report = {"status": "pending_patch_collision_and_visual_qa", "runtime_publish_allowed": False,
              "source_prepared_sha256": sha(PREPARED), "source_triangles_input": len(source_triangles),
              "source_true_degenerate_triangles_excluded": int(np.sum(true_degenerate)),
              "source_triangles_used_for_bvh": len(clean_triangles),
              "initial_proposal_sha256": sha(PROPOSAL), "final_npz_sha256": sha(output),
              "outer_vertex_count_fixed_bit_exact": len(outer),
              "source_guided_inner_moves": moves,
              "max_intermediate_displacement_m": max(row["actual_displacement_m"] for row in moves),
              "topology": topology, "blend_sha256": sha(blend), "glb_sha256": sha(glb),
              "no_global_solver_or_outer_vertex_movement": True}
    (RUN / "qa/bvh-checkpoint.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("ONE_RING_CHECKPOINT_DONE " + json.dumps({key: report[key] for key in (
        "source_true_degenerate_triangles_excluded", "max_intermediate_displacement_m", "topology")}), flush=True)


if __name__ == "__main__":
    main()
