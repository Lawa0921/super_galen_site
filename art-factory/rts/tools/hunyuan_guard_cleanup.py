"""Remove the generated floor slab while preserving the original raw candidate.

Run with Blender 5.2:
  blender --background --python hunyuan_guard_cleanup.py -- INPUT.glb RUN_DIR

The measured slab occupies source Y -0.980871..-0.969072.  Blender's glTF
import maps source Y to Blender Z, so the recorded cut is 0.0005 above its
highest point.  The operation caps the resulting boot boundary and never
modifies INPUT.glb or raw/rawmesh.ply.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


SLAB_MIN_SOURCE_Y = -0.9808706045150757
SLAB_MAX_SOURCE_Y = -0.969071626663208
CUT_SOURCE_Y = -0.9685


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    low = Vector(tuple(min(point[i] for point in corners) for i in range(3)))
    high = Vector(tuple(max(point[i] for point in corners) for i in range(3)))
    return low, high


def triangle_count(obj: bpy.types.Object) -> int:
    return sum(len(poly.vertices) - 2 for poly in obj.data.polygons)


def planar_cap_report(obj: bpy.types.Object, cut_z: float, tolerance: float = 5e-4) -> dict:
    mesh = obj.data
    planar_faces = [
        polygon for polygon in mesh.polygons
        if polygon.vertices and all(abs(mesh.vertices[index].co.z - cut_z) <= tolerance for index in polygon.vertices)
    ]
    adjacency: dict[int, set[int]] = {polygon.index: set() for polygon in planar_faces}
    edge_owner: dict[tuple[int, int], int] = {}
    for polygon in planar_faces:
        vertices = list(polygon.vertices)
        for a, b in zip(vertices, vertices[1:] + vertices[:1]):
            edge = tuple(sorted((a, b)))
            previous = edge_owner.get(edge)
            if previous is None:
                edge_owner[edge] = polygon.index
            else:
                adjacency[polygon.index].add(previous)
                adjacency[previous].add(polygon.index)
    by_index = {polygon.index: polygon for polygon in planar_faces}
    remaining = set(adjacency)
    islands = []
    while remaining:
        seed = remaining.pop()
        stack = [seed]
        component = {seed}
        while stack:
            current = stack.pop()
            for neighbor in adjacency[current]:
                if neighbor in remaining:
                    remaining.remove(neighbor)
                    component.add(neighbor)
                    stack.append(neighbor)
        faces = [by_index[index] for index in component]
        area = sum(face.area for face in faces)
        center = sum((face.center * face.area for face in faces), Vector()) / area
        islands.append({"faces": len(faces), "area": area, "center_blender_xyz": list(center)})
    islands.sort(key=lambda item: item["center_blender_xyz"][0])
    return {"planar_faces": len(planar_faces), "island_count": len(islands), "islands": islands}


def main() -> None:
    args = sys.argv[sys.argv.index("--") + 1 :]
    if len(args) != 2:
        raise SystemExit("Expected INPUT.glb RUN_DIR")
    source, run_dir = [Path(value).resolve() for value in args]
    candidate_dir, qa_dir = run_dir / "candidate", run_dir / "qa"
    candidate_dir.mkdir(parents=True, exist_ok=True)
    qa_dir.mkdir(parents=True, exist_ok=True)
    output_glb = candidate_dir / "candidate-body.glb"
    output_ply = candidate_dir / "candidate-body.ply"

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(source))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(objects) != 1:
        raise RuntimeError(f"Expected one mesh, found {len(objects)}")
    obj = objects[0]
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    before_low, before_high = bounds(obj)
    before = {"vertices": len(obj.data.vertices), "triangles": triangle_count(obj),
              "bounds_blender_xyz": {"minimum": list(before_low), "maximum": list(before_high)}}

    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.bisect(
        plane_co=(0.0, 0.0, CUT_SOURCE_Y),
        plane_no=(0.0, 0.0, 1.0),
        clear_inner=True,
        clear_outer=False,
        use_fill=True,
    )
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.data.update()
    after_low, after_high = bounds(obj)
    cap = planar_cap_report(obj, after_low.z)
    after = {"vertices": len(obj.data.vertices), "triangles": triangle_count(obj),
             "bounds_blender_xyz": {"minimum": list(after_low), "maximum": list(after_high)}}

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(filepath=str(output_glb), export_format="GLB", use_selection=True)
    bpy.ops.wm.ply_export(filepath=str(output_ply), export_selected_objects=True)
    report = {
        "status": "cleanup_candidate_manual_review_required",
        "runtime_publish_allowed": False,
        "source_preserved": True,
        "source": str(source),
        "source_sha256": sha256(source),
        "output_glb": str(output_glb),
        "output_glb_sha256": sha256(output_glb),
        "output_ply": str(output_ply),
        "output_ply_sha256": sha256(output_ply),
        "measured_floor_slab_source_y": [SLAB_MIN_SOURCE_Y, SLAB_MAX_SOURCE_Y],
        "cut_source_y_and_blender_z": CUT_SOURCE_Y,
        "cut_margin_above_slab": CUT_SOURCE_Y - SLAB_MAX_SOURCE_Y,
        "operation": "Blender mesh bisect; remove below cut; fill cut boundary",
        "disclosure": "The cut removes the lowest 0.03137 source units (1.57% of original body height), including the slab and boot geometry penetrating it, then caps the two boot boundaries.",
        "before": before,
        "after": after,
        "cap": cap,
        "limitations": [
            "This deterministic cleanup does not repair unrelated arm, hand, garment, or surface artifacts.",
            "Manual visual review must confirm that both boots remain intact above the disclosed cut plane.",
        ],
    }
    (qa_dir / "cleanup.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n"
    )
    print("HUNYUAN_GUARD_CLEANUP=" + json.dumps(report))


if __name__ == "__main__":
    main()
