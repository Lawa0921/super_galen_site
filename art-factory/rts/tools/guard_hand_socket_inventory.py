"""Extract the current cloth sleeve's real distal cap, without changing the mesh."""
import bpy, collections, hashlib, json, sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from guard_hand_frame_inventory import ROOT, GUARD, GUARD_SHA, RUN
from original_guard_quadri_repair_math import oriented_boundary_loops
from hand_socket_math import validate_socket_cap


def main():
    assert hashlib.sha256(GUARD.read_bytes()).hexdigest() == GUARD_SHA
    inventory = json.loads((RUN / 'raw/current-arm-wrist-inventory.json').read_text(encoding='utf-8'))
    assert inventory['source_guard_sha256'] == GUARD_SHA
    bpy.ops.wm.open_mainfile(filepath=str(GUARD))
    arm = bpy.data.objects['GuardArms_LOD0']
    points = np.asarray([arm.matrix_world @ v.co for v in arm.data.vertices], float)
    wrist = np.asarray(inventory['wrist_bone_landmark'])
    axis = np.asarray(inventory['forearm_axis_to_hand'])
    sleeve = inventory['arm_components'][5]
    ids = set(sleeve['vertex_ids'])
    axial = (points - wrist) @ axis
    terminal = {i for i in ids if axial[i] > max(axial[list(ids)]) - .00015}
    polygons = [p for p in arm.data.polygons if set(p.vertices) <= ids]
    cap = [p for p in polygons if set(p.vertices) <= terminal]
    retained = [list(p.vertices) for p in polygons if p not in cap]
    loops = oriented_boundary_loops(retained)
    assert len(loops) == 1 and set(loops[0]) == terminal, (len(loops), terminal)
    loop = loops[0]
    weights = {i: {arm.vertex_groups[g.group].name: g.weight for g in arm.data.vertices[i].groups} for i in loop}
    materials = {arm.data.materials[p.material_index].name for p in cap}
    try:
        validation = validate_socket_cap([list(p.vertices) for p in cap], retained, loop, weights, materials)
    except ValueError as error:
        incidence = collections.defaultdict(list)
        for polygon in polygons:
            cycle = list(polygon.vertices)
            for a, b in zip(cycle, cycle[1:] + cycle[:1]):
                incidence[tuple(sorted((a, b)))].append({'polygon': polygon.index, 'direction': [a, b]})
        bad = [{'edge': list(edge), 'uses': uses, 'world_m': points[list(edge)].tolist()}
               for edge, uses in incidence.items() if len(uses) == 2 and uses[0]['direction'] != uses[1]['direction'][::-1]]
        (RUN / 'qa/socket-validation-failure.json').write_text(json.dumps({
            'source_guard_sha256': GUARD_SHA, 'error': str(error),
            'source_sleeve_winding_errors': bad, 'source_geometry_modified': False,
            'runtime_publish_allowed': False
        }, indent=2) + '\n', encoding='utf-8')
        raise
    center = points[loop].mean(axis=0)
    _, _, basis = np.linalg.svd(points[loop] - center)
    normal = basis[-1]
    if normal @ axis < 0:
        normal = -normal
    result = {
        'status': 'measured_surface_socket_candidate_not_approved',
        'source_guard_sha256': GUARD_SHA,
        'coordinate_system': 'Current character world rest coordinates in metres',
        'runtime_publish_allowed': False,
        'socket_validation': validation,
        'source_object': arm.name,
        'source_component': sleeve,
        'cap_selection_rule': 'All component-5 polygons entirely in the distal 0.15 mm axial band',
        'cap_polygon_ids': [p.index for p in cap],
        'cap_polygons': [list(p.vertices) for p in cap],
        'cap_materials': sorted({arm.data.materials[p.material_index].name for p in cap}),
        'cap_triangle_count': sum(len(p.vertices) - 2 for p in cap),
        'remaining_component_boundary_loops': loops,
        'ordered_interface': [
            {'vertex': i, 'world_m': points[i].tolist(),
             'weights': weights[i]}
            for i in loop
        ],
        'plane_center_m': center.tolist(),
        'plane_normal_toward_hand': normal.tolist(),
        'maximum_planarity_error_m': float(np.max(np.abs((points[loop] - center) @ normal))),
        'forearm_axial_range_m': [float(min(axial[loop])), float(max(axial[loop]))],
        'forearm_axis': axis.tolist(),
        'wrist_bone_point_m': wrist.tolist(),
        'source_geometry_modified': False,
        'interpretation': 'Remove only this actual cloth cap in a future authored candidate. The collar must share/weld the existing 12 source vertex IDs with identical weights, not duplicate coincident vertices. Listed loop edges already oppose the retained sleeve; new collar faces use the listed start-edge direction. The separate nonperiodic metal cuff is not the body seam.',
        'assembled_seam_gates': ['Each shared interface edge has incidence 2 and opposing directions', 'Cloth and hand collar form one connected mesh component', 'No duplicate coincident seam vertices or remaining seam boundary edges'],
        'pending': ['Independent socket choice review', 'Boundary deformation policy', 'Whole-hand placement and silhouette']
    }
    path = RUN / 'raw/current-sleeve-socket.json'
    path.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print('SOCKET_INVENTORY', json.dumps({k: result[k] for k in (
        'status', 'cap_polygon_ids', 'cap_triangle_count', 'remaining_component_boundary_loops',
        'plane_center_m', 'plane_normal_toward_hand', 'maximum_planarity_error_m', 'forearm_axial_range_m')}), flush=True)


if __name__ == '__main__':
    main()
