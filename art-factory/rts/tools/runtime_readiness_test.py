import unittest
from runtime_readiness import quality_summary


class RuntimeReadinessTest(unittest.TestCase):
    def test_complete_files_do_not_approve_commercial_quality(self):
        result = quality_summary([], {'/model.glb': 'abc'}, None)
        self.assertTrue(result['required_model_files_present'])
        self.assertFalse(result['complete_game_art_pack'])
        self.assertFalse(result['commercial_quality_approved'])

    def test_only_reviewed_exact_assets_with_all_gates_can_pass(self):
        review = {'status': 'approved', 'asset_hashes': {'/model.glb': 'abc'},
                  'blocking_issues': [], 'gates': {name: 'passed' for name in
                      ['character_art', 'unit_actions', 'building_lifecycle', 'map_art',
                       'interface_art', 'audio', 'source_rights', 'gameplay', 'release_validation']}}
        self.assertTrue(quality_summary([], review['asset_hashes'], review)['commercial_quality_approved'])
        for change in [{'status': 'pending'}, {'blocking_issues': ['open-grip']},
                       {'gates': review['gates'] | {'character_art': 'failed'}},
                       {'gates': {'character_art': 'passed'}}, {'gates': {}},
                       {'asset_hashes': {'/model.glb': 'stale'}}]:
            with self.subTest(change=change):
                self.assertFalse(quality_summary([], {'/model.glb': 'abc'}, review | change)['commercial_quality_approved'])
        self.assertFalse(quality_summary(['worker'], review['asset_hashes'], review)['commercial_quality_approved'])


if __name__ == '__main__':
    unittest.main()
