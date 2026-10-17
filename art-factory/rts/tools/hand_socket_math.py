"""Fail-closed topology and skin contract for a cut cloth/hand interface."""
from collections import defaultdict


def _incidence(faces):
    edges = defaultdict(list)
    for face in faces:
        if len(face) < 3 or len(set(face)) != len(face):
            raise ValueError('Degenerate socket face')
        for a, b in zip(face, face[1:] + face[:1]):
            edges[tuple(sorted((a, b)))].append((a, b))
    for uses in edges.values():
        if len(uses) > 2:
            raise ValueError('Nonmanifold socket edge')
        if len(uses) == 2 and uses[0] != uses[1][::-1]:
            raise ValueError('Inconsistent socket edge winding')
    return edges


def validate_socket_cap(cap_faces, retained_faces, loop, weights, materials,
                        expected_vertices=12, expected_triangles=10):
    """Validate IDs and directions, never infer welding from coincident positions.

    `loop` is oriented to fill the removed cap: its directed edges must oppose
    the retained sleeve's edges. The new collar must reuse those source IDs.
    """
    cap = _incidence(cap_faces)
    retained = _incidence(retained_faces)
    ids = {v for face in cap_faces for v in face}
    if len(ids) != expected_vertices or sum(len(f) - 2 for f in cap_faces) != expected_triangles:
        raise ValueError('Unexpected cap vertex or triangle count')
    if len(loop) != expected_vertices or len(set(loop)) != len(loop):
        raise ValueError('Unexpected socket boundary loop size')
    expected = {tuple(sorted((a, b))) for a, b in zip(loop, loop[1:] + loop[:1])}
    cap_boundary = {edge for edge, uses in cap.items() if len(uses) == 1}
    retained_boundary = {edge for edge, uses in retained.items() if len(uses) == 1}
    if cap_boundary != expected or retained_boundary != expected or ids != set(loop):
        raise ValueError('Socket boundary vertex identity mismatch or extra boundary')
    unseen = set(ids)
    todo = [unseen.pop()]
    while todo:
        vertex = todo.pop()
        for a, b in cap:
            if vertex in (a, b):
                neighbor = b if a == vertex else a
                if neighbor in unseen:
                    unseen.remove(neighbor)
                    todo.append(neighbor)
    euler = len(ids) - len(cap) + len(cap_faces)
    if unseen or euler != 1:
        raise ValueError('Socket cap is not one connected disk')
    for a, b in zip(loop, loop[1:] + loop[:1]):
        edge = tuple(sorted((a, b)))
        if cap[edge][0] != (a, b) or retained[edge][0] != (b, a):
            raise ValueError('Socket loop direction differs from cap or opposes new collar winding')
    if set(materials) != {'TeamCloth.001'}:
        raise ValueError('Unexpected socket cap material')
    if set(weights) != ids or any(weights[i] != {'Forearm_R': 1.0} for i in ids):
        raise ValueError('Unexpected socket vertex weights')
    return {'connected_disk': True, 'vertices': len(ids), 'boundary_edges': len(cap_boundary),
            'triangles': expected_triangles, 'euler_characteristic': euler,
            'collar_start_edge_direction': 'same as ordered loop, opposite retained sleeve',
            'shared_vertex_identity_required': True}
