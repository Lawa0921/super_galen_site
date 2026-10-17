"""Exact source cleanup before a single Blender QuadriFlow operation."""

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components


def edge_incidence(triangles):
    edges = np.sort(np.concatenate([
        triangles[:, [0, 1]], triangles[:, [1, 2]], triangles[:, [2, 0]]
    ]), axis=1)
    _, counts = np.unique(edges, axis=0, return_counts=True)
    return {"boundary_edges": int(np.sum(counts == 1)),
            "nonmanifold_edges": int(np.sum(counts > 2))}


def retain_largest_closed_component(vertices, triangles):
    """Weld exactly equal positions and retain the largest closed face component.

    Coordinate averaging, tolerance-based welding, and silhouette changes are absent.
    """
    vertices = np.asarray(vertices)
    triangles = np.asarray(triangles, dtype=np.int64)
    if vertices.ndim != 2 or vertices.shape[1] != 3 or triangles.ndim != 2 or triangles.shape[1] != 3:
        raise ValueError("Expected Nx3 vertices and Mx3 triangles")
    if not np.isfinite(vertices).all() or np.any(triangles < 0) or np.any(triangles >= len(vertices)):
        raise ValueError("Invalid source vertex or face")

    welded, inverse = np.unique(vertices, axis=0, return_inverse=True)
    faces = inverse[triangles]
    corners_unique = ((faces[:, 0] != faces[:, 1]) &
                      (faces[:, 1] != faces[:, 2]) & (faces[:, 2] != faces[:, 0]))
    cross = np.cross(welded[faces[:, 1]] - welded[faces[:, 0]],
                     welded[faces[:, 2]] - welded[faces[:, 0]])
    positive_area = np.linalg.norm(cross, axis=1) > 0
    nondegenerate = corners_unique & positive_area
    removed_degenerate = int(np.sum(~nondegenerate))
    faces = faces[nondegenerate]
    _, unique_index = np.unique(np.sort(faces, axis=1), axis=0, return_index=True)
    removed_duplicate = len(faces) - len(unique_index)
    faces = faces[np.sort(unique_index)]

    edges = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
    graph = coo_matrix((np.ones(len(edges), dtype=np.uint8), (edges[:, 0], edges[:, 1])),
                       shape=(len(welded), len(welded))).tocsr()
    _, vertex_components = connected_components(graph, directed=False)
    face_components = vertex_components[faces[:, 0]]
    ids, counts = np.unique(face_components, return_counts=True)
    order = np.argsort(-counts, kind="stable")
    selected_id = ids[order[0]]
    primary = faces[face_components == selected_id]
    used, remapped = np.unique(primary, return_inverse=True)
    output_vertices = welded[used]
    output_faces = remapped.reshape(-1, 3)
    incidence = edge_incidence(output_faces)
    if incidence["boundary_edges"] or incidence["nonmanifold_edges"]:
        raise ValueError(f"Largest source component is not closed: {incidence}; "
                         f"face components {counts[order].tolist()}, "
                         f"welded vertices {len(welded)}, degenerate {removed_degenerate}, "
                         f"duplicate faces {removed_duplicate}")

    report = {
        "original_vertices": int(len(vertices)), "original_triangles": int(len(triangles)),
        "exact_duplicate_vertices_removed": int(len(vertices) - len(welded)),
        "degenerate_triangles_removed": removed_degenerate,
        "duplicate_triangles_removed": int(removed_duplicate),
        "component_faces": [int(counts[i]) for i in order],
        "dropped_component_faces": [int(counts[i]) for i in order[1:]],
        "retained_vertices": int(len(output_vertices)),
        "retained_triangles": int(len(output_faces)), **incidence,
    }
    return output_vertices, output_faces, report
