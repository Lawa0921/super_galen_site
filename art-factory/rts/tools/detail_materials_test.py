import unittest
import numpy as np
from detail_materials import normal_map, repack_external_images


class DetailMaterialTests(unittest.TestCase):
    def test_flat_height_has_neutral_opengl_normal(self):
        result = normal_map(np.full((8, 8), .4))
        self.assertTrue(np.all(result == [128, 128, 255]))

    def test_rising_image_rows_point_normal_toward_positive_uv_y(self):
        result = normal_map(np.tile(np.arange(8)[:, None] / 8, (1, 8)))
        self.assertGreater(int(result[3, 3, 1]), 128)
        self.assertEqual(int(result[3, 3, 0]), 128)

    def test_external_images_do_not_change_vertex_or_animation_bytes(self):
        doc = {'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': 4},
                               {'buffer': 0, 'byteOffset': 4, 'byteLength': 8}],
               'images': [{'bufferView': 0, 'mimeType': 'image/png'}],
               'accessors': [{'bufferView': 1}], 'buffers': [{'byteLength': 12}]}
        result, binary = repack_external_images(doc, b'IMAGVERTANIM', {0: '/assets/test.png'})
        self.assertEqual(binary, b'VERTANIM')
        self.assertEqual(result['accessors'][0]['bufferView'], 0)
        self.assertEqual(result['images'], [{'uri': '/assets/test.png'}])
        self.assertEqual(doc['images'][0]['bufferView'], 0)  # source is immutable

    def test_rejects_removing_image_view_that_is_also_geometry(self):
        doc = {'bufferViews': [{'byteOffset': 0, 'byteLength': 4}],
               'images': [{'bufferView': 0}], 'accessors': [{'bufferView': 0}]}
        with self.assertRaises(ValueError):
            repack_external_images(doc, b'GEOM', {0: '/assets/test.png'})


if __name__ == '__main__':
    unittest.main()
