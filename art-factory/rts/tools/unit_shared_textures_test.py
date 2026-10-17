from copy import deepcopy
import hashlib
import struct
import unittest

from unit_shared_textures import externalize_images, verify_externalization


def fixture():
    image = b'\xff\xd8original-image-bytes\xff\xd9'
    positions = struct.pack('<6f', 1, 2, 3, 4, 5, 6)
    padding = b'\0' * ((-len(image)) % 4)
    start = len(image) + len(padding)
    doc = {
        'asset': {'version': '2.0'}, 'buffers': [{'byteLength': start + len(positions)}],
        'bufferViews': [{'buffer': 0, 'byteLength': len(image)},
                        {'buffer': 0, 'byteOffset': start, 'byteLength': len(positions), 'target': 34962}],
        'images': [{'name': 'original', 'bufferView': 0, 'mimeType': 'image/jpeg'}],
        'textures': [{'source': 0}], 'materials': [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}}}],
        'accessors': [{'bufferView': 1, 'componentType': 5126, 'count': 2, 'type': 'VEC3'}],
        'meshes': [{'primitives': [{'attributes': {'POSITION': 0}, 'material': 0}]}],
        'nodes': [{'mesh': 0}], 'skins': [{'inverseBindMatrices': 0, 'joints': [0]}],
        'animations': [{'samplers': [{'input': 0, 'output': 0}], 'channels': []}],
        'scenes': [{'nodes': [0]}], 'scene': 0
    }
    return doc, image + padding + positions, image, positions


