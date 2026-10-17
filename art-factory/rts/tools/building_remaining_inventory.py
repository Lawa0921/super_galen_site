"""Read-only source/GLB inventory for nine remaining RTS buildings.

Writes only the isolated inventory run raw/qa. Never exports geometry or saves
Blender sources. Source semantic stage suggestions are not approval to publish.
"""
import bpy
import collections
import gzip
import hashlib
import json
import re
import struct
import sys
from pathlib import Path
import numpy as np

sys.dont_write_bytecode = True
MAIN = Path('C:/Users/bag57/projects/super_galen_site/.claude/worktrees/rts')
OWN = Path(__file__).resolve().parents[3]
RUN = OWN/'art-factory/rts/runs/building-stages-remaining/2026-10-09-v1'
ASSEMBLY = MAIN/'art-factory/rts/runs/assembly-refinement/2026-10-08-v2'
IDS = ['townhall', 'townhall-tier2', 'townhall-tier3', 'house', 'lumbermill', 'forge', 'altar', 'tower', 'chapel']
sys.path.append(str(MAIN/'art-factory/rts/tools'))
from building_stage_build import triangle_rows, digest_rows


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def save(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2)+'\n', encoding='utf-8', newline='\n')


def base(name):
    return re.sub(r'\.\d{3}$', '', name)


def proposed_stage(name, asset):
    """Explicit source-word inventory only; no unknown name auto-approval."""
    if any(word in name.lower() for word in ('foundation', 'plinth', 'entry stair')) or name in {'Wide manor entry landing', 'Terraced limestone altar platform'}:
        return 0, 'authored ground/base/entry components'
    if re.search(r'\b(?:roof|slate|eaves|ridge|rake board)\b', name, re.I) or name == 'Defensive eave overhang':
        return 2, 'complete authored roof/cap assembly'
    if name in {'Open ritual architrave', 'Merlon with open crenels', 'Projecting machicolation cornice', 'Alternating castle merlon'}:
        return 2, 'roofless upper closure/crown; explicit stage-2 contract interpretation required'
    fittings = ('Banner ', 'TeamCloth', 'Embossed sun', 'Forged sun', 'Radiant sun', 'Brass door', 'Vertical oak door', 'Wrought oak door',
                'Framed oak window', 'Lancet window', 'Lead horizontal', 'Lead vertical', 'Recessed amber', 'Shutter iron', 'Stone sill',
                'Deep shadow', 'Deep open gate shadow', 'Shadowed tower entrance', 'Arrow slit', 'Tower arrow slit', 'Tower gilded',
                'Chapel gilded', 'Open belfry louver', 'Terrace stone baluster', 'Open smoke flue', 'Anvil ', 'Forged iron anvil',
                'Red-hot forge mouth', 'Sun altar monolith', 'Piled timber trunk', 'Saw bench trestle', 'Saw tooth',
                'Spoked mechanism wheel rim', 'Iron wheel hub', 'Wheel radial timber spoke')
    if name.startswith(fittings):
        return 3, 'removable/nonbearing openings, trim, banner or equipment; window trim needs visual support review'
    structure = ('Left service wing ', 'Lord longhall ', 'Right pantry wing ', 'Central two-storey keep ', 'High royal keep ',
                 'Timber mortise iron plate', 'Main portal ', 'Castle open gateway ', 'Watchtower portal ', 'Forge hearth ',
                 'Full-height round ashlar tower', 'Cut-stone curtain wall', 'Expressed masonry belt course', 'Turret top corbelled cornice',
                 'Wall walk ledge', 'Inner courtyard arcade pier', 'Royal balcony lintel', 'Alternating cut-stone quoin',
                 'Chimney cut-stone course', 'Chimney flared crown', 'Continuous sill course', 'Cornice below eaves',
                 'Exposed upright timber', 'Expressed half-timber diagonal', 'Horizontal ashlar joint', 'Load-bearing limestone walls',
                 'Massive furnace chimney stack', 'Rear quoin', 'Low millhouse stone rear', 'Millhouse timber corner',
                 'Raised saw shed beam', 'Saw shed post', 'Carved freestanding sanctuary column', 'Lotus column capital',
                 'Carved tower masonry bed joint', 'Round ashlar defensive tower', 'Belfry carved cornice', 'Square chapel bell tower shaft')
    if name.startswith(structure):
        return 1, 'bearing host/support masonry, posts, beams, chimney or architectural arch'
    return None, 'UNCLASSIFIED: requires source author semantic decision'


