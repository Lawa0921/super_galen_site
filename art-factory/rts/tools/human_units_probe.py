"""Read-only component and coordinate diagnostics for original human body meshes."""

import argparse
import json
from collections import defaultdict
from pathlib import Path


UNITS = ("worker", "crossbow", "priest", "commander", "neutral-raider")


def vertex_components(vertex_count, edges):
    parent = list(range(vertex_count))

    def find(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    for first, second in edges:
        a, b = find(first), find(second)
        if a != b:
            parent[b] = a
    groups = defaultdict(list)
    for vertex in range(vertex_count):
        groups[find(vertex)].append(vertex)
    return sorted(groups.values(), key=len, reverse=True)


def welded_vertex_components(points, edges, tolerance=1e-6):
    """Treat coincident vertices split by UV seams as one geometric vertex."""
    first_at_position = {}
    connected = list(edges)
    for index, point in enumerate(points):
        key = tuple(round(float(value) / tolerance) for value in point)
        if key in first_at_position:
            connected.append((index, first_at_position[key]))
        else:
            first_at_position[key] = index
    return vertex_components(len(points), connected)


def inspect_blend(path):
    import bpy
    import bmesh

    bpy.ops.wm.open_mainfile(filepath=str(path))
    objects = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    if len(objects) != 1:
        raise ValueError(f"Expected one original body mesh in {path}, got {len(objects)}")
    obj = objects[0]
    mesh = obj.data
    edges = [edge.vertices[:] for edge in mesh.edges]
    raw_groups = vertex_components(len(mesh.vertices), edges)
    groups = welded_vertex_components([vertex.co for vertex in mesh.vertices], edges)
    group_for_vertex = {vertex: number for number, group in enumerate(groups) for vertex in group}
    triangles = [0] * len(groups)
    for polygon in mesh.polygons:
        triangles[group_for_vertex[polygon.vertices[0]]] += max(1, len(polygon.vertices) - 2)
    bounds = []
    for group in groups[:12]:
        points = [obj.matrix_world @ mesh.vertices[index].co for index in group]
        bounds.append({
            "vertices": len(group),
            "triangles": triangles[group_for_vertex[group[0]]],
            "minimum": [round(min(point[axis] for point in points), 6) for axis in range(3)],
            "maximum": [round(max(point[axis] for point in points), 6) for axis in range(3)],
        })
    bm = bmesh.new()
    bm.from_mesh(mesh)
    raw_boundary = sum(len(edge.link_faces) == 1 for edge in bm.edges)
    raw_nonmanifold = sum(len(edge.link_faces) != 2 for edge in bm.edges)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
    boundary = sum(len(edge.link_faces) == 1 for edge in bm.edges)
    nonmanifold = sum(len(edge.link_faces) != 2 for edge in bm.edges)
    bm.free()
    all_points = [obj.matrix_world @ vertex.co for vertex in mesh.vertices]
    return {
        "source": str(path),
        "mesh_name": obj.name,
        "vertices": len(mesh.vertices),
        "triangles": sum(max(1, len(poly.vertices) - 2) for poly in mesh.polygons),
        "uv_split_components": len(raw_groups),
        "uv_split_boundary_edges": raw_boundary,
        "uv_split_nonmanifold_edges": raw_nonmanifold,
        "welded_components": len(groups),
        "component_top_12": bounds,
        "minor_component_vertices_total": sum(len(group) for group in groups[1:]),
        "welded_boundary_edges": boundary,
        "welded_nonmanifold_edges": nonmanifold,
        "edge_closed_after_coordinate_weld": nonmanifold == 0,
        "watertight_status": "unverified: edge closure alone does not prove watertight or correctly oriented geometry",
        "world_bounds": {
            "minimum": [round(min(point[axis] for point in all_points), 6) for axis in range(3)],
            "maximum": [round(max(point[axis] for point in all_points), 6) for axis in range(3)],
        },
        "object_transform": {"location": list(obj.location), "rotation_euler": list(obj.rotation_euler), "scale": list(obj.scale)},
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", type=Path, required=True)
    parser.add_argument("--unit", choices=UNITS, required=True)
    args = parser.parse_args(__import__("sys").argv[__import__("sys").argv.index("--") + 1:])
    root = args.project_root.resolve()
    source = root / "art-factory/rts/runs/unit-bodies" / args.unit / "v1/projected/candidate/guard-neural-v3.blend"
    report = inspect_blend(source)
    destination = root / "art-factory/rts/runs/human-units/2026-10-05-v1/qa" / f"probe-{args.unit}.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n")
    print("HUMAN_UNIT_PROBE", args.unit, report["triangles"], report["welded_components"], report["welded_boundary_edges"], report["world_bounds"], flush=True)


if __name__ == "__main__":
    main()
