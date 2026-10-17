"""Smooth-shaded diagnostic renders from the saved review Blend; never solves or saves geometry."""

import hashlib
import json
import struct
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_quadri_blender import render


ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-quadri-scaled/2026-10-05/revision-v2-checkpointed"
BLEND = RUN / "candidate/original-guard-quadri-review.blend"
RENDERS = RUN / "qa/renders"
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


def mesh_geometry_digest(mesh):
    """Hash geometric data only, excluding polygon smooth flags and split normals."""
    digest = hashlib.sha256()
    for vertex in mesh.vertices:
        digest.update(struct.pack("<3f", *vertex.co))
    for polygon in mesh.polygons:
        digest.update(b"".join(int(v).to_bytes(4, "little") for v in polygon.vertices))
    return digest.hexdigest()


def main():
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    body = bpy.data.objects["OriginalGuardQuadriCanonicalCandidate"]
    reference = bpy.data.objects["AcceptedOriginalSourceReference"]
    reference.hide_render = True
    before = mesh_geometry_digest(body.data)
    for polygon in body.data.polygons:
        polygon.use_smooth = True
    body.data.update()
    after = mesh_geometry_digest(body.data)
    if before != after:
        raise AssertionError("Smooth shading changed mesh vertex coordinates or face indices")
    RENDERS.mkdir(parents=True, exist_ok=True)
    hashes = {}
    for name, (target, location, scale) in VIEWS.items():
        output = RENDERS / f"retopo-smooth-{name}.png"
        render(output, body, target, location, scale)
        hashes[output.name] = hashlib.sha256(output.read_bytes()).hexdigest()
        print("SMOOTH_RENDERED " + name, flush=True)
    report = {
        "status": "diagnostic_only",
        "runtime_publish_allowed": False,
        "source_review_blend_sha256": hashlib.sha256(BLEND.read_bytes()).hexdigest(),
        "geometry_sha256_before": before,
        "geometry_sha256_after": after,
        "mesh_geometry_unchanged": before == after,
        "shading_change": "all candidate polygons use smooth normals in memory; no Blend or GLB resaved",
        "views": VIEWS,
        "render_sha256": hashes,
    }
    (RUN / "qa/smooth-inspection.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("SMOOTH_INSPECTION_DONE " + json.dumps(report), flush=True)


if __name__ == "__main__":
    main()
