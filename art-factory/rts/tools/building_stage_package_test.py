"""Runtime URI packaging may change paths, never geometry or resource bytes."""
import json
import struct
import subprocess
import sys
import unittest
from building_stage_package import rewrite_image_uris, equivalent_texture_uri


def glb(document, tail=b'unchanged-binary'):
    body=json.dumps(document).encode();body+=b' '*((-len(body))%4)
    return struct.pack('<4sII',b'glTF',2,20+len(body)+len(tail))+struct.pack('<II',len(body),0x4e4f534a)+body+tail


class BuildingStagePackageTest(unittest.TestCase):
    def test_optimized_python_still_rejects_unapproved_review(self):
        script = '''
import json, tempfile
from pathlib import Path
import building_stage_package as package
with tempfile.TemporaryDirectory() as folder:
    package.ROOT = Path(folder)
    package.RUN = Path(folder)/'run'
    (package.RUN/'qa').mkdir(parents=True)
    (package.RUN/'qa/delivery.json').write_text(json.dumps({'assets': [], 'shared_original_textures': []}))
    (package.RUN/'qa/independent-asset-review.json').write_text(json.dumps({'decision': 'rejected'}))
    package.main()
'''
        result = subprocess.run([sys.executable, '-B', '-O', '-c', script], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn('ValueError: Candidate review does not approve integration', result.stderr)

    def test_uri_only_rewrite_preserves_metadata_and_binary_tail(self):
        doc={'asset':{'version':'2.0'},'images':[{'uri':'textures/oak.png'}],
             'nodes':[{'extras':{'rtsConstructionStage':2,'rtsPartIds':['roof']}}]}
        source=glb(doc)
        result=rewrite_image_uris(source,{'textures/oak.png':'../materials/oak.png'})
        length=struct.unpack_from('<I',result,12)[0]
        rewritten=json.loads(result[20:20+length])
        self.assertEqual(result[20+length:],b'unchanged-binary')
        self.assertEqual(rewritten['nodes'],doc['nodes'])
        self.assertEqual(rewritten['images'],[{'uri':'../materials/oak.png'}])
        self.assertEqual(struct.unpack_from('<I',result,8)[0],len(result))

    def test_missing_uri_mapping_fails_instead_of_publishing_broken_texture(self):
        with self.assertRaises(ValueError):rewrite_image_uris(glb({'images':[{'uri':'textures/missing.png'}]}),{})

    def test_same_filename_with_changed_texture_bytes_is_rejected(self):
        self.assertEqual(equivalent_texture_uri('textures/oak.png',b'original',{'../materials/oak.png':b'original'}),'../materials/oak.png')
        with self.assertRaises(ValueError):equivalent_texture_uri('textures/oak.png',b'changed',{'../materials/oak.png':b'original'})


if __name__=='__main__':unittest.main()
