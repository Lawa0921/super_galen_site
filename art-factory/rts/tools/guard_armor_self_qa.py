"""Separate internal-surface QA for rigid plates and deforming sleeves."""
import argparse
import itertools
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils.bvhtree import BVHTree

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from armor_incident_contact_math import CONTACT_TOLERANCE_M, incident_disallowed_pair_mask, incident_pair_indices
from guard_armor_controlled_helpers import BASE, CLIPS, sha
from guard_armor_relief_inventory import components
from original_guard_arm_hinge import strict_triangle_crossings
from grip_gap_math import triangle_clearance

RUN = BASE/'2026-10-08-v33-armor-sleeve-winding'
TOLERANCE = CONTACT_TOLERANCE_M


def inspect(points, faces):
    triangles = points[faces]
    strict = strict_triangle_crossings(triangles, triangles)
    strict = [[int(a), int(b)] for a, b in strict if a < b]
    # Enumerate incident pairs by topology, independently of BVH contact
    # overlap reporting. Shared points/edges are the only allowed simplex.
    incident_pairs = incident_pair_indices(faces)
    incident = incident_pairs[incident_disallowed_pair_mask(points, faces, incident_pairs, TOLERANCE)].tolist()
    tree = BVHTree.FromPolygons(points.tolist(), faces.tolist(), all_triangles=True, epsilon=TOLERANCE)
    contact = []
    for a, b in tree.overlap(tree):
        if a >= b or set(faces[a]) & set(faces[b]):
            continue
        if triangle_clearance(triangles[a], triangles[b])['distance'] <= TOLERANCE:
            contact.append([a, b])
    return {'strict_crossings': strict, 'nonincident_inclusive_contacts': contact,
            'incident_disallowed_contacts': incident}


def main():
    global RUN
    parser = argparse.ArgumentParser()
    parser.add_argument('--full', action='store_true')
    parser.add_argument('--run')
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    full = args.full
    if args.run:
        RUN = RUN.with_name(args.run)
    source = RUN/'candidate/guard-controlled-armor.blend'
    report = json.loads((RUN/'qa/authoring.json').read_text(encoding='utf-8'))
    assert sha(source) == report['candidate_sha256']
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene, rig = bpy.context.scene, bpy.data.objects['GuardRig20']
    rigid, sleeves, failures = {}, {}, []
    for lod in (0, 1):
        for side in ('R', 'L'):
            for part in ('UpperArmArmor', 'ForearmArmor', 'ElbowArmor', 'ShoulderSpaulder', 'WristCuff'):
                name = 'Guard'+part+'_'+side+'_LOD'+str(lod)
                obj = bpy.data.objects[name]
                obj.data.calc_loop_triangles()
                vertices = np.array([v.co[:] for v in obj.data.vertices])
                faces = np.array([t.vertices[:] for t in obj.data.loop_triangles])
                groups = [{obj.vertex_groups[g.group].name: g.weight for g in v.groups} for v in obj.data.vertices]
                assert all(g == groups[0] and len(g) == 1 and list(g.values()) == [1.] for g in groups)
                result = inspect(vertices, faces)
                rigid[name] = {'bone': next(iter(groups[0])), 'vertices': len(vertices), 'triangles': len(faces), **result}
                if any(result.values()):
                    failures.append({'object': name, 'scope': 'rigid rest surface', **result})
        obj = bpy.data.objects['GuardArms_LOD'+str(lod)]
        obj.data.calc_loop_triangles()
        islands = components(obj.data)
        faces = np.array([t.vertices[:] for t in obj.data.loop_triangles])
        sleeves[obj.name] = {('R' if obj.data.vertices[ids[0]].co.x > 0 else 'L'): faces[np.isin(faces[:, 0], ids)] for ids in islands}
    witnesses = [('Idle', 0.), ('Attack', 16.), ('Death', 15.5), ('Death', 35.5), ('Death', 48.)]
    if full:
        witnesses = [(clip, i/64) for clip in CLIPS for i in range(round(bpy.data.actions[clip].frame_range[1]*64)+1)]
    minimum_singular, checks = float('inf'), 0
    for clip, time in witnesses:
        rig.animation_data.action = bpy.data.actions[clip]
        scene.frame_set(math.floor(time), subframe=time % 1)
        for bone in {row['bone'] for row in rigid.values()}:
            skin = np.array(rig.pose.bones[bone].matrix @ rig.data.bones[bone].matrix_local.inverted())
            minimum_singular = min(minimum_singular, float(np.linalg.svd(skin[:3, :3], compute_uv=False).min()))
        graph = bpy.context.evaluated_depsgraph_get()
        for name, parts in sleeves.items():
            evaluated = bpy.data.objects[name].evaluated_get(graph)
            mesh = evaluated.to_mesh()
            points = np.empty(len(mesh.vertices)*3)
            mesh.vertices.foreach_get('co', points)
            points = points.reshape((-1, 3))
            for side, faces in parts.items():
                result = inspect(points, faces)
                checks += 1
                if any(result.values()):
                    failures.append({'clip': clip, 'frame': time, 'object': name, 'side': side, **result})
            evaluated.to_mesh_clear()
        if time % 6 == 0 or not full:
            print('ARMOR_SELF', clip, time, 'failures', len(failures), flush=True)
    assert minimum_singular > .999, minimum_singular
    result = {'status': 'passed_sampled_internal_surface_scope' if not failures else 'failed_sampled_internal_surface_scope',
              'candidate_sha256': sha(source), 'runtime_publish_allowed': False, 'poses': len(witnesses), 'sleeve_checks': checks,
              'samples_per_frame': 64 if full else None, 'rigid_parts': rigid, 'minimum_rigid_skin_singular_value': minimum_singular,
              'failures': failures, 'contact_tolerance_m': TOLERANCE,
              'method': 'All20 single-bone plates checked in rest; invertible skin maps preserve self-intersection. Four deforming sleeve surfaces use actual evaluated vertices at each sampled pose. Strict crossings and nonincident inclusive near-contact remain separate gates. Cached immutable topology pairs use allowed shared-point/shared-edge contact: symmetric near-plane pairs within 1e-7m use orthonormal 2D triangle intersection extrema; noncoplanar pairs batch inclusive edge/triangle plane crossings, vertex/face and edge/edge <=1e-7m witnesses, retaining reference edge-in-plane interval clipping. Identical shared edges are already the allowed simplex. Any witness beyond the allowed simplex by >1e-7m, duplicate faces and incident faces with altitude <=1e-7m fail closed.',
              'limitations': ['Inter-part, body and weapons are separate QA scopes', 'Discrete sampled poses do not prove continuous-time sleeve deformation', 'Incident contact within 1e-7m of the allowed simplex is tolerated; symmetric near-plane pairs within 1e-7m are conservatively treated as coplanar; unresolved incident face altitude <=1e-7m fails closed'],
              'recipe_sha256': {n: sha(Path(__file__).parent/n) for n in ('guard_armor_self_qa.py', 'armor_incident_contact_math.py', 'original_guard_arm_hinge.py', 'grip_gap_math.py', 'original_guard_quadri_repair_math.py')}}
    (RUN/('qa/self-step64.json' if full else 'qa/self-five-witnesses.json')).write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8', newline='\n')
    print('ARMOR_SELF_RESULT', len(failures), flush=True)
    assert not failures, len(failures)


if __name__ == '__main__':
    main()
