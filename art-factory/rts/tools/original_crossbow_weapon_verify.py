"""Independent actual-mesh acceptance and preservation checks for the new bow.

Run Blender --background --python this.py -- SOURCE CANDIDATE REPORT.
Baseline is SOURCE == CANDIDATE, and must fail the weapon quality checks.
This verifier never saves either loaded source.
"""
import bpy
import hashlib
import json
import math
from pathlib import Path
import sys


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def snapshot():
    meshes = {}
    for obj in bpy.data.objects:
        if obj.type != 'MESH' or obj.name.startswith('CrossbowWeapon'):
            continue
        meshes[obj.name] = digest([
            [list(v.co) for v in obj.data.vertices],
            [list(p.vertices) for p in obj.data.polygons],
            [list(d.uv) for layer in obj.data.uv_layers for d in layer.data],
            [p.material_index for p in obj.data.polygons],
            [[(obj.vertex_groups[g.group].name, g.weight) for g in v.groups] for v in obj.data.vertices],
            [s.material.name for s in obj.material_slots],
            [list(row) for row in obj.matrix_world]])
    rig = bpy.data.objects['crossbowRig20']
    bones = {b.name: [b.parent.name if b.parent else None, list(map(list, b.matrix_local))]
             for b in rig.data.bones}
    actions = {}
    for action in bpy.data.actions:
        curves = [fc for layer in action.layers for strip in layer.strips
                  for slot in action.slots for bag in [strip.channelbag(slot)] if bag for fc in bag.fcurves]
        actions[action.name] = [[fc.data_path, fc.array_index,
                                [[list(k.co), list(k.handle_left), list(k.handle_right), k.interpolation]
                                 for k in fc.keyframe_points]] for fc in curves]
    images = {i.name: hashlib.sha256(i.packed_file.data).hexdigest() for i in bpy.data.images if i.packed_file}
    return {'meshes': meshes, 'bones': bones, 'actions': actions, 'images': images}


def inspect(obj):
    mesh = obj.data
    mesh.calc_loop_triangles()
    adj = [set() for v in mesh.vertices]
    uses = {}
    for polygon in mesh.polygons:
        for i, a in enumerate(polygon.vertices):
            b = polygon.vertices[(i + 1) % len(polygon.vertices)]
            adj[a].add(b); adj[b].add(a)
            key = tuple(sorted((a, b)))
            uses[key] = uses.get(key, 0) + 1
    pending = set(range(len(mesh.vertices)))
    components = []
    while pending:
        stack = [pending.pop()]; ids = set(stack)
        while stack:
            for n in adj[stack.pop()]:
                if n not in ids:
                    ids.add(n); pending.discard(n); stack.append(n)
        points = [obj.matrix_world @ mesh.vertices[i].co for i in ids]
        lo = [min(p[k] for p in points) for k in range(3)]
        hi = [max(p[k] for p in points) for k in range(3)]
        components.append({'vertices': len(ids), 'min': lo, 'max': hi,
                           'size': [b-a for a, b in zip(lo, hi)],
                           'center': [(a+b)/2 for a, b in zip(lo, hi)],
                           'boundary_edges': sum(n != 2 for (a, b), n in uses.items() if a in ids)})
    prod = max(components, key=lambda c: c['size'][0])
    stock = max(components, key=lambda c: c['size'][1])
    material_images = {}
    for slot in obj.material_slots:
        mat = slot.material
        material_images[mat.name] = [n.image.name for n in mat.node_tree.nodes
                                   if n.type == 'TEX_IMAGE' and n.image and n.outputs['Color'].is_linked]
    weights = all(len(v.groups) == 1 and obj.vertex_groups[v.groups[0].group].name == 'Hand_R'
                  and abs(v.groups[0].weight-1) < 1e-7 for v in mesh.vertices)
    checks = {
        'components_closed': all(c['boundary_edges'] == 0 for c in components),
        'prod_centered_on_stock': abs(prod['center'][0] - stock['center'][0]) < .0001,
        'prod_has_volume': prod['size'][2] > .012 and prod['boundary_edges'] == 0,
        'every_material_textured': bool(material_images) and all(material_images.values()),
        'uv_present': len(mesh.uv_layers) > 0,
        'finite_vertices': all(math.isfinite(x) for v in mesh.vertices for x in v.co),
        'nonzero_triangles': all(t.area > 1e-12 for t in mesh.loop_triangles),
        'rigid_hand_r': weights and obj.parent and obj.parent.name == 'crossbowRig20',
        'single_armature_modifier': len(obj.modifiers) == 1 and obj.modifiers[0].type == 'ARMATURE',
        'triangle_budget': len(mesh.loop_triangles) <= (1600 if obj.name.endswith('LOD0') else 580)
    }
    return {'checks': checks, 'triangles': len(mesh.loop_triangles), 'components': components,
            'prod_stock_offset_m': prod['center'][0]-stock['center'][0], 'material_images': material_images}


def main():
    source, candidate, out = [Path(p).resolve() for p in sys.argv[sys.argv.index('--')+1:][:3]]
    bpy.ops.wm.open_mainfile(filepath=str(source)); before = snapshot()
    bpy.ops.wm.open_mainfile(filepath=str(candidate)); after = snapshot()
    preservation = {key+'_unchanged': before[key] == after[key] for key in ('meshes', 'bones', 'actions')}
    if '--death-arms' in sys.argv or '--carry-arms' in sys.argv:
        names={part+'_'+side for part in ('UpperArm','Forearm','Hand') for side in ('R','L')}
        def frozen(actions):
            return {name:[curve for curve in curves if (name!='Death' and '--carry-arms' not in sys.argv) or not any('"'+bone+'"' in curve[0] for bone in names)]
                    for name,curves in actions.items()}
        del preservation['actions_unchanged']
        preservation['all_non_arm_channels_unchanged' if '--carry-arms' in sys.argv else 'four_actions_and_all_non_arm_death_channels_unchanged']=frozen(before['actions'])==frozen(after['actions'])
    preservation['original_images_unchanged'] = all(after['images'].get(k) == v for k, v in before['images'].items())
    lods = {str(lod): inspect(bpy.data.objects[f'CrossbowWeapon_LOD{lod}']) for lod in (0, 1)}
    report = {'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
              'candidate_sha256': hashlib.sha256(candidate.read_bytes()).hexdigest(),
              'preservation': preservation, 'lods': lods,
              'pass': all(preservation.values()) and all(all(r['checks'].values()) for r in lods.values())}
    out.parent.mkdir(parents=True, exist_ok=True); out.write_text(json.dumps(report, indent=2)+'\n')
    print('WEAPON_VERIFY', json.dumps({'pass': report['pass'], 'preservation': preservation,
          'lods': {k: {'checks': v['checks'], 'triangles': v['triangles']} for k, v in lods.items()}}))
    assert report['pass'], 'Original weapon acceptance failed; see report'


if __name__ == '__main__':
    main()
