"""Partition locked original assembly geometry; no runtime or source writes."""
import bpy
import collections
import gzip
import hashlib
import json
import math
import re
import struct
import sys
from pathlib import Path
from mathutils import Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from building_stage_classify import classify_stage, THRESHOLDS, STAGES

ROOT = Path(__file__).resolve().parents[3]
MAIN = Path('C:/Users/bag57/projects/super_galen_site/.claude/worktrees/rts')
RUN = ROOT / 'art-factory/rts/runs/building-stages/2026-10-08-v1'
ORIGIN = MAIN / 'art-factory/rts/runs/assembly-refinement/2026-10-08-v2'
IDS = ['barracks', 'stable', 'workshop']

def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
def read(path): return json.loads(path.read_text(encoding='utf-8-sig'))
def bounds(objects):
    points = [o.matrix_world @ v.co for o in objects for v in o.data.vertices]
    return [[min(p[k] for p in points) for k in range(3)], [max(p[k] for p in points) for k in range(3)]]
def mesh_signature(mesh):
    def numbers(values): return [round(float(x), 5) for x in values]
    data = {'v': [numbers(v.co) for v in mesh.vertices], 'f': [list(p.vertices) for p in mesh.polygons],
            'uv': [[numbers(l.uv) for l in uv.data] for uv in mesh.uv_layers],
            'normals': [numbers(n.vector) for n in mesh.corner_normals],
            'materials': [m['kit_material_hash'] for m in mesh.materials],
            'slots': [p.material_index for p in mesh.polygons]}
    return hashlib.sha256(json.dumps(data, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
def base_name(name): return re.sub(r'\.\d{3}$', '', name)
def triangle_rows(objects, precision=5, include_normals=False):
    rows = collections.Counter()
    for obj in objects:
        mesh = obj.data; mesh.calc_loop_triangles()
        uv = mesh.uv_layers.active
        assert uv, obj.name
        for tri in mesh.loop_triangles:
            vertices = []
            for vertex, loop in zip(tri.vertices, tri.loops):
                p = obj.matrix_world @ mesh.vertices[vertex].co
                values = (*p, *uv.data[loop].uv)
                if include_normals:
                    normal = (obj.matrix_world.to_3x3().inverted().transposed() @ mesh.corner_normals[loop].vector).normalized()
                    values = (*values, *normal)
                vertices.append(tuple(round(float(x), precision) for x in values))
            # Winding retained; cycle-normalized because Blender reimport renumbers vertices.
            key = min(tuple(vertices[i:] + vertices[:i]) for i in range(3))
            rows[(base_name(mesh.materials[tri.material_index].name), key)] += 1
    return rows
def digest_rows(rows):
    return hashlib.sha256(repr(sorted(rows.items())).encode()).hexdigest()
def glb_read(path):
    raw = path.read_bytes(); n = struct.unpack_from('<I', raw, 12)[0]
    return json.loads(raw[20:20+n]), raw[28+n:]
def glb_write(path, doc, binary):
    doc['buffers'] = [{'byteLength': len(binary)}]
    j = json.dumps(doc, ensure_ascii=False, separators=(',', ':')).encode(); j += b' ' * (-len(j) % 4)
    binary += b'\0' * (-len(binary) % 4)
    path.write_bytes(struct.pack('<4sII', b'glTF', 2, 28+len(j)+len(binary)) + struct.pack('<I4s', len(j), b'JSON') + j + struct.pack('<I4s', len(binary), b'BIN\0') + binary)
def externalize(path, original):
    # Exact original image bytes, copied into candidate-local texture storage.
    original_doc, _ = glb_read(original)
    registered = {}
    for image in original_doc.get('images', []):
        resource = (original.parent / image['uri']).resolve()
        if not resource.exists(): resource = (MAIN/'public/assets/games/rts/models'/image['uri']).resolve()
        if not resource.exists() and image['uri'].endswith('dirt-road.png'): resource = ORIGIN/'raw/dirt-road.png'
        registered[sha(resource)] = resource
    doc, binary = glb_read(path); removed = set(); texture_rows = []
    for image in doc.get('images', []):
        view = doc['bufferViews'][image['bufferView']]; start = view.get('byteOffset', 0)
        raw = binary[start:start+view['byteLength']]; digest = hashlib.sha256(raw).hexdigest()
        if digest not in registered: raise ValueError('Unregistered source texture: ' + image.get('name', ''))
        resource = registered[digest]; dest = RUN / 'candidate/textures' / resource.name
        dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes(raw)
        removed.add(image['bufferView']); image.clear(); image['uri'] = 'textures/' + resource.name
        texture_rows.append({'uri': image['uri'], 'sha256': digest, 'original': resource.relative_to(MAIN).as_posix(), 'bytes': len(raw)})
    data = bytearray(); views = []; mapping = {}
    for index, view in enumerate(doc.get('bufferViews', [])):
        if index in removed: continue
        data.extend(b'\0' * (-len(data) % 4)); start = view.get('byteOffset', 0)
        mapping[index] = len(views); views.append(dict(view, byteOffset=len(data)))
        data.extend(binary[start:start+view['byteLength']])
    for accessor in doc.get('accessors', []):
        accessor['bufferView'] = mapping[accessor['bufferView']]
    doc['bufferViews'] = views
    glb_write(path, doc, bytes(data)); return texture_rows

def build(asset, locked, kit):
    entry = next(e for e in locked if e['id'] == asset)
    original_source = MAIN / entry['source']; original_candidate = MAIN / entry['candidate']
    assert sha(original_source) == entry['source_sha256'], 'Assembly source changed'
    assert sha(original_candidate) == entry['sha256'], 'Published assembly changed'
    recipe_path = ORIGIN / 'recipes' / f'{asset}.json'; recipe = read(recipe_path)
    recipe_entry = next(e for e in kit['recipes'] if e['id'] == asset)
    assert sha(recipe_path) == recipe_entry['sha256']
    assert sha(ORIGIN / kit['library']['path']) == kit['library']['sha256']
    bpy.ops.wm.open_mainfile(filepath=str(original_source))
    bpy.context.view_layer.update(); depsgraph = bpy.context.evaluated_depsgraph_get()
    authored = {row['id']: row for row in recipe['instances']}
    objects = []; provenance = []; signatures = collections.defaultdict(list)
    for instance in depsgraph.object_instances:
        if not instance.is_instance or instance.object.type != 'MESH': continue
        original = instance.object.original; root = instance.parent.original
        ident = root.name; part_id = root['part_id']; part = kit['parts'][part_id]
        assert ident in authored and authored[ident]['part'] == part_id
        mesh = bpy.data.meshes.new_from_object(instance.object, preserve_all_data_layers=True, depsgraph=depsgraph)
        signature = mesh_signature(mesh); signatures[ident].append(signature)
        name = original.get('ingest_name', original.name)
        stage = classify_stage(name, part['category'], ident)
        obj = bpy.data.objects.new(f'{ident} | {name}', mesh)
        obj.matrix_world = instance.matrix_world.copy()
        obj['rtsConstructionStage'] = stage
        obj['rtsPartIds'] = [ident]; obj['rtsSourcePartIds'] = [part_id]; obj['rtsSourceObjects'] = [name]
        objects.append(obj)
        mesh.calc_loop_triangles()
        provenance.append({'instance': ident, 'part': part_id, 'category': part['category'], 'source_object': name,
                           'construction_stage': stage, 'mesh_signature': signature,
                           'matrix_world_z_up': [float(v) for row in obj.matrix_world for v in row],
                           'triangles': len(mesh.loop_triangles), 'vertices': len(mesh.vertices),
                           'materials': [m.name for m in mesh.materials]})
    assert set(signatures) == set(authored), 'Missing recipe instances'
    for row in recipe['instances']:
        part = kit['parts'][row['part']]
        digest = hashlib.sha256((part['category'] + ':' + ':'.join(sorted(signatures[row['id']]))).encode()).hexdigest()
        assert digest == part['geometry_sha256'], row['id']
        assert len(signatures[row['id']]) == part['mesh_count'], row['id']
    # Remove instance placements; local materialized components become editable source.
    for obj in list(bpy.context.scene.objects): bpy.data.objects.remove(obj, do_unlink=True)
    for obj in objects: bpy.context.scene.collection.objects.link(obj)
    local_materials = {}; local_images = {}
    for obj in objects:
        for index, material in enumerate(obj.data.materials):
            key = material.as_pointer()
            if key not in local_materials:
                local = material.copy(); local_materials[key] = local
                if local.use_nodes:
                    for node in local.node_tree.nodes:
                        if node.type != 'TEX_IMAGE' or node.image is None: continue
                        image = node.image; image_key = image.as_pointer()
                        if image_key not in local_images:
                            local_images[image_key] = image.copy()
                            local_images[image_key].pack()
                        node.image = local_images[image_key]
            obj.data.materials[index] = local_materials[key]
    bpy.context.view_layer.update()
    scene = bpy.context.scene; scene.unit_settings.system = 'METRIC'; scene.unit_settings.scale_length = 1
    scene['rtsConstruction'] = {'version': 1, 'thresholds': THRESHOLDS, 'stages': STAGES}
    scene['rtsRecipeSource'] = entry['recipe']; scene['rtsAssemblySourceSha256'] = entry['source_sha256']
    scene['rtsSourceKitSha256'] = kit['library']['sha256']
    before = triangle_rows(objects); original_bounds = bounds(objects)
    source = RUN / 'raw/assemblies' / f'{asset}.blend'; source.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=str(source))
    batches = collections.defaultdict(list)
    for obj in objects:
        assert len(obj.data.materials) == 1, obj.name
        batches[(obj['rtsConstructionStage'], obj.active_material.name)].append(obj)
    merged = []; batch_rows = []
    # Freeze IDs and names before join removes component Object references.
    for (stage, material), items in batches.items():
        part_ids = sorted({p for obj in items for p in obj['rtsPartIds']})
        source_ids = sorted({p for obj in items for p in obj['rtsSourcePartIds']})
        source_objects = sorted({p for obj in items for p in obj['rtsSourceObjects']})
        vertices = []; faces = []; uvs = []; normals = []; smooth = []
        for obj in items:
            mesh = obj.data; mesh.calc_loop_triangles(); offset = len(vertices)
            vertices.extend(tuple(obj.matrix_world @ vertex.co) for vertex in mesh.vertices)
            normal_matrix = obj.matrix_world.to_3x3().inverted().transposed()
            for tri in mesh.loop_triangles:
                faces.append(tuple(offset + v for v in tri.vertices))
                uvs.extend(tuple(mesh.uv_layers.active.data[loop].uv) for loop in tri.loops)
                normals.extend(tuple((normal_matrix @ mesh.corner_normals[loop].vector).normalized()) for loop in tri.loops)
                smooth.append(mesh.polygons[tri.polygon_index].use_smooth)
        data = bpy.data.meshes.new(f'{material} stage {stage} export')
        data.from_pydata(vertices, [], faces); data.update()
        layer = data.uv_layers.new(name='UVMap')
        for loop, uv in zip(layer.data, uvs): loop.uv = uv
        for polygon, value in zip(data.polygons, smooth): polygon.use_smooth = value
        data.normals_split_custom_set(normals)
        target = bpy.data.objects.new(f'{asset} stage {stage} {material}', data)
        bpy.context.scene.collection.objects.link(target); data.materials.append(items[0].active_material)
        for obj in items: bpy.data.objects.remove(obj, do_unlink=True)
        target['rtsConstructionStage'] = stage; target['rtsPartIds'] = part_ids
        target['rtsSourcePartIds'] = source_ids; target['rtsSourceObjects'] = source_objects
        merged.append(target)
        batch_rows.append({'stage': stage, 'material': material, 'part_ids': part_ids, 'source_part_ids': source_ids, 'source_objects': source_objects})
    bpy.context.view_layer.update(); after = triangle_rows(merged)
    assert before == after, 'Material-stage batching changed triangle positions/UV/material/winding'
    candidate = RUN / 'candidate' / f'{asset}.glb'
    bpy.ops.object.select_all(action='DESELECT')
    for obj in merged: obj.select_set(True)
    bpy.context.view_layer.objects.active = merged[0]
    bpy.ops.export_scene.gltf(filepath=str(candidate), export_format='GLB', use_selection=True,
        export_yup=True, export_apply=True, export_normals=True, export_tangents=True, export_texcoords=True,
        export_materials='EXPORT', export_extras=True)
    textures = externalize(candidate, original_candidate)
    doc, _ = glb_read(candidate)
    doc.setdefault('scenes', [{}])[doc.get('scene', 0)].setdefault('extras', {})['rtsConstruction'] = {'version': 1, 'thresholds': THRESHOLDS, 'stages': STAGES}
    _, binary = glb_read(candidate); glb_write(candidate, doc, binary)
    row = {'id': asset, 'origin': entry, 'origin_recipe_sha256': sha(recipe_path), 'origin_kit_json_sha256': sha(ORIGIN/'kit.json'),
           'kit_library_sha256': kit['library']['sha256'], 'footprint_m': recipe['footprint'],
           'source': source.relative_to(ROOT).as_posix(), 'source_sha256': sha(source),
           'candidate': candidate.relative_to(ROOT).as_posix(), 'sha256': sha(candidate),
           'bytes': candidate.stat().st_size, 'gzip_bytes': len(gzip.compress(candidate.read_bytes(), mtime=0)),
           'drawcalls_material_stage': len(merged), 'materials': len({b['material'] for b in batch_rows}),
           'stage_drawcalls': {str(stage): sum(b['stage'] == stage for b in batch_rows) for stage in range(4)},
           'triangle_count': sum(before.values()), 'source_bounds_z_up': original_bounds,
           'source_and_batched_triangle_uv_material_winding_match_at1e5': before == after,
           'source_geometry_digest_1e5': digest_rows(before), 'stage_batches': batch_rows,
           'normal_policy': 'Preserve source-authored loop normals; measured Blender custom-normal encoding differences vs published GLB. Do not restore by guessing hard-edge identity.',
           'textures': textures, 'part_provenance': provenance, 'runtime_publish_allowed': False}
    save(RUN/'qa'/f'{asset}-build.json', row)
    print('STAGE_BUILD', asset, len(provenance), len(merged), sum(before.values()), flush=True)
    return row

def main():
    locked = read(RUN/'raw/inputs/source-lock.json'); kit = read(RUN/'raw/inputs/kit.json')
    save(ROOT/'art-factory/rts/contracts/building-stages-2026-10-08.json', {
        'version': 1, 'status': 'candidate', 'assets': IDS, 'runtime_publish_allowed': False,
        'style_source': 'docs/superpowers/specs/2026-10-04-browser-rts-design.md',
        'source_mode': 'original-published-assembly-preserving-component-partition',
        'processing_mode': 'source-authored-3d-stage-partition',
        'screen_id': 'rts-battle-construction', 'screen_breakdown': {'assets': IDS, 'progress': [0, .2, .5, .75, 1]},
        'scene_extras': {'rtsConstruction': {'version': 1, 'thresholds': THRESHOLDS, 'stages': STAGES}},
        'node_extras': {'rtsConstructionStage': 'integer 0..3', 'rtsPartIds': 'recipe instance ID array', 'rtsSourcePartIds': 'kit part ID array', 'rtsSourceObjects': 'source editable mesh name array'},
        'visibility': 'construction >= thresholds[rtsConstructionStage]; construction=1 shows every node',
        'coordinate': 'source Blender Z-up front -Y; GLB Y-up front +Z; meters; identity batch pivot and scale',
        'source_preservation': 'Materialized evaluated original components with editable individual meshes, original UV/material and saved packed textures; original inputs retained unchanged',
        'normal_roundtrip_exception': {'method': 'preserve original source-authored normals; compare complete directed triangle corners vs published GLB; no guessed normal restoration', 'tolerance_vector_delta': .005, 'independent_completed_AB_review': 'pending root'},
        'stage_order': ['foundation/courtyard including courtyard entry steps', 'bearing walls/posts/beams/stairs and structural iron joinery', 'complete source roof assemblies including gables and eaves', 'doors/windows/banners/nonbearing equipment'],
        'forbidden': ['third-party art', 'new primitive placeholder geometry', 'whole-building sinking', 'vertex deformation', 'texture changes', 'runtime/public/registry writes'],
        'qa_gates': ['classification red-green tests incl bridge/ridge', 'assembly/recipe/kit SHA and part signatures', 'source vs joined triangle/position/UV/material equivalence', 'published vs candidate actual GLB Blender reimport equivalence', '0/.2/.5/.75/1 fixed-camera renders', 'Khronos validator zero errors', 'bytes/gzip and material-stage drawcalls'],
        'asset_generation_manual_review': False, 'assembly_human_review': 'root integration pending',
        'source_lock': (RUN/'raw/inputs/source-lock.json').relative_to(ROOT).as_posix()})
    rows = [build(asset, locked, kit) for asset in IDS]
    save(RUN/'qa/build-summary.json', rows)

if __name__ == '__main__': main()
