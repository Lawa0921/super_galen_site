"""Repair rock UV stretch using face-local, distance-preserving projections."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


TILE_SCALE = 0.5


def edge_frame(mesh, polygon):
    normal = polygon.normal.normalized()
    loops = list(polygon.loop_indices)
    vertices = [mesh.vertices[mesh.loops[index].vertex_index].co.copy() for index in loops]
    longest = max(
        (vertices[(index + 1) % len(vertices)] - vertices[index] for index in range(len(vertices))),
        key=lambda vector: vector.length,
    )
    tangent = longest - normal * longest.dot(normal)
    if tangent.length < 1.0e-8:
        tangent = normal.cross(Vector((0.0, 0.0, 1.0)))
        if tangent.length < 1.0e-8:
            tangent = normal.cross(Vector((0.0, 1.0, 0.0)))
    tangent.normalize()
    bitangent = normal.cross(tangent).normalized()
    return tangent, bitangent


def remap(obj):
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.triangulate(bm, faces=list(bm.faces), quad_method="BEAUTY", ngon_method="BEAUTY")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    uv = mesh.uv_layers.get("Architectural UV") or mesh.uv_layers.new(name="Architectural UV")
    mesh.uv_layers.active = uv
    before = []
    for polygon in mesh.polygons:
        tangent, bitangent = edge_frame(mesh, polygon)
        for loop_index in polygon.loop_indices:
            coordinate = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            before.append(tuple(uv.data[loop_index].uv))
            uv.data[loop_index].uv = (
                coordinate.dot(tangent) * TILE_SCALE,
                coordinate.dot(bitangent) * TILE_SCALE,
            )
    return {"object": obj.name, "vertices": len(mesh.vertices), "triangles": sum(len(p.vertices) - 2 for p in mesh.polygons),
            "uv_min": [min(float(data.uv[j]) for data in uv.data) for j in range(2)],
            "uv_max": [max(float(data.uv[j]) for data in uv.data) for j in range(2)],
            "method": "face-local-longest-edge-orthonormal-frame", "tile_scale": TILE_SCALE}


def export_joined(run: Path) -> dict:
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(meshes) != 4:
        raise AssertionError(f"Expected four rock source meshes, got {len(meshes)}")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = "GrayRock joined geometry"
    output = run / "candidate" / "rock.glb"
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output), export_format="GLB", use_selection=True,
        export_yup=True, export_apply=True, export_normals=True,
        export_texcoords=True, export_materials="EXPORT", export_extras=True,
    )
    return {"candidate": str(output), "candidate_sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
            "candidate_bytes": output.stat().st_size, "triangles": sum(len(p.vertices) - 2 for p in joined.data.polygons),
            "mesh_count": 1}


def main() -> None:
    run = Path(os.environ["PROPS_RUN"]).resolve()
    source = run / "raw" / "source" / "rock.blend"
    bpy.ops.wm.open_mainfile(filepath=str(source))
    rows = [remap(obj) for obj in bpy.context.scene.objects if obj.type == "MESH"]
    repaired_source = run / "raw" / "repaired" / "rock.blend"
    repaired_source.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(repaired_source), compress=True)
    export = export_joined(run)
    report = {"source": str(source), "repaired_source": str(repaired_source), "uv": rows, "export": export,
              "runtime_publish_allowed": False}
    output = run / "qa" / "rock-uv-repair.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes((json.dumps(report, indent=2) + "\n").encode("utf-8"))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
