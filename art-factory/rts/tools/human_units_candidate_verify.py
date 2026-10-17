"""Verify exact source/GLB bytes and structural human-unit invariants.

This adapter checks the exported GLB bytes directly. Extra authored joints are
permitted; the canonical 20 human bones must remain present in the skin.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
from pathlib import Path

from human_units_spec import BONE_NAMES, UNITS

SUPPORTED_UNITS = set(UNITS) | {'knight'}


CLIPS = {'Idle', 'Walk', 'Attack', 'Hurt', 'Death'}
COMPONENTS = {
    5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2),
    5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4),
}
TYPE_COUNTS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4,
               'MAT2': 4, 'MAT3': 9, 'MAT4': 16}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_glb(path: Path):
    data = path.read_bytes()
    if len(data) < 20:
        raise ValueError(f'{path.name}: truncated GLB')
    magic, version, total = struct.unpack_from('<4sII', data, 0)
    if magic != b'glTF' or version != 2 or total != len(data):
        raise ValueError(f'{path.name}: invalid GLB header or length')
    offset = 12
    doc, binary = None, None
    while offset < len(data):
        if offset + 8 > len(data):
            raise ValueError(f'{path.name}: truncated GLB chunk header')
        length, kind = struct.unpack_from('<I4s', data, offset)
        offset += 8
        payload = data[offset:offset + length]
        if len(payload) != length:
            raise ValueError(f'{path.name}: truncated GLB chunk')
        offset += length
        if kind == b'JSON' and doc is None:
            doc = json.loads(payload.rstrip(b' \\x00'))
        elif kind == bytes((66, 73, 78, 0)) and binary is None:
            binary = payload
    if not isinstance(doc, dict) or binary is None:
        raise ValueError(f'{path.name}: expected JSON and embedded BIN chunks')
    if len(doc.get('buffers', [])) != 1 or doc['buffers'][0].get('uri'):
        raise ValueError(f'{path.name}: only one embedded GLB buffer is supported')
    return data, doc, binary


def accessor_values(doc, binary, index):
    accessor = doc.get('accessors', [])[index]
    if accessor.get('sparse'):
        raise ValueError('sparse accessors are not supported by structural QA')
    view = doc['bufferViews'][accessor['bufferView']]
    component = accessor['componentType']
    if component not in COMPONENTS:
        raise ValueError(f'unsupported accessor component type {component}')
    fmt, size = COMPONENTS[component]
    width = TYPE_COUNTS[accessor['type']]
    stride = view.get('byteStride', width * size)
    if stride < width * size:
        raise ValueError('accessor byteStride is smaller than element size')
    start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    values = []
    unpack = struct.Struct('<' + fmt * width).unpack_from
    for row in range(accessor['count']):
        offset = start + row * stride
        if offset + width * size > len(binary):
            raise ValueError('accessor reads beyond embedded GLB buffer')
        values.append(unpack(binary, offset))
    if accessor.get('normalized'):
        bits = size * 8
        if component in (5120, 5122):
            maximum = (1 << (bits - 1)) - 1
            values = [tuple(max(-1.0, value / maximum) for value in row) for row in values]
        else:
            maximum = (1 << bits) - 1
            values = [tuple(value / maximum for value in row) for row in values]
    return values


def _close_enough_weights(weights):
    max_error = 0.0
    bad_values = 0
    unweighted = 0
    for row in weights:
        if any(not math.isfinite(float(value)) or float(value) < -1e-6 for value in row):
            bad_values += 1
            continue
        total = sum(float(value) for value in row)
        max_error = max(max_error, abs(total - 1.0))
        if total <= 1e-8:
            unweighted += 1
    return max_error, bad_values, unweighted


def _image_texture_checks(doc):
    failures = []
    images = doc.get('images', [])
    textures = doc.get('textures', [])
    if not images:
        failures.append('no_embedded_or_external_PBR_images')
    for image in images:
        if image.get('uri') and not image['uri'].startswith('data:'):
            failures.append('external_image_uri')
        if 'bufferView' in image and image['bufferView'] >= len(doc.get('bufferViews', [])):
            failures.append('image_buffer_view_out_of_range')
        if 'mimeType' not in image and not image.get('uri', '').startswith('data:'):
            failures.append('image_missing_mime_type')
    material_uvs = {}
    for mesh in doc.get('meshes', []):
        for primitive in mesh.get('primitives', []):
            material_index = primitive.get('material')
            if material_index is not None:
                material_uvs.setdefault(material_index, []).append(
                    'TEXCOORD_0' in primitive.get('attributes', {}))
    used_materials = set(material_uvs)
    names = []
    used_names = []
    pbr_count = 0
    for material_index in used_materials:
        if material_index < 0 or material_index >= len(doc.get('materials', [])):
            failures.append('material_index_out_of_range')
            continue
        material = doc['materials'][material_index]
        names.append(material.get('name', ''))
        used_names.append(material.get('name', ''))
        pbr = material.get('pbrMetallicRoughness')
        if not isinstance(pbr, dict):
            failures.append('material_missing_metallic_roughness_PBR')
            continue
        pbr_count += 1
        factor = pbr.get('baseColorFactor', [1, 1, 1, 1])
        if not isinstance(factor, list) or len(factor) != 4 or any(
                not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 1
                for value in factor):
            failures.append('material_invalid_baseColorFactor')
        for key in ('metallicFactor', 'roughnessFactor'):
            value = pbr.get(key, 1.0)
            if not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 1:
                failures.append(f'material_invalid_{key}')
        for texture_key in ('baseColorTexture', 'metallicRoughnessTexture'):
            texture_info = pbr.get(texture_key)
            if texture_info is None:
                continue
            texture_index = texture_info.get('index', -1)
            if not 0 <= texture_index < len(textures):
                failures.append(f'{texture_key}_index_out_of_range')
                continue
            texture = textures[texture_index]
            source = texture.get('source')
            if source is None and texture.get('extensions', {}).get('KHR_texture_basisu'):
                source = texture['extensions']['KHR_texture_basisu'].get('source')
            if source is not None and not 0 <= source < len(images):
                failures.append(f'{texture_key}_image_index_out_of_range')
            if not all(material_uvs.get(material_index, [])):
                failures.append(f'{texture_key}_without_TEXCOORD_0')
    if not pbr_count:
        failures.append('no_used_PBR_materials')
    return {'materials': names, 'used_materials': used_names, 'images': len(images), 'textures': len(textures),
            'pbr_material_count': pbr_count, 'failures': sorted(set(failures))}


def inspect_glb(path: Path, unit: str):
    data, doc, binary = read_glb(path)
    failures = []
    clips = [animation.get('name') for animation in doc.get('animations', [])]
    if set(clips) != CLIPS or len(clips) != len(CLIPS):
        failures.append('exact_five_clips')
    if any(not animation.get('channels') for animation in doc.get('animations', [])):
        failures.append('empty_animation_channels')

    skins = doc.get('skins', [])
    if not skins:
        failures.append('missing_skin')
    joint_counts = [len(skin.get('joints', [])) for skin in skins]
    skin_bones = set()
    for skin in skins:
        for node_index in skin.get('joints', []):
            if not 0 <= node_index < len(doc.get('nodes', [])):
                failures.append('skin_joint_node_out_of_range')
            else:
                skin_bones.add(doc['nodes'][node_index].get('name'))
    missing_bones = sorted(set(BONE_NAMES) - skin_bones)
    if missing_bones:
        failures.append('missing_canonical_human_bones')

    weight_rows = 0
    max_weight_sum_error = 0.0
    invalid_weight_values = 0
    unweighted_vertices = 0
    invalid_joint_indices = 0
    triangle_count = 0
    used_materials = set()
    attached_skinned_meshes = set()
    for node in doc.get('nodes', []):
        mesh_index = node.get('mesh')
        if mesh_index is None:
            continue
        if not 0 <= mesh_index < len(doc.get('meshes', [])):
            failures.append('mesh_node_index_out_of_range')
            continue
        mesh = doc['meshes'][mesh_index]
        skin_index = node.get('skin')
        if skin_index is not None and not 0 <= skin_index < len(skins):
            failures.append('mesh_skin_index_out_of_range')
            continue
        for primitive in mesh.get('primitives', []):
            if primitive.get('mode', 4) != 4:
                continue
            attributes = primitive.get('attributes', {})
            position_index = attributes.get('POSITION')
            if position_index is None:
                failures.append('triangle_primitive_missing_POSITION')
                continue
            vertex_count = doc['accessors'][position_index]['count']
            indices_index = primitive.get('indices')
            if indices_index is None:
                corner_count = vertex_count
            else:
                indices = accessor_values(doc, binary, indices_index)
                corner_count = len(indices)
                if any(index < 0 or index >= vertex_count for (index,) in indices):
                    failures.append('triangle_index_out_of_range')
            if corner_count % 3:
                failures.append('triangle_corner_count_not_divisible_by_3')
            triangle_count += corner_count // 3
            material_index = primitive.get('material')
            if material_index is not None:
                used_materials.add(material_index)

            joints_accessor = attributes.get('JOINTS_0')
            weights_accessor = attributes.get('WEIGHTS_0')
            if joints_accessor is None and weights_accessor is None:
                continue
            if joints_accessor is None or weights_accessor is None or skin_index is None:
                failures.append('incomplete_skinned_primitive_attributes')
                continue
            attached_skinned_meshes.add(mesh_index)
            joints = accessor_values(doc, binary, joints_accessor)
            weights = accessor_values(doc, binary, weights_accessor)
            if len(joints) != vertex_count or len(weights) != vertex_count:
                failures.append('skin_attribute_count_differs_from_POSITION')
                continue
            count_joints = len(skins[skin_index].get('joints', []))
            for row in joints:
                if any(not isinstance(index, int) or index < 0 or index >= count_joints for index in row):
                    invalid_joint_indices += 1
            error, invalid, unweighted = _close_enough_weights(weights)
            weight_rows += len(weights)
            max_weight_sum_error = max(max_weight_sum_error, error)
            invalid_weight_values += invalid
            unweighted_vertices += unweighted
    if weight_rows == 0:
        failures.append('no_exported_skin_weights')
    if invalid_joint_indices:
        failures.append('joint_index_out_of_range')
    if invalid_weight_values:
        failures.append('invalid_negative_or_nonfinite_weights')
    if unweighted_vertices:
        failures.append('unweighted_vertices')
    if max_weight_sum_error > 0.01:
        failures.append('weight_sums_not_normalized')
    pbr = _image_texture_checks(doc)
    failures.extend(pbr['failures'])
    teamcloth = any('teamcloth' in str(name).lower() for name in pbr['used_materials'])
    if (UNITS.get(unit, {'teamcloth': True})['teamcloth']) and not teamcloth:
        failures.append('missing_team_cloth_material')
    if not UNITS.get(unit, {'teamcloth': True})['teamcloth'] and teamcloth:
        failures.append('unexpected_team_cloth_material')
    for skin in skins:
        if skin.get('inverseBindMatrices') is not None:
            accessor_index = skin['inverseBindMatrices']
            if not 0 <= accessor_index < len(doc.get('accessors', [])):
                failures.append('inverse_bind_accessor_out_of_range')
            elif doc['accessors'][accessor_index].get('count') != len(skin.get('joints', [])):
                failures.append('inverse_bind_count_differs_from_joint_count')
    return {
        'path': str(path), 'bytes': len(data), 'sha256': sha256(data),
        'clips': clips, 'joints_per_skin': joint_counts,
        'canonical_bones_present': not missing_bones, 'missing_bones': missing_bones,
        'materials': pbr['materials'], 'pbr': pbr,
        'weights': {'vertices_checked': weight_rows, 'max_weight_sum_error': max_weight_sum_error,
                    'invalid_joint_indices': invalid_joint_indices,
                    'invalid_weight_values': invalid_weight_values,
                    'unweighted_vertices': unweighted_vertices},
        'triangle_count': triangle_count,
        'failures': sorted(set(failures)), 'passed': not failures,
    }


def verify(run: Path, unit: str, stem: str | None = None,
           source: Path | None = None):
    if unit not in SUPPORTED_UNITS:
        raise ValueError(f'unit must be one of {sorted(SUPPORTED_UNITS)}')
    run = run.resolve()
    if not run.is_dir():
        raise ValueError('candidate run directory does not exist')
    if source is None:
        choices = list((run / 'candidate').glob('*.blend'))
        if len(choices) != 1:
            raise ValueError('select --source; candidate must contain exactly one .blend otherwise')
        source = choices[0]
    elif not source.is_absolute():
        source = run / source
    source = source.resolve()
    if not source.is_relative_to(run):
        raise ValueError('editable source .blend must be inside the selected run')
    if not source.is_file():
        raise ValueError(f'missing editable source .blend: {source}')
    stem = stem or f'{unit}-production'
    glbs = {}
    for lod in (0, 1):
        glbs[lod] = inspect_glb(run / 'candidate' / f'{stem}-lod{lod}.glb', unit)
    lod0_triangles, lod1_triangles = glbs[0]['triangle_count'], glbs[1]['triangle_count']
    triangle_pass = (lod0_triangles < 20000 and 7000 <= lod1_triangles <= 10000) if unit != 'knight' else (lod0_triangles < 20000 and lod1_triangles < 20000)
    report = {
        'schema': 'human-unit-production-verify-v2',
        'unit': unit,
        'run': str(run),
        'source': {'path': str(source), 'sha256': sha256(source.read_bytes())},
        'source_path': str(source),
        'source_sha256': sha256(source.read_bytes()),
        'glbs': {
            f'lod{lod}': {
                **glbs[lod],
                'triangle_pass': (lod0_triangles < 20000 if lod == 0 else (7000 <= lod1_triangles <= 10000 if unit != 'knight' else lod1_triangles < 20000)),
            } for lod in (0, 1)
        },
        'weights_pass': all(glbs[lod]['weights']['invalid_joint_indices'] == 0 and
                            glbs[lod]['weights']['invalid_weight_values'] == 0 and
                            glbs[lod]['weights']['unweighted_vertices'] == 0 and
                            glbs[lod]['weights']['max_weight_sum_error'] <= 0.01
                            for lod in (0, 1)),
        'ground_pass': None,
        'triangle_pass': triangle_pass,
        'passed_static': all(glbs[lod]['passed'] for lod in (0, 1)) and triangle_pass,
        'requires_human_visual_review': True,
        'runtime_publish_allowed': False,
    }
    output = run / 'qa/production-verify.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + '.next')
    temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n',
                         encoding='utf-8', newline='\n')
    temporary.replace(output)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project-root', type=Path, required=True)
    parser.add_argument('--run', type=Path, required=True,
                        help='one candidate run directory under art-factory/rts/runs')
    parser.add_argument('--unit', choices=sorted(SUPPORTED_UNITS), required=True)
    parser.add_argument('--stem', help='candidate GLB name prefix before -lod0/-lod1')
    parser.add_argument('--source', type=Path, help='source .blend path, relative to run or absolute')
    args = parser.parse_args()
    root = args.project_root.resolve()
    run = (args.run if args.run.is_absolute() else root / args.run).resolve()
    allowed_runs = (root / 'art-factory/rts/runs').resolve()
    if not run.is_relative_to(allowed_runs):
        parser.error('--run must be inside art-factory/rts/runs')
    report = verify(run, args.unit, args.stem, args.source)
    print(json.dumps({
        'unit': args.unit,
        'source_sha256': report['source_sha256'],
        'assets': [{'lod': lod, 'sha256': report['glbs'][f'lod{lod}']['sha256'],
                    'passed': report['glbs'][f'lod{lod}']['passed']} for lod in (0, 1)],
        'passed_static': report['passed_static'],
        'runtime_publish_allowed': False,
    }, ensure_ascii=False, indent=2))
    if not report['passed_static']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