def corner_key(material, position, uv):
    values = tuple(0. if round(float(v), 5) == 0. else round(float(v), 5) for v in (*position, *uv))
    return base(material), values


def bounds(obj):
    points = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return [[min(p[k] for p in points) for k in range(3)], [max(p[k] for p in points) for k in range(3)]]


def geometry_facts(path):
    raw = path.read_bytes()
    size = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20+size])
    primitives = [p for m in doc.get('meshes', []) for p in m['primitives']]
    positions = sum(doc['accessors'][p['attributes']['POSITION']]['count'] for p in primitives)
    tangents_missing = sum(doc['accessors'][p['attributes']['POSITION']]['count'] for p in primitives if 'TANGENT' not in p['attributes'])
    return doc, {'bytes': len(raw), 'gzip_bytes': len(gzip.compress(raw, mtime=0)), 'primitives': len(primitives),
                 'position_vertices': positions, 'tangent_export_additional_bytes_estimate': tangents_missing*16,
                 'triangles': sum(doc['accessors'][p['indices']]['count']//3 for p in primitives),
                 'construction_metadata': [s.get('extras', {}).get('rtsConstruction') for s in doc.get('scenes', [])],
                 'mesh_node_names': [n.get('name') for n in doc.get('nodes', []) if 'mesh' in n]}


def main():
    registry_path = MAIN/'art-factory/rts/manifests/building-registry.json'
    registry = read(registry_path)
    kit_path = ASSEMBLY/'kit.json'
    kit = read(kit_path)
    library = ASSEMBLY/kit['library']['path']
    assert sha(library) == kit['library']['sha256']
    source_lock_path = ASSEMBLY/kit['source_lock']
    assert sha(source_lock_path) == kit['source_lock_sha256']
    detail_build = read(MAIN/'art-factory/rts/runs/detail-refinement/2026-10-07-v1/qa/build.json')
    locks = {str(p.relative_to(MAIN)).replace('\\', '/'): sha(p) for p in [registry_path, kit_path, library, source_lock_path,
             MAIN/'art-factory/rts/manifests/modular-kit-registry.json', MAIN/'art-factory/rts/contracts/building-stages-2026-10-08.json',
             MAIN/'docs/superpowers/specs/2026-10-04-browser-rts-design.md', MAIN/'docs/superpowers/specs/2026-10-08-rts-modular-production.md',
             MAIN/'art-factory/rts/tools/detail_build.py', MAIN/'art-factory/rts/tools/buildings_v2_generate.py',
             MAIN/'art-factory/rts/tools/modular_extract.py', MAIN/'art-factory/rts/tools/building_stage_build.py',
             MAIN/'art-factory/rts/tools/building_stage_classify.py']}
    results = []
    for asset in IDS:
        entry = next(a for a in registry['assets'] if a['id'] == asset)
        source, runtime, candidate = MAIN/entry['source'], MAIN/'public'/entry['url'].lstrip('/'), MAIN/entry['candidate']
        assert sha(source) == entry['source_sha256']
        assert sha(runtime) == sha(candidate) == entry['sha256']
        recipe_path = ASSEMBLY/'recipes'/f'{asset}.json'
        recipe = read(recipe_path)
        registration = next(r for r in kit['recipes'] if r['id'] == asset)
        assert sha(recipe_path) == registration['sha256']
        assert recipe['source']['sha256'] == entry['source_sha256']
        assert recipe['source']['previous_sha256'] == entry['sha256']
        source_files = [source, runtime, candidate, recipe_path]
        previous = next(r for r in detail_build if r['id'] == asset)
        original = MAIN/previous['source_previous']
        assert sha(original) == previous['source_previous_sha256']
        source_files.append(original)
        locks.update({p.relative_to(MAIN).as_posix(): sha(p) for p in source_files})
        doc, facts = geometry_facts(runtime)
        bpy.ops.wm.open_mainfile(filepath=str(source))
        bpy.context.view_layer.update()
        graph = bpy.context.evaluated_depsgraph_get()
        source_objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
        corner_owners, directed_owners, raw_corners = collections.defaultdict(set), collections.defaultdict(set), collections.defaultdict(list)
        parts, evaluated_objects = [], []
        source_name_category = {}
        for instance in recipe['instances']:
            part = kit['parts'][instance['part']]
            for origin in part['sources']:
                if origin['asset'] == asset:
                    for name in origin['nodes']:
                        source_name_category[name] = {'part': instance['part'], 'instance': instance['id'], 'category': part['category'],
                                                     'uv_exception': part.get('uv_exception')}
        for obj in source_objects:
            evaluated = obj.evaluated_get(graph)
            mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=graph)
            copied = bpy.data.objects.new('INVENTORY '+obj.name, mesh)
            copied.matrix_world = obj.matrix_world.copy()
            mesh.calc_loop_triangles()
            evaluated_objects.append(copied)
            uv = mesh.uv_layers.active
            assert uv, obj.name
            stage, rationale = proposed_stage(base(obj.name), asset)
            row = {'source_object': obj.name, 'proposed_stage': stage, 'rationale': rationale,
                   'evaluated_triangles': len(mesh.loop_triangles), 'polygons': len(mesh.polygons), 'vertices': len(mesh.vertices),
                   'uv_layers': [u.name for u in mesh.uv_layers], 'materials': [m.name for m in mesh.materials],
                   'bounds_blender_z_up_m': bounds(copied), 'existing_semantic_stage_extra': obj.get('rtsConstructionStage'),
                   'assembly_v2_reference': source_name_category.get(obj.name)}
            parts.append(row)
            for tri in mesh.loop_triangles:
                material = mesh.materials[tri.material_index].name
                tri_keys = []
                for vertex, loop in zip(tri.vertices, tri.loops):
                    position = copied.matrix_world @ mesh.vertices[vertex].co
                    key = corner_key(material, position, uv.data[loop].uv)
                    corner_owners[key].add(obj.name)
                    raw_corners[base(material)].append((tuple((*position, *uv.data[loop].uv)), key))
                    tri_keys.append(key[1])
                directed = (base(material), min(tuple(tri_keys[i:]+tri_keys[:i]) for i in range(3)))
                directed_owners[directed].add(obj.name)
        before = triangle_rows(evaluated_objects)
        before_digest = digest_rows(before)
        source_triangle_count = sum(before.values())
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(runtime))
        bpy.context.view_layer.update()
        imported = [o for o in bpy.context.scene.objects if o.type == 'MESH']
        after = triangle_rows(imported)
        mapping, unresolved, tolerant_after = collections.Counter(), [], collections.Counter()
        tolerance = 2e-5
        max_corner_component_delta = 0.
        raw_arrays = {m: np.array([v for v, key in values]) for m, values in raw_corners.items()}
        corrected_corners = 0
        by_name = {row['source_object']: row for row in parts}
        for obj in imported:
            mesh = obj.data
            mesh.calc_loop_triangles()
            uv = mesh.uv_layers.active
            for tri_id, tri in enumerate(mesh.loop_triangles):
                keys = []
                material = base(mesh.materials[tri.material_index].name)
                for vertex, loop in zip(tri.vertices, tri.loops):
                    position = obj.matrix_world @ mesh.vertices[vertex].co
                    values = np.array(tuple((*position, *uv.data[loop].uv)))
                    key = corner_key(material, position, uv.data[loop].uv)
                    # Measure every actual corner, independently of rounded hash
                    # equality; recover quantization-boundary misses by nearest
                    # original position+UV within the locked 2e-5 tolerance.
                    delta = np.abs(raw_arrays[material]-values)
                    distances = delta.max(axis=1)
                    nearest = int(np.argmin(distances))
                    max_corner_component_delta = max(max_corner_component_delta, float(distances[nearest]))
                    if key not in corner_owners and distances[nearest] <= tolerance:
                        key = raw_corners[material][nearest][1]
                        corrected_corners += 1
                    keys.append(key)
                directed = (material, min(tuple([k[1] for k in keys][i:]+[k[1] for k in keys][:i]) for i in range(3)))
                tolerant_after[directed] += 1
                owners = directed_owners.get(directed) or set.intersection(*(corner_owners.get(k, set()) for k in keys))
                if len(owners) == 1:
                    mapping[next(iter(owners))] += 1
                else:
                    unresolved.append({'mesh': obj.name, 'triangle': tri_id, 'source_objects': sorted(owners),
                                       'stages': sorted({by_name[n]['proposed_stage'] for n in owners}, key=str)})
        for part in parts:
            part['formal_glb_triangles_mapped'] = mapping[part['source_object']]
        batches = collections.defaultdict(set)
        stage_triangles = collections.Counter()
        for part in parts:
            for material in part['materials']:
                batches[part['proposed_stage']].add(base(material))
            stage_triangles[part['proposed_stage']] += part['formal_glb_triangles_mapped']
        proposed_batches = [{'stage': i, 'materials': sorted(batches[i]), 'batches': len(batches[i]),
                             'mapped_formal_triangles': stage_triangles[i]} for i in range(4)]
        provenance_json_bytes = len(json.dumps([{'stage': i, 'source_objects': [p['source_object'] for p in parts if p['proposed_stage'] == i]}
                                               for i in range(4)], ensure_ascii=False).encode())*3
        expected_bytes = facts['bytes']+facts['tangent_export_additional_bytes_estimate']+provenance_json_bytes+2048*sum(len(v) for v in batches.values())
        textures = []
        for image in doc.get('images', []):
            uri = image.get('uri')
            if uri:
                texture = (runtime.parent/uri).resolve()
                textures.append({'uri': uri, 'path': texture.relative_to(MAIN).as_posix(), 'sha256': sha(texture), 'bytes': texture.stat().st_size})
                locks[texture.relative_to(MAIN).as_posix()] = sha(texture)
        exact = before == after
        row = {'id': asset, 'runtime_publish_allowed': False, 'registry_entry': entry,
               'source_chain': {'runtime_sha256': sha(runtime), 'runtime_matches_registered_candidate': True,
                                'editable_source': entry['source'], 'editable_source_sha256': sha(source),
                                'previous_original_source': previous['source_previous'], 'previous_original_sha256': sha(original),
                                'recipe_reference': recipe_path.relative_to(MAIN).as_posix(), 'recipe_sha256': sha(recipe_path),
                                'recipe_source_matches_formal_source': True, 'library_reference': library.relative_to(MAIN).as_posix(),
                                'library_sha256': sha(library), 'kit_json_sha256': sha(kit_path),
                                'library_formal_for_this_runtime': False, 'library_uv_exceptions': sorted({p['assembly_v2_reference']['uv_exception'] for p in parts if p['assembly_v2_reference'] and p['assembly_v2_reference']['uv_exception']})},
               'runtime_facts': facts, 'source_triangle_count': source_triangle_count,
               'directed_triangle_uv_material_round5_equal': exact, 'source_directed_digest': before_digest,
               'runtime_directed_digest': digest_rows(after), 'source_only_triangle_occurrences': sum((before-after).values()),
               'runtime_only_triangle_occurrences': sum((after-before).values()),
               'tolerance_comparison': {'tolerance_position_uv_component': tolerance, 'maximum_measured_corner_component_delta': max_corner_component_delta,
                                        'rounded_corner_boundary_recoveries': corrected_corners,
                                        'directed_triangle_uv_material_multiset_equal_after_tolerance_correspondence': before == tolerant_after,
                                        'source_only_occurrences_after': sum((before-tolerant_after).values()),
                                        'runtime_only_occurrences_after': sum((tolerant_after-before).values())},
               'formal_triangles_mapped_to_unique_source_object': sum(mapping.values()), 'mapping_unresolved': unresolved,
               'semantic_parts': parts, 'proposed_stages': proposed_batches, 'proposed_stage_batches': sum(b['batches'] for b in proposed_batches),
               'bytes_estimate': {'model_glb_expected': expected_bytes, 'range': [int(expected_bytes*.9), int(expected_bytes*1.15)],
                                  'basis': 'existing formal GLB + missing TANGENT float4/vertex + estimated metadata; no geometry export performed',
                                  'texture_additional_bytes': 0, 'not_actual_export_measurement': True},
               'textures': textures}
        results.append(row)
        print('INVENTORY', json.dumps({k: row[k] for k in ('id', 'source_triangle_count', 'directed_triangle_uv_material_round5_equal', 'formal_triangles_mapped_to_unique_source_object', 'proposed_stage_batches')})+
              ' unresolved='+str(len(unresolved)), flush=True)
    assert all(sha(MAIN/p) == digest for p, digest in locks.items()), 'Readonly input changed during inventory'
    save(RUN/'raw/source-lock.json', {'source_root': str(MAIN), 'sha256': locks, 'all_unchanged_after': True})
    save(RUN/'qa/inventory.json', {'status': 'inventory_only_not_candidate', 'runtime_publish_allowed': False,
                                 'style_source': 'docs/superpowers/specs/2026-10-04-browser-rts-design.md',
                                 'thresholds': [0, .18, .55, .82], 'assets': results})


if __name__ == '__main__':
    main()
