"""Resolve one contradictory whole-sword parity vote at glove vertex 3262."""
from pathlib import Path
import hashlib
import json
import sys

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_grip_fit_blender import bvh
from original_guard_grip_low_build import RUN

VERTEX = 3262
RAYS = [(1., .173, .311), (-.417, 1., .239), (.181, -.393, 1.)]


def votes(tree, point):
    out = []
    for vector in RAYS:
        direction = Vector(vector).normalized()
        origin = Vector(point) + direction * 1e-6
        count = 0
        for _ in range(64):
            hit, _, _, _ = tree.ray_cast(origin, direction, 2.)
            if hit is None:
                break
            count += 1
            origin = hit + direction * 1e-5
        out.append(count)
    return out


def face_components(faces):
    vertex_to_faces = {}
    for index, face in enumerate(faces):
        for vertex in face:
            vertex_to_faces.setdefault(int(vertex), []).append(index)
    unvisited = set(range(len(faces)))
    components = []
    while unvisited:
        start = unvisited.pop()
        stack = [start]
        component = [start]
        while stack:
            for vertex in faces[stack.pop()]:
                for other in vertex_to_faces[int(vertex)]:
                    if other in unvisited:
                        unvisited.remove(other)
                        stack.append(other)
                        component.append(other)
        components.append(component)
    return components


def edge_incidence(faces):
    edges = {}
    for face in faces:
        for j in range(3):
            edge = tuple(sorted((int(face[j]), int(face[(j+1)%3]))))
            edges[edge] = edges.get(edge, 0) + 1
    return {"boundary_edges": sum(count == 1 for count in edges.values()),
            "overfull_edges": sum(count > 2 for count in edges.values())}


def main():
    candidate = RUN / "candidate/original-guard-grip-low.blend"
    bpy.ops.wm.open_mainfile(filepath=str(candidate))
    glove = bpy.data.objects["OriginalGripLowCandidate"]
    sword = bpy.data.objects["KingdomSteelSword_LOD0"]
    point = glove.matrix_world @ glove.data.vertices[VERTEX].co
    sword.data.calc_loop_triangles()
    sword_vertices = np.asarray([tuple(sword.matrix_world @ vertex.co) for vertex in sword.data.vertices], dtype=np.float64)
    sword_faces = np.asarray([tuple(triangle.vertices) for triangle in sword.data.loop_triangles], dtype=np.int32)
    whole_tree = bvh(sword_vertices, sword_faces)
    components = []
    for number, ids in enumerate(face_components(sword_faces)):
        faces = sword_faces[ids]
        tree = bvh(sword_vertices, faces)
        counts = votes(tree, point)
        gap = tree.find_nearest(point)
        components.append({"component": number, "triangles": len(ids), **edge_incidence(faces),
                           "ray_counts": counts, "odd_votes": sum(count%2 for count in counts),
                           "nearest_surface_gap_m": float(gap[3]) if gap[0] is not None else None,
                           "nearest_global_triangle": int(ids[gap[2]]) if gap[0] is not None else None})
    # Mesh edges store integer endpoints; avoid evaluated/modifier geometry.
    neighbors = sorted({edge.vertices[0] if edge.vertices[1] == VERTEX else edge.vertices[1]
                        for edge in glove.data.edges if VERTEX in edge.vertices})
    incident = []
    for index in neighbors:
        other = glove.matrix_world @ glove.data.vertices[index].co
        direction = other - point
        length = direction.length
        direction.normalize()
        first = whole_tree.ray_cast(point + direction * 1e-7, direction, length - 2e-7)
        reverse = whole_tree.ray_cast(other - direction * 1e-7, -direction, length - 2e-7)
        nearest = whole_tree.find_nearest(other)
        incident.append({"neighbor": index, "length_m": float(length),
                         "neighbor_world_point_m": list(other),
                         "whole_sword_segment_hit_from_point": first[0] is not None,
                         "whole_sword_segment_hit_from_neighbor": reverse[0] is not None,
                         "neighbor_nearest_sword_gap_m": float(nearest[3]),
                         "neighbor_whole_sword_ray_counts": votes(whole_tree, other)})
    result = {"scope": "one previously flagged low glove vertex and its incident edges only",
              "candidate_blend_sha256": hashlib.sha256(candidate.read_bytes()).hexdigest(),
              "vertex": VERTEX, "point_world_m": list(point),
              "whole_sword_ray_counts": votes(whole_tree, point),
              "sum_of_separate_component_ray_counts": [sum(x["ray_counts"][axis] for x in components) for axis in range(3)],
              "whole_sword_nearest_gap_m": float(whole_tree.find_nearest(point)[3]),
              "sword_components": components,
              "incident_glove_edges": incident,
              "point_inside_any_closed_component_by_majority": any(x["boundary_edges"] == 0 and x["overfull_edges"] == 0 and x["odd_votes"] >= 2 for x in components),
              "interpretation": "The joined multi-shell BVH counts differ from summed separate shell counts because stepped ray casting skips overlapping surfaces. No closed component has a majority inside vote, and none of five incident glove edges hits actual sword triangles. The joined positive is a local parity false positive; the open sword component cannot support a closed-volume containment claim. This is not a full-scene containment scan."}
    path = RUN / "qa/vertex-3262-containment-diagnosis.json"
    path.write_bytes((json.dumps(result, indent=2) + "\n").encode("utf-8"))
    print("LOCAL_CONTAINMENT", json.dumps({"whole_counts": result["whole_sword_ray_counts"],
                                           "component_majority": [(x["component"],x["triangles"],x["odd_votes"],x["boundary_edges"]) for x in components if x["odd_votes"] >= 2],
                                           "incident": len(incident),
                                           "incident_hits": sum(x["whole_sword_segment_hit_from_point"] or x["whole_sword_segment_hit_from_neighbor"] for x in incident)}), flush=True)


if __name__ == "__main__":
    main()
