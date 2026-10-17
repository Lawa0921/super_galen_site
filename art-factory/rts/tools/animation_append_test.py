"""Animation-only packaging must preserve the published asset it extends."""
from copy import deepcopy
import importlib.util
import math
import struct
import unittest


def fixture(name='Cast'):
    binary = struct.pack('<10f', 0., .6, 0., 0., 0., 1., 0., math.sin(.2), 0., math.cos(.2))
    return {'asset': {'version': '2.0'}, 'buffers': [{'byteLength': len(binary)}],
            'nodes': [{'name': 'Rig', 'children': [1]}, {'name': 'Hand', 'translation': [0, 1, 0]}],
            'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': 8},
                            {'buffer': 0, 'byteOffset': 8, 'byteLength': 32}],
            'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': 2, 'type': 'SCALAR', 'min': [0], 'max': [.6]},
                          {'bufferView': 1, 'componentType': 5126, 'count': 2, 'type': 'VEC4'}],
            'animations': [{'name': name, 'samplers': [{'input': 0, 'output': 1, 'interpolation': 'LINEAR'}],
                            'channels': [{'sampler': 0, 'target': {'node': 1, 'path': 'rotation'}}]}]}, binary


def skinned_fixture(name='Cast'):
    document, binary = fixture(name)
    matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -1, 0, 1]
    document['bufferViews'].append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': 64})
    document['accessors'].append({'bufferView': 2, 'componentType': 5126, 'count': 1, 'type': 'MAT4'})
    document['skins'] = [{'joints': [1], 'inverseBindMatrices': 2}]
    binary += struct.pack('<16f', *matrix); document['buffers'][0]['byteLength'] = len(binary)
    return document, binary


class AnimationAppendTest(unittest.TestCase):
    def append(self, *args):
        spec = importlib.util.find_spec('animation_append')
        self.assertIsNotNone(spec, 'Missing animation-only appender')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module.append_animations(*args)

    def test_preserves_original_data_and_maps_bones_by_name_without_copying_source_meshes(self):
        base, binary = fixture('Idle')
        base['nodes'] = [{'name': 'Hand', 'translation': [0, 1, 0]}, {'name': 'Rig', 'children': [0]}]
        base['animations'][0]['channels'][0]['target']['node'] = 0
        base['materials'] = [{'name': 'TeamCloth', 'extras': {'mask': 'keep'}}]
        base['images'] = [{'uri': '../materials/original.webp'}]
        source, incoming = fixture()
        source['meshes'] = [{'name': 'MustNotReplaceGeometry'}]
        before = deepcopy(base), bytes(binary), deepcopy(source), bytes(incoming)
        out, packed = self.append(base, binary, source, incoming, ['Cast'])
        self.assertEqual((base, binary, source, incoming), before)
        self.assertEqual(packed[:len(binary)], binary)
        for key, value in base.items():
            if key not in ('buffers', 'bufferViews', 'accessors', 'animations'):
                self.assertEqual(out[key], value)
        self.assertNotIn('meshes', out)
        self.assertEqual(out['animations'][0], base['animations'][0])
        self.assertEqual(out['accessors'][:2], base['accessors'])
        self.assertEqual(out['bufferViews'][:2], base['bufferViews'])
        added = out['animations'][1]
        self.assertEqual(added['channels'][0]['target'], {'node': 0, 'path': 'rotation'})
        sampler = added['samplers'][0]
        for field, count in [('input', 2), ('output', 8)]:
            accessor = out['accessors'][sampler[field]]
            offset = out['bufferViews'][accessor['bufferView']]['byteOffset'] + accessor.get('byteOffset', 0)
            actual = struct.unpack_from('<' + 'f' * count, packed, offset)
            expected = struct.unpack_from('<' + 'f' * count, incoming, 0 if field == 'input' else 8)
            self.assertEqual(actual, expected)

    def test_rejects_missing_ambiguous_or_reparented_target_without_changing_inputs(self):
        for change in ('missing', 'duplicate', 'parent'):
            base, binary = fixture('Idle'); source, incoming = fixture()
            if change == 'missing': base['nodes'][1]['name'] = 'Foot'
            if change == 'duplicate': base['nodes'].append(deepcopy(base['nodes'][1]))
            if change == 'parent': base['nodes'][0]['children'] = []
            before = deepcopy(base), deepcopy(source)
            with self.subTest(change=change), self.assertRaisesRegex(ValueError, 'node|parent'):
                self.append(base, binary, source, incoming, ['Cast'])
            self.assertEqual((base, source), before)

    def test_rejects_bind_pose_change(self):
        base, binary = fixture('Idle'); source, incoming = fixture()
        source['nodes'][1]['translation'][1] = 2
        with self.assertRaisesRegex(ValueError, 'bind'):
            self.append(base, binary, source, incoming, ['Cast'])

    def test_preserves_skin_bind_and_rejects_changed_or_missing_source_inverse_bind(self):
        base, binary = skinned_fixture('Idle'); source, incoming = skinned_fixture()
        out, packed = self.append(base, binary, source, incoming, ['Cast'])
        self.assertEqual(out['skins'], base['skins']); self.assertEqual(packed[:len(binary)], binary)
        changed = bytearray(incoming); struct.pack_into('<f', changed, 40 + 13 * 4, -.9)
        with self.assertRaisesRegex(ValueError, 'bind'):
            self.append(base, binary, source, bytes(changed), ['Cast'])
        source.pop('skins')
        with self.assertRaisesRegex(ValueError, 'bind'):
            self.append(base, binary, source, incoming, ['Cast'])

    def test_rejects_unreferenced_sampler_instead_of_copying_unvalidated_sparse_indices(self):
        base, binary = fixture('Idle'); source, incoming = fixture()
        orphan = deepcopy(source['accessors'][1]); orphan['sparse'] = {'count': 1}
        source['accessors'].append(orphan)
        source['animations'][0]['samplers'].append({'input': 0, 'output': 2})
        with self.assertRaisesRegex(ValueError, 'sampler'):
            self.append(base, binary, source, incoming, ['Cast'])

    def test_rejects_duplicate_missing_or_empty_clip_selection(self):
        base, binary = fixture('Idle'); source, incoming = fixture()
        for names in ([], ['Idle'], ['Cast', 'Cast'], ['Missing']):
            with self.subTest(names=names), self.assertRaisesRegex(ValueError, 'clip'):
                self.append(base, binary, source, incoming, names)

    def test_rejects_out_of_bounds_buffer_and_unsupported_sparse_curves(self):
        for change in ('bounds', 'sparse'):
            base, binary = fixture('Idle'); source, incoming = fixture()
            if change == 'bounds': source['bufferViews'][1]['byteLength'] += 8
            else: source['accessors'][1]['sparse'] = {'count': 1}
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.append(base, binary, source, incoming, ['Cast'])

    def test_rejects_non_finite_or_non_increasing_times_and_mismatched_key_count(self):
        for change in ('nan', 'reverse', 'count'):
            base, binary = fixture('Idle'); source, incoming = fixture()
            if change == 'count': source['accessors'][1]['count'] = 1
            else: incoming = struct.pack('<2f', 0., float('nan') if change == 'nan' else -1.) + incoming[8:]
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.append(base, binary, source, incoming, ['Cast'])


if __name__ == '__main__':
    unittest.main()
