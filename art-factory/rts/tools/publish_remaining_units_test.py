"""Targeted fail-closed tests for publish_remaining_units.py."""
import hashlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import publish_remaining_units as publisher

CLIPS = ['Idle', 'Walk', 'Attack', 'Hurt', 'Death']


def sha(data):
    return hashlib.sha256(data).hexdigest()


class PublisherTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.factory = self.root / 'art-factory/rts'
        self.runtime = self.root / 'public/assets/games/rts'
        self.run = self.factory / 'runs/human-units/2026-10-05-v1/worker'
        self.candidate = self.run / 'candidate'
        self.qa = self.run / 'qa'
        self.candidate.mkdir(parents=True)
        self.qa.mkdir(parents=True)
        self.source = b'original editable blender source'
        (self.candidate / 'worker-production-v1.blend').write_bytes(self.source)
        self.glbs = {lod: f'candidate glb lod {lod}'.encode() for lod in (0, 1)}
        for lod, data in self.glbs.items():
            (self.candidate / f'worker-production-v1-lod{lod}.glb').write_bytes(data)
        source_rel = (self.candidate / 'worker-production-v1.blend').relative_to(self.root).as_posix()
        verify = {
            'unit': 'worker',
            'source': {'path': source_rel, 'sha256': sha(self.source)},
            'source_raw_sha_matches': True,
            'weights_pass': True,
            'ground_pass': True,
            'triangle_pass': True,
            'passed_static': True,
            'glbs': {
                f'lod{lod}': {
                    'passed': True,
                    'sha256': sha(data),
                    'clips': CLIPS,
                    'joints_per_skin': [21],
                    'canonical_bones_present': True,
                    'weights': {'invalid_joint_indices': 0, 'invalid_weight_values': 0,
                                'unweighted_vertices': 0, 'max_weight_sum_error': 0.0},
                    'pbr': {'pbr_material_count': 2, 'failures': []},
                    'materials': ['workerBodyPBR', 'TeamCloth_worker'],
                } for lod, data in self.glbs.items()
            },
        }
        self.save('production-verify.json', verify)
        details = [
            {'visible': [True, False], 'teams': ['28577d']},
            {'visible': [True, False], 'teams': ['87382d']},
            {'visible': [False, True], 'teams': ['28577d']},
            {'visible': [False, True], 'teams': ['87382d']},
        ]
        self.save('three.json', {
            'status': 'pass', 'renderer': 'Three.js ModelInstance in Chromium WebGL',
            'errors': [], 'clips': CLIPS, 'lowClips': CLIPS,
            'changed': {'walk': True, 'attack': True, 'hurt': True, 'death': True},
            'details': details,
            'sourceAssets': [{'lod': lod, 'sha256': sha(self.glbs[lod])} for lod in (0, 1)],
        })
        self.save('khronos.json', {
            'errors': 0,
            'assets': [
                {'sha256': sha(self.glbs[lod]), 'issues': {'numErrors': 0}}
                for lod in (0, 1)
            ],
        })
        self.save('root-review.json', {
            'status': 'approved-for-runtime', 'reviewer': 'root', 'unit': 'worker',
            'source_sha256': sha(self.source),
            'assets': [{'lod': lod, 'sha256': sha(self.glbs[lod])} for lod in (0, 1)],
            'reviewed_lods': [0, 1], 'reviewed_clips': CLIPS,
            'reviewed_teams': ['blue', 'red'], 'actual_webgl_review': True,
            'grip_motion_review': 'Root inspected hand grip and motion on both LODs.',
            'evidence': ['review.png'],
        })
        (self.qa / 'review.png').write_bytes(b'visual evidence')
        self.targets = self.factory / 'manifests/unit-registry.json', self.runtime / 'model-registry.json', self.factory / 'contracts/human-units.json'
        self.targets[0].parent.mkdir(parents=True, exist_ok=True)
        self.targets[1].parent.mkdir(parents=True, exist_ok=True)
        self.targets[2].parent.mkdir(parents=True, exist_ok=True)
        self.targets[0].write_text(json.dumps({'assets': [{'id': 'worker'}, {'id': 'crossbow'}]}), encoding='utf-8')
        self.targets[1].write_text(json.dumps({'assets': {'worker': {'url': 'old-worker'}, 'crossbow': {'url': 'old-crossbow'}}}), encoding='utf-8')
        self.targets[2].write_text(json.dumps({'units': {'worker': {}, 'crossbow': {}}}), encoding='utf-8')
        self.patchers = [
            patch.object(publisher, 'ROOT', self.root),
            patch.object(publisher, 'FACTORY', self.factory),
            patch.object(publisher, 'RUNTIME', self.runtime),
        ]
        for p in self.patchers:
            p.start()

    def tearDown(self):
        for p in reversed(self.patchers):
            p.stop()
        self.tmp.cleanup()

    def save(self, name, value):
        (self.qa / name).write_text(json.dumps(value), encoding='utf-8')

    def test_accepts_fully_hash_matched_independent_review(self):
        result = publisher.preflight('worker', self.run, 'worker-production-v1')
        self.assertEqual(result['source_sha256'], sha(self.source))
        self.assertEqual([row['sha256'] for row in result['assets']], [sha(self.glbs[0]), sha(self.glbs[1])])
        self.assertEqual(result['intended_ids'], ['worker', 'worker-lod1'])

    def test_rejects_unreviewed_candidate_without_root_record(self):
        (self.qa / 'root-review.json').unlink()
        with self.assertRaises(FileNotFoundError):
            publisher.preflight('worker', self.run, 'worker-production-v1')

    def test_rejects_stale_structural_glb_hash(self):
        report = json.loads((self.qa / 'production-verify.json').read_text(encoding='utf-8'))
        report['glbs']['lod1']['sha256'] = 'stale'
        self.save('production-verify.json', report)
        with self.assertRaisesRegex(ValueError, 'production-verify LOD1 SHA'):
            publisher.preflight('worker', self.run, 'worker-production-v1')

    def test_rejects_source_rebuild_after_structural_qa(self):
        (self.candidate / 'worker-production-v1.blend').write_bytes(b'rebuilt blend')
        with self.assertRaisesRegex(ValueError, 'source SHA'):
            publisher.preflight('worker', self.run, 'worker-production-v1')

    def test_rejects_stale_webgl_hash_and_missing_five_clip(self):
        report = json.loads((self.qa / 'three.json').read_text(encoding='utf-8'))
        report['sourceAssets'][0]['sha256'] = 'stale'
        self.save('three.json', report)
        with self.assertRaisesRegex(ValueError, 'WebGL LOD0 SHA'):
            publisher.preflight('worker', self.run, 'worker-production-v1')
        report['sourceAssets'][0]['sha256'] = sha(self.glbs[0])
        report['lowClips'] = CLIPS[:-1]
        self.save('three.json', report)
        with self.assertRaisesRegex(ValueError, 'five clips'):
            publisher.preflight('worker', self.run, 'worker-production-v1')

    def test_rejects_root_approval_for_different_candidate(self):
        review = json.loads((self.qa / 'root-review.json').read_text(encoding='utf-8'))
        review['assets'][1]['sha256'] = 'different'
        self.save('root-review.json', review)
        with self.assertRaisesRegex(ValueError, 'root-review LOD1 SHA'):
            publisher.preflight('worker', self.run, 'worker-production-v1')

    def test_rejects_multiple_or_unknown_units(self):
        with self.assertRaisesRegex(ValueError, 'exactly one'):
            publisher.preflight('worker,crossbow')
        with self.assertRaisesRegex(ValueError, 'exactly one'):
            publisher.preflight('siege')

    def test_dry_run_is_a_no_write_preflight(self):
        before = [target.read_bytes() for target in self.targets]
        output = io.StringIO()
        with patch.object(sys, 'argv', [
            'publish_remaining_units.py', 'worker', '--run', str(self.run),
            '--stem', 'worker-production-v1', '--dry-run',
        ]), patch('sys.stdout', output):
            publisher.main()
        result = json.loads(output.getvalue())
        self.assertEqual(result['status'], 'preflight-passed')
        self.assertEqual(result['writes'], [])
        self.assertEqual([target.read_bytes() for target in self.targets], before)
        self.assertFalse((self.runtime / 'models/worker.glb').exists())

    def test_publish_updates_only_selected_unit(self):
        checked = publisher.preflight('worker', self.run, 'worker-production-v1')
        result = publisher.publish(checked)
        self.assertEqual(result['published'], 'worker')
        registry = json.loads(self.targets[0].read_text(encoding='utf-8'))
        self.assertEqual({row['id'] for row in registry['assets']}, {'worker', 'worker-lod1', 'crossbow'})
        manifest = json.loads(self.targets[1].read_text(encoding='utf-8'))
        self.assertEqual(manifest['assets']['crossbow']['url'], 'old-crossbow')
        self.assertEqual(manifest['assets']['worker']['url'], '/assets/games/rts/models/worker.glb')
        contract = json.loads(self.targets[2].read_text(encoding='utf-8'))
        self.assertEqual(set(contract['unit_publications']), {'worker'})
        self.assertTrue((self.runtime / 'models/worker.glb').is_file())
        self.assertTrue((self.runtime / 'models/worker-lod1.glb').is_file())
        self.assertFalse((self.runtime / 'models/crossbow.glb').exists())


    def set_unit(self, unit, joints=None, neutral=False):
        production = json.loads((self.qa / 'production-verify.json').read_text(encoding='utf-8'))
        production['unit'] = unit
        if joints is not None:
            for row in production['glbs'].values():
                row['joints_per_skin'] = joints
        self.save('production-verify.json', production)
        review = json.loads((self.qa / 'root-review.json').read_text(encoding='utf-8'))
        review['unit'] = unit
        self.save('root-review.json', review)
        if neutral:
            webgl = json.loads((self.qa / 'three.json').read_text(encoding='utf-8'))
            for row in webgl['details']:
                row['teams'] = []
            self.save('three.json', webgl)

    def test_publishes_only_the_configured_unit_contract(self):
        self.set_unit('priest')
        selected = self.factory / 'contracts/human-units-masked-v2.json'
        selected.write_text(json.dumps({'runtime_units': ['priest', 'commander']}), encoding='utf-8')
        original_human_contract = self.targets[2].read_bytes()
        checked = publisher.preflight('priest', self.run, 'worker-production-v1')
        publisher.publish(checked)
        self.assertEqual(self.targets[2].read_bytes(), original_human_contract)
        contract = json.loads(selected.read_text(encoding='utf-8'))
        self.assertEqual(set(contract['unit_publications']), {'priest'})
        self.assertEqual(contract['runtime_units'], ['priest', 'commander'])

    def test_accepts_human_skin_with_a_smaller_equine_skin(self):
        self.set_unit('knight', joints=[20, 16])
        checked = publisher.preflight('knight', self.run, 'worker-production-v1')
        self.assertEqual(checked['unit'], 'knight')

    def test_accepts_neutral_models_without_team_tint(self):
        self.set_unit('neutral-raider', neutral=True)
        checked = publisher.preflight('neutral-raider', self.run, 'worker-production-v1')
        self.assertEqual(checked['unit'], 'neutral-raider')

    def test_rejects_missing_colour_lod_combinations(self):
        webgl = json.loads((self.qa / 'three.json').read_text(encoding='utf-8'))
        webgl['details'] = [webgl['details'][0]] * 2 + [webgl['details'][3]] * 2
        self.save('three.json', webgl)
        with self.assertRaisesRegex(ValueError, 'each LOD'):
            publisher.preflight('worker', self.run, 'worker-production-v1')


if __name__ == '__main__':
    unittest.main()
