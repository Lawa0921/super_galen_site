import base64
import io
import unittest

from PIL import Image

from human_units_team_mask_verify import inspect_mask_metadata


class TeamMaskMetadataTest(unittest.TestCase):
    def test_embedded_grayscale_1024_png_and_white_pbr(self):
        stream = io.BytesIO()
        Image.new('L', (1024, 1024), 128).save(stream, 'PNG')
        encoded = 'data:image/png;base64,' + base64.b64encode(stream.getvalue()).decode('ascii')
        material = {'name':'TeamClothMasked_priest','extras':{'teamTintMask':encoded},
                    'pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1]}}
        self.assertEqual(inspect_mask_metadata(material,'priest')['failures'],[])

    def test_missing_or_external_metadata_rejected(self):
        material = {'name':'TeamClothMasked_priest','extras':{'teamTintMask':'https://example.test/mask.png'},
                    'pbrMetallicRoughness':{'baseColorFactor':[.5,1,1,1]}}
        self.assertIn('embedded_png_data_uri',inspect_mask_metadata(material,'priest')['failures'])
        self.assertIn('white_base_factor',inspect_mask_metadata(material,'priest')['failures'])


if __name__ == '__main__':
    unittest.main()
