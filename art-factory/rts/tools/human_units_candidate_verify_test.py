"""Structural tests for actual GLB accessor inspection."""
import json
import struct
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from human_units_candidate_verify import inspect_glb, verify
from human_units_spec import BONE_NAMES


def make_glb(joint_index=0, weight_value=1.0, missing_bone=None):
    binary = bytearray()
    views = []
    accessors = []

    def add_access(data, component, kind, count, type_name, minimum=None, maximum=None):
        while len(binary) % 4:
            binary.append(0)
        offset = len(binary)
        binary.extend(data)
        view = len(views)
        views.append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(data)})
        acc = {'bufferView': view, 'componentType': component, 'count': count, 'type': type_name}
        if minimum is not None:
            acc['min'] = minimum
        if maximum is not None:
            acc['max'] = maximum
        accessors.append(acc)
        return len(accessors) - 1

    positions = add_access(struct.pack('<9f', 0, 0, 0, 1, 0, 0, 0, 1, 0),
                           5126, 'VEC3', 3, 'VEC3', [0, 0, 0], [1, 1, 0])
    texcoords = add_access(struct.pack('<6f', 0, 0, 1, 0, 0, 1), 5126, 'VEC2', 3, 'VEC2')
    joints = add_access(struct.pack('<12H', joint_index, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0),
                        5123, 'VEC4', 3, 'VEC4')
    weights = add_access(struct.pack('<12f', weight_value, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0),
                         5126, 'VEC4', 3, 'VEC4')
    indices = add_access(struct.pack('<3H', 0, 1, 2), 5123, 'SCALAR', 3, 'SCALAR', [0], [2])
    image_bytes = b'png!'
    image_view = len(views)
    views.append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(image_bytes)})
    binary.extend(image_bytes)
    names = list(BONE_NAMES) + ['ElbowSupport', 'GuardMesh']
    if missing_bone:
        names[names.index(missing_bone)] = 'Missing_' + missing_bone
    doc = {
        'asset': {'version': '2.0'},
        'buffers': [{'byteLength': len(binary)}],
        'bufferViews': views,
        'accessors': accessors,
        'nodes': [{'name': name} for name in names[:-1]] + [{'name': names[-1], 'mesh': 0, 'skin': 0}],
        'skins': [{'joints': list(range(21))}],
        'meshes': [{'primitives': [{
            'attributes': {'POSITION': positions, 'TEXCOORD_0': texcoords,
                           'JOINTS_0': joints, 'WEIGHTS_0': weights},
            'indices': indices, 'material': 0,
        }]}],
        'materials': [{'name': 'TeamCloth_crossbow',
                       'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1],
                                                'baseColorTexture': {'index': 0}}}],
        'textures': [{'source': 0}],
        'images': [{'bufferView': image_view, 'mimeType': 'image/png'}],
        'animations': [{'name': name, 'channels': [{}]} for name in ('Idle', 'Walk', 'Attack', 'Hurt', 'Death')],
    }
    json_bytes = json.dumps(doc, separators=(',', ':')).encode('utf-8')
    while len(json_bytes) % 4:
        json_bytes += b' '
    while len(binary) % 4:
        binary.append(0)
    data = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(json_bytes) + 8 + len(binary))
    data += struct.pack('<I4s', len(json_bytes), b'JSON') + json_bytes
    data += struct.pack('<I4s', len(binary), bytes((66, 73, 78, 0))) + binary
    return data


class CandidateVerifierTests(unittest.TestCase):
    def inspect(self, data):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'candidate.glb'
            path.write_bytes(data)
            return inspect_glb(path, 'crossbow')

    def test_allows_additional_joint_when_core_human_bones_and_weights_are_valid(self):
        report = self.inspect(make_glb())
        self.assertTrue(report['passed'], report['failures'])
        self.assertEqual(report['joints_per_skin'], [21])
        self.assertTrue(report['canonical_bones_present'])
        self.assertEqual(report['weights']['vertices_checked'], 3)
        self.assertEqual(report['pbr']['pbr_material_count'], 1)

    def test_rejects_joint_weight_reference_outside_actual_skin(self):
        report = self.inspect(make_glb(joint_index=21))
        self.assertIn('joint_index_out_of_range', report['failures'])

    def test_rejects_unnormalized_weights(self):
        report = self.inspect(make_glb(weight_value=0.5))
        self.assertIn('weight_sums_not_normalized', report['failures'])

    def test_rejects_missing_canonical_bone(self):
        report = self.inspect(make_glb(missing_bone='Hand_R'))
        self.assertIn('missing_canonical_human_bones', report['failures'])

    def test_production_report_records_exact_source_and_lod_hashes(self):
        with tempfile.TemporaryDirectory() as tmp:
            run = Path(tmp) / 'candidate-run'
            candidate = run / 'candidate'
            qa = run / 'qa'
            candidate.mkdir(parents=True)
            source = candidate / 'worker-source.blend'
            source_bytes = b'authoritative source blend bytes'
            source.write_bytes(source_bytes)
            (candidate / 'worker-lod0.glb').write_bytes(b'lod0 bytes')
            (candidate / 'worker-lod1.glb').write_bytes(b'lod1 bytes')
            rows = {
                'worker-lod0.glb': {'triangle_count': 19999, 'passed': True,
                                    'sha256': '0', 'weights': {'invalid_joint_indices': 0,
                                        'invalid_weight_values': 0, 'unweighted_vertices': 0,
                                        'max_weight_sum_error': 0}, 'failures': []},
                'worker-lod1.glb': {'triangle_count': 9000, 'passed': True,
                                    'sha256': '1', 'weights': {'invalid_joint_indices': 0,
                                        'invalid_weight_values': 0, 'unweighted_vertices': 0,
                                        'max_weight_sum_error': 0}, 'failures': []},
            }

            def fake_inspect(path, unit):
                result = dict(rows[path.name])
                result['sha256'] = __import__('hashlib').sha256(path.read_bytes()).hexdigest()
                return result

            with patch('human_units_candidate_verify.inspect_glb', side_effect=fake_inspect):
                report = verify(run, 'worker', 'worker')
            source_sha = __import__('hashlib').sha256(source_bytes).hexdigest()
            self.assertEqual(report['source']['path'], str(source))
            self.assertEqual(report['source_sha256'], source_sha)
            self.assertEqual(report['glbs']['lod0']['sha256'],
                             __import__('hashlib').sha256(b'lod0 bytes').hexdigest())
            self.assertTrue(report['passed_static'])
            written = json.loads((qa / 'production-verify.json').read_text(encoding='utf-8'))
            self.assertEqual(written['source']['sha256'], source_sha)


if __name__ == '__main__':
    unittest.main()
