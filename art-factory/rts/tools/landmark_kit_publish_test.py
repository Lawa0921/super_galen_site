import hashlib
import tempfile
import unittest
from pathlib import Path
from landmark_kit_publish import verify_reviewed_inputs

class ReviewedPublicationTests(unittest.TestCase):
    def fixture(self,root):
        fields={'source':('source.blend','source_sha256'),'candidate':('high.glb','sha256'),'lod1_candidate':('low.glb','lod1_sha256'),'terms_record':('terms.json','terms_record_sha256')}
        asset={'id':'test-prefab'};review={'reviewed_files':{}}
        for field,(name,hash_field) in fields.items():
            data=('reviewed '+name).encode();(root/name).write_bytes(data);digest=hashlib.sha256(data).hexdigest()
            asset[field]=name;asset[hash_field]=digest;review['reviewed_files'][name]=digest
        return review,asset
    def test_accepts_exact_reviewed_source_both_lods_and_terms(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);review,asset=self.fixture(root)
            verify_reviewed_inputs(root,review,[asset])
    def test_rejects_joint_candidate_and_registry_drift_before_first_copy(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);review,asset=self.fixture(root)
            (root/asset['candidate']).write_bytes(b'unreviewed replacement')
            asset['sha256']=hashlib.sha256(b'unreviewed replacement').hexdigest()
            with self.assertRaisesRegex(ValueError,'Independent review'):
                verify_reviewed_inputs(root,review,[asset])
    def test_rejects_unreviewed_terms_even_if_registry_matches(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);review,asset=self.fixture(root)
            del review['reviewed_files'][asset['terms_record']]
            with self.assertRaisesRegex(ValueError,'Independent review'):
                verify_reviewed_inputs(root,review,[asset])

if __name__=='__main__':unittest.main()