class SharedTextureTests(unittest.TestCase):
    def test_retained_embedded_image_is_verified_separately_from_geometry(self):
        doc, binary, _, _ = fixture()
        self.assertTrue(verify_externalization(doc, binary, deepcopy(doc), binary, {}))
        damaged=bytearray(binary);damaged[3]^=1
        with self.assertRaisesRegex(ValueError,'parity'):
            verify_externalization(doc,binary,doc,bytes(damaged),{})

    def test_exact_bytes_content_address_and_remapped_geometry(self):
        doc, binary, image, positions = fixture()
        before = deepcopy(doc)
        out, data, files = externalize_images(doc, binary)
        uri = '../materials/unit-shared/' + hashlib.sha256(image).hexdigest() + '.jpg'
        self.assertEqual(out['images'][0]['uri'], uri)
        self.assertNotIn('bufferView', out['images'][0])
        self.assertEqual(files, {uri: image})
        self.assertEqual(out['accessors'][0]['bufferView'], 0)
        self.assertEqual(out['bufferViews'], [{'buffer': 0, 'byteOffset': 0, 'byteLength': len(positions), 'target': 34962}])
        self.assertEqual(data, positions)
        for key in ['textures', 'materials', 'meshes', 'nodes', 'skins', 'animations', 'scenes', 'scene']:
            self.assertEqual(out[key], doc[key])
        self.assertEqual(doc, before)

    def test_identical_images_across_models_use_one_file(self):
        doc, binary, _, _ = fixture()
        other = deepcopy(doc)
        other['images'].append(deepcopy(other['images'][0]))
        a, _, files_a = externalize_images(doc, binary)
        b, _, files_b = externalize_images(other, binary)
        self.assertEqual(a['images'][0]['uri'], b['images'][1]['uri'])
        self.assertEqual(files_a, files_b)
        self.assertEqual(len(files_b), 1)

    def test_existing_external_uris_and_no_embedded_input_are_exact(self):
        doc, binary, _, _ = fixture()
        doc['images'] = [{'uri': '../materials/detail-v1/steel-normal.png'}]
        out, data, files = externalize_images(doc, binary)
        self.assertEqual((out, data, files), (doc, binary, {}))

    def test_reject_image_view_also_used_by_accessor(self):
        doc, binary, _, _ = fixture()
        doc['accessors'][0]['bufferView'] = 0
        with self.assertRaisesRegex(ValueError, 'image.*referenc'):
            externalize_images(doc, binary)

    def test_reject_out_of_buffer_image_view(self):
        doc, binary, _, _ = fixture()
        doc['bufferViews'][0]['byteLength'] = len(binary) + 10
        with self.assertRaisesRegex(ValueError, 'range|bounds'):
            externalize_images(doc, binary)

    def test_reject_unsupported_image_encoding(self):
        doc, binary, _, _ = fixture()
        doc['images'][0]['mimeType'] = 'image/unknown'
        with self.assertRaisesRegex(ValueError, 'MIME'):
            externalize_images(doc, binary)

    def test_png_extension_and_exact_non_image_view_bytes(self):
        doc, binary, _, positions = fixture()
        doc['images'][0]['mimeType'] = 'image/png'
        out, data, files = externalize_images(doc, binary)
        self.assertTrue(out['images'][0]['uri'].endswith('.png'))
        self.assertEqual(data, positions)
        self.assertEqual(len(files), 1)

    def test_remaps_nested_sparse_and_extension_buffer_views(self):
        doc, binary, _, _ = fixture()
        doc['accessors'][0]['sparse'] = {'indices': {'bufferView': 1}, 'values': {'bufferView': 1}}
        doc['meshes'][0]['primitives'][0]['extensions'] = {'KHR_draco_mesh_compression': {'bufferView': 1}}
        out, _, _ = externalize_images(doc, binary)
        self.assertEqual(out['accessors'][0]['sparse']['values']['bufferView'], 0)
        self.assertEqual(out['meshes'][0]['primitives'][0]['extensions']['KHR_draco_mesh_compression']['bufferView'], 0)

    def test_reject_multiple_or_external_buffers(self):
        doc, binary, _, _ = fixture()
        for buffers in [[*doc['buffers'], {'byteLength': 1}], [{'byteLength': len(binary), 'uri': 'external.bin'}]]:
            with self.subTest(buffers=buffers), self.assertRaisesRegex(ValueError, 'single.*buffer'):
                externalize_images(doc | {'buffers': buffers}, binary)

    def test_reject_overlapping_image_and_retained_views(self):
        doc, binary, _, _ = fixture()
        doc['bufferViews'][1]['byteOffset'] = 4
        with self.assertRaisesRegex(ValueError, 'overlap'):
            externalize_images(doc, binary)

    def test_metadata_not_remapped_and_unsupported_compressed_buffer_rejected(self):
        doc, binary, _, _ = fixture()
        doc['extras'] = {'bufferView': 1, 'comment': 'author metadata is not a glTF accessor'}
        out, _, _ = externalize_images(doc, binary)
        self.assertEqual(out['extras'], doc['extras'])
        doc['bufferViews'][1]['extensions'] = {'EXT_meshopt_compression': {'buffer': 0, 'byteOffset': 0}}
        with self.assertRaisesRegex(ValueError, 'Unsupported extensions'):
            externalize_images(doc, binary)

    def test_independent_parity_rejects_texture_material_and_motion_changes(self):
        doc, binary, _, _ = fixture()
        out, data, files = externalize_images(doc, binary)
        self.assertTrue(verify_externalization(doc, binary, out, data, files))
        altered = deepcopy(out)
        altered['materials'][0]['doubleSided'] = True
        with self.assertRaisesRegex(ValueError, 'semantic'):
            verify_externalization(doc, binary, altered, data, files)
        with self.assertRaisesRegex(ValueError, 'semantic|bufferView'):
            verify_externalization(doc, binary, out, bytes([data[0] ^ 1]) + data[1:], files)
        altered_images = {uri: content + b'changed' for uri, content in files.items()}
        with self.assertRaisesRegex(ValueError, 'image'):
            verify_externalization(doc, binary, out, data, altered_images)

    def test_reject_unknown_required_extension_without_used_declaration(self):
        doc, binary, _, _ = fixture()
        doc['extensionsRequired'] = ['VENDOR_unknown_binary_contract']
        with self.assertRaisesRegex(ValueError, 'Unsupported extensions'):
            externalize_images(doc, binary)


if __name__ == '__main__':
    unittest.main()
