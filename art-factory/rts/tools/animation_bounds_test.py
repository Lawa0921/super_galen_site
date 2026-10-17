import copy
import unittest

from animation_bounds import update_bounds, validate_sample_times


class AnimationBoundsTests(unittest.TestCase):
    def test_rejects_missing_middle_time_even_when_coverage_flags_claim_complete(self):
        clip = {'durationSeconds': .05, 'sampleCount': 4,
                'sampleTimesSeconds': [0, 1/60, 2/60, .05],
                'allKeyTimesCovered': True, 'includesStart': True, 'includesEnd': True}
        validate_sample_times(clip)
        clip['sampleTimesSeconds'].pop(1); clip['sampleCount'] = 3
        with self.assertRaises(ValueError): validate_sample_times(clip)

    def fixture(self):
        doc = {'nodes': [{'name': 'tool', 'mesh': 0, 'skin': 0, 'extras': {'origin': 'preserved'}},
                         {'name': 'bone'}, {'name': 'body', 'mesh': 1, 'skin': 0}],
               'animations': [{'name': 'Idle'}], 'meshes': [{'primitives': []}, {'primitives': []}]}
        rows = [{'nodeIndex': i, 'nodeName': doc['nodes'][i]['name'],
                 'sampledAabbSphere': {'sphere_center_y_up_m': [0, 1, 0], 'sphere_radius_m': 1}}
                for i in (0, 2)]
        return doc, rows

    def test_adds_only_bounds_without_mutating_input(self):
        doc, rows = self.fixture(); before = copy.deepcopy(doc)
        result = update_bounds(doc, rows, .05)
        self.assertEqual(doc, before)
        self.assertEqual(result['nodes'][0]['extras']['origin'], 'preserved')
        self.assertAlmostEqual(result['nodes'][0]['extras']['rtsConservativeBounds']['sphere_radius_m'], 1.05)
        for i in (0, 2):
            result['nodes'][i]['extras'].pop('rtsConservativeBounds')
            if not result['nodes'][i]['extras']:
                result['nodes'][i].pop('extras')
        self.assertEqual(result, before)

    def test_old_envelope_remains_contained_when_expanding(self):
        doc, rows = self.fixture()
        doc['nodes'][0]['extras']['rtsConservativeBounds'] = {'sphere_center_y_up_m': [5, 1, 0], 'sphere_radius_m': 2, 'previous': True}
        sphere = update_bounds(doc, rows, .05)['nodes'][0]['extras']['rtsConservativeBounds']
        x, y, z = sphere['sphere_center_y_up_m']; radius = sphere['sphere_radius_m']
        self.assertGreaterEqual(radius + 1e-10, abs(x - 5) + 2)
        self.assertGreaterEqual(radius + 1e-10, abs(x) + 1.05)
        self.assertTrue(sphere['previous'])

    def test_never_shrinks_existing_envelope(self):
        doc, rows = self.fixture()
        doc['nodes'][0]['extras']['rtsConservativeBounds'] = {'sphere_center_y_up_m': [0, 1, 0], 'sphere_radius_m': 5}
        sphere = update_bounds(doc, rows, .05)['nodes'][0]['extras']['rtsConservativeBounds']
        self.assertEqual(sphere['sphere_radius_m'], 5)
        self.assertEqual(sphere['sphere_center_y_up_m'], [0, 1, 0])

    def test_rejects_missing_duplicate_or_wrong_node_samples(self):
        for change in ('missing', 'duplicate', 'wrong_name', 'nan'):
            with self.subTest(change=change):
                doc, rows = self.fixture()
                if change == 'missing': rows.pop()
                if change == 'duplicate': rows.append(copy.deepcopy(rows[0]))
                if change == 'wrong_name': rows[0]['nodeName'] = 'another_asset'
                if change == 'nan': rows[0]['sampledAabbSphere']['sphere_radius_m'] = float('nan')
                with self.assertRaises(ValueError): update_bounds(doc, rows, .05)


if __name__ == '__main__':
    unittest.main()
