"""Measure the exported horse lower-leg deformation and fallen gear clearance."""

import bpy
import json
import math
import sys
from pathlib import Path


def clip(name, frame):
    for ob in bpy.context.scene.objects:
        if not ob.animation_data:
            continue
        ob.animation_data.action = None
        for track in ob.animation_data.nla_tracks:
            track.mute = track.name != name
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()


def points(ob):
    evaluated = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    data = evaluated.to_mesh()
    result = [evaluated.matrix_world @ vertex.co for vertex in data.vertices]
    evaluated.to_mesh_clear()
    return result


def percentile(values, fraction):
    values = sorted(values)
    return values[min(len(values) - 1, int(fraction * (len(values) - 1)))]


def components(ob, rest, zmax, ymin):
    eligible = {i for i, p in enumerate(rest) if p.z < zmax and p.y > ymin}
    adjacency = {i: [] for i in eligible}
    for edge in ob.data.edges:
        a, b = edge.vertices
        if a in eligible and b in eligible:
            adjacency[a].append(b)
            adjacency[b].append(a)
    result = []
    while adjacency:
        start = next(iter(adjacency))
        stack = [start]
        visited = []
        while stack:
            i = stack.pop()
            if i not in adjacency:
                continue
            stack.extend(adjacency.pop(i))
            visited.append(i)
        if len(visited) >= 10:
            result.append({"vertices": len(visited), "x": [round(min(rest[i].x for i in visited), 3), round(max(rest[i].x for i in visited), 3)], "y": [round(min(rest[i].y for i in visited), 3), round(max(rest[i].y for i in visited), 3)]})
    return sorted(result, key=lambda c: c["vertices"], reverse=True)[:10]


def bounds(ob):
    xyz = points(ob)
    return [[round(min(getattr(p, axis) for p in xyz), 3) for axis in "xyz"], [round(max(getattr(p, axis) for p in xyz), 3) for axis in "xyz"]]


def run(glb):
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=str(glb))
    horse = next(ob for ob in bpy.context.scene.objects if ob.type == "MESH" and ob.name.startswith("NeuralWarhorse"))
    lance = next(ob for ob in bpy.context.scene.objects if ob.type == "MESH" and ob.name.startswith("KnightLance"))
    shield = next(ob for ob in bpy.context.scene.objects if ob.type == "MESH" and ob.name.startswith("KnightSunShield"))
    rider = next(ob for ob in bpy.context.scene.objects if ob.type == "MESH" and ob.name.startswith("MountedKnightBody"))
    clip("Idle", 1)
    rest = points(horse)
    cross_shell_faces = sum(
        1 for face in horse.data.polygons
        if max(rest[i].z for i in face.vertices) < .65
        and min(rest[i].y for i in face.vertices) > .25
        and len({rest[i].y > .50 for i in face.vertices}) > 1
    )
    edges = [tuple(edge.vertices) for edge in horse.data.edges if max(rest[i].z for i in edge.vertices) < 1 and min(rest[i].y for i in edge.vertices) > .25]
    rest_lengths = [(rest[a] - rest[b]).length for a, b in edges]
    rear_edges = [tuple(edge.vertices) for edge in horse.data.edges if max(rest[i].z for i in edge.vertices) < 1 and -.98 < min(rest[i].y for i in edge.vertices) and max(rest[i].y for i in edge.vertices) < -.38]
    rear_rest_lengths = [(rest[a] - rest[b]).length for a, b in rear_edges]
    walk = {}
    for frame in (1, 5, 10, 15, 20, 25, 30, 35, 40):
        clip("Walk", frame)
        animated = points(horse)
        ratios = [(animated[a] - animated[b]).length / max(rest_lengths[index], 1e-7) for index, (a, b) in enumerate(edges)]
        lengths = [(animated[a] - animated[b]).length for a, b in edges]
        rear_ratios = [(animated[a] - animated[b]).length / max(rear_rest_lengths[index], 1e-7) for index, (a, b) in enumerate(rear_edges)]
        worst = sorted(range(len(edges)), key=lambda i: ratios[i], reverse=True)[:8]
        walk[str(frame)] = {"front_lower_edge_count": len(edges), "stretch_p99": round(percentile(ratios, .99), 3), "stretch_max": round(max(ratios), 3), "length_p99_m": round(percentile(lengths, .99), 3), "length_max_m": round(max(lengths), 3), "rear_lower_edge_count": len(rear_edges), "rear_stretch_p99": round(percentile(rear_ratios, .99), 3), "rear_stretch_max": round(max(rear_ratios), 3), "worst_edges": [{"ratio": round(ratios[i], 2), "rest": [[round(v, 3) for v in rest[vertex]] for vertex in edges[i]], "moved": [[round(v, 3) for v in animated[vertex]] for vertex in edges[i]]} for i in worst]}
    clip("Death", 48)
    gear = {name: bounds(ob) for name, ob in (("lance", lance), ("shield", shield), ("rider", rider), ("horse", horse))}
    return {"source": str(glb), "front_lower_cross_cluster_faces_below_065m": cross_shell_faces, "front_lower_rest_components": {str(z): components(horse, rest, z, .25) for z in (.35, .55, .75)}, "walk": walk, "death48_bounds": gear, "tests": {"front_leg_stretch_max_under_2": max(row["stretch_max"] for row in walk.values()) < 2, "rear_leg_stretch_max_under_2": max(row["rear_stretch_max"] for row in walk.values()) < 2, "lance_touches_near_ground": gear["lance"][0][2] < .35, "shield_touches_near_ground": gear["shield"][0][2] < .4}}


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1 :]
    result = run(Path(args[0]))
    Path(args[1]).write_bytes(json.dumps(result, indent=2).encode("utf-8"))
    print(json.dumps({"walk": result["walk"], "death48_bounds": result["death48_bounds"], "tests": result["tests"]}, indent=2), flush=True)
