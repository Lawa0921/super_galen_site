import json
import struct
import tempfile
import unittest
from pathlib import Path

from human_units_verify import glb_json, inspect_glb


def fake_glb(path, document):
    chunk = json.dumps(document).encode('utf-8')
    chunk += b' ' * (-len(chunk) % 4)
    path.write_bytes(struct.pack('<4sII', b'glTF', 2, 20 + len(chunk)) + struct.pack('<I4s', len(chunk), b'JSON') + chunk)


class VerifyTest(unittest.TestCase):
    def test_exact_unprefixed_clips_and_20_joints(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'unit.glb'
            fake_glb(path, {'animations':[{'name':name,'channels':[{}]} for name in ('Idle','Walk','Attack','Hurt','Death')],
                            'skins':[{'joints':list(range(20))}], 'materials':[{'name':'TeamCloth_unit'}]})
            self.assertEqual(glb_json(path)['skins'][0]['joints'][-1], 19)
            self.assertTrue(inspect_glb(path, True)['passed'])

    def test_prefixed_action_or_missing_team_material_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'unit.glb'
            fake_glb(path, {'animations':[{'name':name,'channels':[{}]} for name in ('Guard_Idle','Walk','Attack','Hurt','Death')],
                            'skins':[{'joints':list(range(20))}], 'materials':[{'name':'Armor'}]})
            report = inspect_glb(path, True)
            self.assertFalse(report['passed'])
            self.assertIn('clips_exact', report['failures'])
            self.assertIn('team_material', report['failures'])


if __name__ == '__main__':
    unittest.main()
