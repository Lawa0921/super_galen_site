"""Prevent partial or stale model captures from becoming final evidence."""
import unittest
from all_models_merge import merge_captures


class CaptureMergeTest(unittest.TestCase):
    def setUp(self):
        self.assets = {'worker': {'url': '/models/worker.glb', 'lod1': '/models/worker-lod1.glb'},
                       'rock': {'url': '/models/rock.glb'}}
        self.hashes = {'/models/worker.glb': 'a', '/models/worker-lod1.glb': 'b', '/models/rock.glb': 'c'}
        self.unit = {'errors': [], 'rows': [{'id': 'worker', 'shots': ['worker.png']}],
                     'servedAssets': [{'url': 'http://localhost' + url + '?candidate=1', 'status': 200, 'sha256': sha}
                                      for url, sha in list(self.hashes.items())[:2]]}
        self.static = {'errors': [], 'rows': [{'id': 'rock', 'shots': ['rock.png']}],
                       'servedAssets': [{'url': 'http://localhost/models/rock.glb', 'status': 200, 'sha256': 'c'}]}

    def test_combines_complete_matching_captures(self):
        result = merge_captures(self.assets, self.hashes, [self.unit, self.static])
        self.assertEqual([r['id'] for r in result['rows']], ['worker', 'rock'])
        self.assertEqual(len(result['servedAssets']), 3)

    def test_rejects_stale_capture_after_model_rebuilt(self):
        self.hashes['/models/worker-lod1.glb'] = 'new'
        with self.assertRaisesRegex(AssertionError, 'Stale'):
            merge_captures(self.assets, self.hashes, [self.unit, self.static])

    def test_rejects_missing_model_even_when_extra_assets_preloaded(self):
        self.unit['servedAssets'] += self.static['servedAssets']
        with self.assertRaisesRegex(AssertionError, 'coverage'):
            merge_captures(self.assets, self.hashes, [self.unit])

    def test_rejects_duplicate_model_and_browser_error(self):
        with self.assertRaisesRegex(AssertionError, 'Duplicate'):
            merge_captures(self.assets, self.hashes, [self.unit, self.unit, self.static])
        self.static['errors'].append('WebGL context lost')
        with self.assertRaisesRegex(AssertionError, 'Browser'):
            merge_captures(self.assets, self.hashes, [self.unit, self.static])


if __name__ == '__main__':
    unittest.main()
