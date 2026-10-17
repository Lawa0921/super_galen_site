"""Read saved repair Blend; inspect cap crossings, source distances, and smooth gray views."""

import hashlib
import json
import struct
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_quadri_blender import create_mesh, render, sampled_surface_distance
from original_guard_quadri_scaled_blender import PREPARED, canonical_from_native, extended_topology
from original_guard_quadri_scaled_postprocess import setup_render


ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-quadri-repair/2026-10-05"
BLEND = RUN / "candidate/original-guard-quadri-repaired.blend"
NPZ = RUN / "candidate/original-guard-quadri-repaired-canonical.npz"
QA = RUN / "qa"
RENDERS = QA / "renders"
VIEWS = {
    "front": ((0, 0, .93), (0, 4, .93), 2.25),
    "side": ((0, 0, .93), (4, 0, .93), 2.25),
    "back": ((0, 0, .93), (0, -4, .93), 2.25),
    "head-shoulders": ((0, 0, 1.54), (0, 2.4, 1.54), .92),
    "left-hand": ((-.39, 0, .86), (-.39, 1.6, .86), .43),
    "right-hand": ((.39, 0, .86), (.39, 1.6, .86), .43),
    "right-arm-edge": ((.32, 0, 1.18), (1.5, 2.2, 1.4), .76),
    "skirt-edge": ((0, 0, .6), (1.1, 2.2, .8), .85),
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def geometry_hash(mesh):
    h = hashlib.sha256()
    for vertex in mesh.vertices:
        h.update(struct.pack("<3f", *vertex.co))
    for polygon in mesh.polygons:
        h.update(b"".join(int(v).to_bytes(4, "little") for v in polygon.vertices))
    return h.hexdigest()


def patch_overlap_report(body, patch_face_ids):
    mesh = body.data
    mesh.calc_loop_triangles()
    vertices = [vertex.co[:] for vertex in mesh.vertices]
    patch = [tuple(tri.vertices) for tri in mesh.loop_triangles
             if tri.polygon_index in patch_face_ids]
    rest = [tuple(tri.vertices) for tri in mesh.loop_triangles
            if tri.polygon_index not in patch_face_ids]
    patch_bvh = BVHTree.FromPolygons(vertices, patch, all_triangles=True)
    rest_bvh = BVHTree.FromPolygons(vertices, rest, all_triangles=True)
    overlaps = patch_bvh.overlap(rest_bvh)
    disjoint = [(int(p), int(r)) for p, r in overlaps
                if not set(patch[p]).intersection(rest[r])]
    patch_self = patch_bvh.overlap(patch_bvh)
    self_disjoint = [(int(a), int(b)) for a, b in patch_self
                     if a < b and not set(patch[a]).intersection(patch[b])]
    return {"method": "Blender BVHTree triangle overlap; exclude triangles sharing an existing vertex as incident contacts",
            "patch_triangles": len(patch), "retained_triangles": len(rest),
            "raw_patch_rest_overlap_pairs": len(overlaps),
            "nonincident_patch_rest_overlap_pairs": len(disjoint),
            "nonincident_patch_rest_examples": disjoint[:20],
            "nonincident_patch_patch_overlap_pairs": len(self_disjoint),
            "nonincident_patch_patch_examples": self_disjoint[:20],
            "incident_contact_exclusion_limitation": "Shared-vertex pairs are reported as incident contacts, not proof of no crossing along those incident faces."}


def main():
    if not BLEND.exists() or not NPZ.exists():
        raise FileNotFoundError("Saved repair Blend and canonical NPZ required")
    RENDERS.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    body = bpy.data.objects["OriginalGuardExactLocalRepairTemporaryCaps"]
    npz = np.load(NPZ)
    patch_ids = set(npz["patch_face_indices"].tolist())
    intersections = patch_overlap_report(body, patch_ids)
    topology = extended_topology(body)
    source = np.load(PREPARED)
    reference = create_mesh("AcceptedOriginalSourceReference",
                            canonical_from_native(source["vertices"]), source["triangles"])
    reference.hide_render = True
    distances = {
        "source_to_repair": sampled_surface_distance(reference, body),
        "repair_to_source": sampled_surface_distance(body, reference),
    }
    before = geometry_hash(body.data)
    gray = setup_render()
    body.data.materials.append(gray)
    reference.data.materials.append(gray)
    for polygon in body.data.polygons:
        polygon.use_smooth = True
    body.data.update()
    after = geometry_hash(body.data)
    if before != after:
        raise AssertionError("Smooth shading changed geometry")
    body.hide_render = True
    for name, (target, location, scale) in VIEWS.items():
        render(RENDERS / f"repair-smooth-{name}.png", body, target, location, scale)
        print("REPAIR_RENDERED " + name, flush=True)
    reference.hide_render = True
    reference.hide_set(True)
    body.hide_render = False
    review_blend = RUN / "candidate/original-guard-quadri-repair-review.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(review_blend))
    crossings = intersections["nonincident_patch_rest_overlap_pairs"] + intersections["nonincident_patch_patch_overlap_pairs"]
    report = {
        "status": "qa_failed" if crossings else "topology_and_patch_crossings_pass_pending_independent_visual_review",
        "runtime_publish_allowed": False,
        "geometry_hash_before_smooth": before, "geometry_hash_after_smooth": after,
        "topology": topology, "patch_overlap": intersections,
        "surface_distance_m": distances,
        "review_blend_sha256": digest(review_blend),
        "render_sha256": {path.name: digest(path) for path in sorted(RENDERS.glob("repair-smooth-*.png"))},
        "source_reference_sha256": digest(PREPARED),
        "diagnostic_only": True,
    }
    (QA / "review.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("REPAIR_REVIEW_DONE " + json.dumps(report), flush=True)


if __name__ == "__main__":
    main()
