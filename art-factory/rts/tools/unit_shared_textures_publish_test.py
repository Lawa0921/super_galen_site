"""Publication guards for the fixed lossless packaging cohort."""
from pathlib import Path
import copy
import unittest
from unit_shared_textures_publish import validate_selection


class SelectionTest(unittest.TestCase):
    def setUp(self):
        self.ids = [name + suffix for name in ['neutral-raider', 'priest', 'commander', 'knight', 'siege', 'worker', 'guard'] for suffix in ['', '-lod1']]
        self.report = {'mode': 'default-and-controlled-diagnostic', 'results': [
            {'browser': browser, 'id': unit, 'errors': [], 'views': [
                {'clip': clip, 'dt': dt, 'portrait': portrait, 'changedChannels': 0,
                 'errors': [], 'contextLost': False, 'drawCalls': 1}
                for clip, dt, portrait in [('idle', .15, False), ('walk', .45, False), ('attack', .37, False),
                                            ('hurt', .2, False), ('death', .75, False), ('idle', .15, True), ('idle', .45, True)] ]}
            for browser in ['chromium', 'firefox', 'webkit']
            for unit in ['neutral-raider', 'priest', 'commander', 'knight', 'siege', 'worker', 'guard']]}

    def test_accepts_exact_fixed_cohort(self):
        self.assertEqual(set(validate_selection(self.ids, self.report)), set(self.ids))

    def test_blocks_crossbow_and_incomplete_cohort(self):
        for ids in [self.ids + ['crossbow', 'crossbow-lod1'], self.ids[:-1], self.ids + [self.ids[0]]]:
            with self.subTest(ids=ids), self.assertRaises(ValueError):
                validate_selection(ids, self.report)

    def test_default_difference_is_rejected_even_when_controlled_is_exact(self):
        self.report['results'][0]['views'][0].update(changedChannels=3, controlled={'changedChannels': 0})
        with self.assertRaisesRegex(ValueError, 'default pixels'):
            validate_selection(self.ids, self.report)

    def test_missing_browser_or_duplicate_view_is_rejected(self):
        for mode in ['browser', 'view', 'resource']:
            report = copy.deepcopy(self.report)
            if mode == 'browser':
                report['results'].pop()
            elif mode == 'view':
                report['results'][0]['views'][-1] = report['results'][0]['views'][0]
            else:
                report['results'][0]['views'][0]['errors'] = ['missing texture']
            with self.subTest(mode=mode), self.assertRaises(ValueError):
                validate_selection(self.ids, report)


if __name__ == '__main__':
    unittest.main()
