"""Source checks must reject changed evidence, without claiming source rights."""
import hashlib
from pathlib import Path
import tempfile
import unittest

from asset_source_integrity import verify_asset_sources


class SourceIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'source.blend').write_bytes(b'original source')
        self.digest = hashlib.sha256(b'original source').hexdigest()

    def test_matching_source_is_verified_but_has_no_rights_approval(self):
        result = verify_asset_sources(self.root, {'id': 'unit', 'source': 'source.blend',
                                                'source_sha256': self.digest})
        self.assertEqual(result['verified_fields'], ['source'])
        self.assertEqual(result['unbound_fields'], [])
        self.assertNotIn('source_rights', result)

    def test_mutated_source_fails_even_when_runtime_is_unchanged(self):
        (self.root / 'source.blend').write_bytes(b'mutated')
        with self.assertRaisesRegex(ValueError, 'unit.*source.*SHA256'):
            verify_asset_sources(self.root, {'id': 'unit', 'source': 'source.blend',
                                            'source_sha256': self.digest})

    def test_existing_unhashed_evidence_is_reported_not_approved(self):
        result = verify_asset_sources(self.root, {'id': 'unit', 'qa': 'source.blend'})
        self.assertEqual(result['verified_fields'], [])
        self.assertEqual(result['unbound_fields'], ['qa'])

    def test_declared_missing_source_is_rejected_even_without_directory_separator(self):
        with self.assertRaisesRegex(ValueError, 'missing'):
            verify_asset_sources(self.root, {'id': 'unit', 'source': 'missing.blend'})

    def test_builtin_provider_is_not_a_path_and_unbound_raw_hash_is_reported(self):
        result = verify_asset_sources(self.root, {'id': 'tile', 'source': 'builtin-imagegen',
                                                'raw_sha256': self.digest})
        self.assertEqual(result['unresolved_hash_fields'], ['raw_sha256'])
        self.assertEqual(result['verified_fields'], [])

    def test_original_render_provider_checks_editable_source(self):
        result = verify_asset_sources(self.root, {'id': 'icon', 'source': 'original_3d_render',
            'editable_source': 'source.blend', 'editable_source_sha256': self.digest})
        self.assertEqual(result['verified_fields'], ['editable_source'])

    def test_external_original_source_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'original_source.*outside project root'):
            verify_asset_sources(self.root, {'id': 'tile', 'source': 'builtin-imagegen',
                                             'original_source': str(self.root.parent/'external.png')})

    def test_unhashed_original_source_is_incomplete(self):
        result = verify_asset_sources(self.root, {'id': 'tile', 'source': 'builtin-imagegen',
                                                'original_source': 'source.blend'})
        self.assertEqual(result['unbound_fields'], ['original_source'])

    def test_candidate_must_match_published_bytes(self):
        with self.assertRaisesRegex(ValueError, 'candidate.*published'):
            verify_asset_sources(self.root, {'id': 'unit', 'candidate': 'source.blend',
                                            'sha256': '0' * 64})

    def test_path_escape_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'outside project root'):
            verify_asset_sources(self.root, {'id': 'unit', 'source': '../outside.blend'})

    def test_prompt_and_provenance_hashes_are_checked(self):
        result = verify_asset_sources(self.root, {'id': 'unit', 'prompt': 'source.blend',
            'prompt_sha256': self.digest, 'provenance': 'source.blend', 'provenance_sha256': self.digest})
        self.assertEqual(result['verified_fields'], ['prompt', 'provenance'])


if __name__ == '__main__':
    unittest.main()
