"""Material migration invariants: fail on the current fragmented v1 baseline."""
import copy,json,struct,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
SOURCE=ROOT/'art-factory/rts/runs/original-crossbow-wrist-topology/2026-10-06-v1/candidate'

def decode(path):
    data=path.read_bytes();n=struct.unpack_from('<I',data,12)[0]
    return json.loads(data[20:20+n]),data[20+n:]

class TeamSurfaceTest(unittest.TestCase):
    def baseline_original_source_rejects_fragmented_per_face_tint(self):
        for lod in (0,1):
            g,_=decode(SOURCE/f'original-crossbow-grip-lod{lod}.glb')
            body=next(n for n in g['nodes'] if n.get('name')==f'crossbowOriginalBody_LOD{lod}')
            for p in g['meshes'][body['mesh']]['primitives']:
                self.assertIn('teamTintMask',g['materials'][p['material']].get('extras',{}))

    def test_conversion_keeps_all_nonmaterial_data_and_weapons(self):
        from original_crossbow_team_surface import convert
        g,_=decode(SOURCE/'original-crossbow-grip-lod0.glb');original=copy.deepcopy(g)
        result,record=convert(g,0,'data:image/png;base64,aGVsbG8=')
        for key in set(original)-{'meshes','materials'}:self.assertEqual(original[key],result[key],key)
        body=record['body_mesh'];self.assertEqual(result['materials'][:-1],original['materials'])
        assigned={p['material'] for p in result['meshes'][body]['primitives']}
        self.assertEqual(assigned,{record['new_material']})
        material=result['materials'][record['new_material']]
        self.assertIn('TeamClothMasked',material['name'])
        self.assertEqual(material['extras']['teamTintMask'],'data:image/png;base64,aGVsbG8=')
        self.assertEqual(material['pbrMetallicRoughness']['baseColorTexture'],original['materials'][record['original_base_material']]['pbrMetallicRoughness']['baseColorTexture'])
        for i,mesh in enumerate(result['meshes']):
            if i!=body:self.assertEqual(mesh,original['meshes'][i]);continue
            for a,b in zip(mesh['primitives'],original['meshes'][i]['primitives']):
                self.assertEqual({k:v for k,v in a.items() if k!='material'},{k:v for k,v in b.items() if k!='material'})
        self.assertEqual(g,original,'Conversion must not mutate caller source')

    def test_unknown_body_is_rejected(self):
        from original_crossbow_team_surface import convert
        g,_=decode(SOURCE/'original-crossbow-grip-lod0.glb')
        with self.assertRaises(ValueError):convert(g,1,'data:image/png;base64,aGVsbG8=')

if __name__=='__main__':
    if '--baseline' in sys.argv:
        suite=unittest.TestSuite([TeamSurfaceTest('baseline_original_source_rejects_fragmented_per_face_tint')]);result=unittest.TextTestRunner().run(suite);sys.exit(not result.wasSuccessful())
    # The source intentionally remains unchanged. Keep its red baseline as a
    # separately invoked witness; conversion regressions run on new outputs.
    suite=unittest.TestSuite([TeamSurfaceTest(name) for name in ('test_conversion_keeps_all_nonmaterial_data_and_weapons','test_unknown_body_is_rejected')]);result=unittest.TextTestRunner().run(suite);sys.exit(not result.wasSuccessful())
