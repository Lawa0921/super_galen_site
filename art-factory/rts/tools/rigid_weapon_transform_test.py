from copy import deepcopy
import struct
import unittest
from rigid_weapon_transform import flip_weapon_x, read_attribute


def fixture():
    data = bytearray(); views = []; accessors = []
    def attr(values, shape, component=5126):
        while len(data) % 4: data.append(0)
        payload = struct.pack('<' + ('f' if component == 5126 else 'H') * len(values), *values)
        views.append({'buffer': 0, 'byteOffset': len(data), 'byteLength': len(payload)})
        data.extend(payload); accessors.append({'bufferView': len(views)-1, 'componentType': component, 'count': len(values)//int(shape[-1]), 'type': shape})
        return len(accessors)-1
    attributes = {'POSITION': attr([1, 2, 3, 1, 4, 3], 'VEC3'),
                  'NORMAL': attr([0, 1, 0, 0, 0, 1], 'VEC3'),
                  'JOINTS_0': attr([0, 0, 0, 0]*2, 'VEC4', 5123),
                  'WEIGHTS_0': attr([1, 0, 0, 0]*2, 'VEC4')}
    doc = {'buffers': [{'byteLength': len(data)}], 'bufferViews': views, 'accessors': accessors,
           'materials': [{'name': 'WornLeatherGrip'}], 'skins': [{'joints': [1]}],
           'nodes': [{'name': 'Sword', 'mesh': 0, 'skin': 0}, {'name': 'Hand_R'}],
           'meshes': [{'primitives': [{'attributes': attributes, 'material': 0}]}],
           'animations': [{'name': 'Attack'}]}
    return doc, bytes(data)


class RigidWeaponTransformTest(unittest.TestCase):
    def test_rotates_about_grip_without_touching_original_bytes_or_other_data(self):
        doc, binary = fixture(); before = deepcopy(doc)
        out, packed, report = flip_weapon_x(doc, binary, 'Sword')
        self.assertEqual(doc, before); self.assertEqual(packed[:len(binary)], binary)
        self.assertEqual(report['pivot'], [1, 3, 3])
        attrs = out['meshes'][0]['primitives'][0]['attributes']
        self.assertEqual(read_attribute(out, packed, attrs['POSITION']), [(1., 4., 3.), (1., 2., 3.)])
        self.assertEqual(read_attribute(out, packed, attrs['NORMAL']), [(0., -1., 0.), (0., 0., -1.)])
        self.assertEqual(out['accessors'][attrs['POSITION']]['min'], [1, 2, 3])
        self.assertEqual(out['skins'], doc['skins']); self.assertEqual(out['animations'], doc['animations'])
        self.assertEqual(attrs['JOINTS_0'], doc['meshes'][0]['primitives'][0]['attributes']['JOINTS_0'])

    def test_rejects_a_shared_mesh_or_nonrigid_attachment(self):
        doc, binary = fixture(); doc['nodes'].append({'name': 'other', 'mesh': 0})
        with self.assertRaises(ValueError): flip_weapon_x(doc, binary, 'Sword')
        doc, binary = fixture(); doc['nodes'][1]['name'] = 'Spine'
        with self.assertRaises(ValueError): flip_weapon_x(doc, binary, 'Sword')


if __name__ == '__main__': unittest.main()
