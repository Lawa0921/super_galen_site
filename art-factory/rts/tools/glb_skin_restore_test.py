import copy
import struct
import unittest
from glb_skin_restore import restore_skin
from original_guard_walk_refine_glb import _floats


def fixture():
    doc = {'buffers': [{'byteLength': 0}], 'bufferViews': [], 'accessors': [], 'nodes': [{'name': 'Part_LOD0', 'mesh': 0, 'skin': 0}, {'name': 'Upper'}, {'name': 'Fore'}], 'skins': [{'joints': [1, 2]}]}
    binary = bytearray()
    def attribute(values, kind, width, component=5126):
        while len(binary) % 4:
            binary.append(0)
        start = len(binary)
        binary.extend(struct.pack('<' + ('f' if component == 5126 else 'H') * len(values), *values))
        view = len(doc['bufferViews'])
        doc['bufferViews'].append({'buffer': 0, 'byteOffset': start, 'byteLength': len(binary) - start})
        doc['accessors'].append({'bufferView': view, 'componentType': component, 'count': len(values) // width, 'type': kind})
        return len(doc['accessors']) - 1
    attrs = {'POSITION': attribute([0, 0, 0, 1, 0, 0], 'VEC3', 3), '_RTS_SOURCE_VERTEX': attribute([0, 1], 'SCALAR', 1),
             'JOINTS_0': attribute([0, 0, 0, 0] * 2, 'VEC4', 4, 5123), 'WEIGHTS_0': attribute([1, 0, 0, 0] * 2, 'VEC4', 4)}
    doc['meshes'] = [{'primitives': [{'attributes': attrs}]}]
    doc['buffers'][0]['byteLength'] = len(binary)
    source = {'Part_LOD0': {'vertices': [{'position': [0, 0, 0], 'weights': [['Upper', .999997], ['Fore', .000003]]}, {'position': [1, 0, 0], 'weights': [['Upper', 1]]}]}}
    return doc, bytes(binary), source


class SkinRestoreTests(unittest.TestCase):
    def test_restores_small_influence_without_changing_positions_or_caller(self):
        doc, binary, source = fixture()
        before = copy.deepcopy(doc)
        updated, data, report = restore_skin(doc, binary, source)
        attrs = updated['meshes'][0]['primitives'][0]['attributes']
        weights = _floats(updated, data, attrs['WEIGHTS_0'])
        self.assertAlmostEqual(weights[1], .000003, places=10)
        self.assertEqual(_floats(updated, data, attrs['POSITION']), (0, 0, 0, 1, 0, 0))
        self.assertEqual(report['vertices'], 2)
        self.assertEqual(doc, before)
    def test_missing_source_identity_is_rejected(self):
        doc, binary, source = fixture()
        del doc['meshes'][0]['primitives'][0]['attributes']['_RTS_SOURCE_VERTEX']
        with self.assertRaisesRegex(ValueError, 'identity'):
            restore_skin(doc, binary, source)
    def test_mismatched_position_fails_closed(self):
        doc, binary, source = fixture()
        source['Part_LOD0']['vertices'][0]['position'][0] = .1
        with self.assertRaisesRegex(ValueError, 'position'):
            restore_skin(doc, binary, source)
    def test_missing_skin_joint_is_rejected(self):
        doc, binary, source = fixture()
        source['Part_LOD0']['vertices'][0]['weights'][1][0] = 'Unknown'
        with self.assertRaisesRegex(ValueError, 'joint'):
            restore_skin(doc, binary, source)


if __name__ == '__main__':
    unittest.main()
