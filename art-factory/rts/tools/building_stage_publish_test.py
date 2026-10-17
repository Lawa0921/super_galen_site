"""Synthetic files only: never publish repository building artifacts."""
import copy
import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import building_stage_publish as publisher

RUN_REL = 'art-factory/rts/runs/building-stages/2026-10-08-v1'
CODE_PATHS = {'src/scripts/games/rts/' + name for name in (
    'models.ts', 'scene.ts', 'types.ts', 'visibility.ts', 'visibility.test.ts',
    'construction-presentation.ts', 'model-construction.test.ts',
    'construction-presentation.test.ts')}
EVIDENCE = {RUN_REL + '/qa/' + name for name in (
    'delivery.json', 'runtime-packaging.json', 'independent-asset-review.json',
    'independent-packaging-review.json', 'runtime-code/independent-code-review-v2.json')}
REGISTRY = 'art-factory/rts/manifests/building-registry.json'
CONTRACT = 'art-factory/rts/contracts/building-stages-2026-10-08.json'

def digest(data):
    return hashlib.sha256(data).hexdigest()

class BuildingStagePublishTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.run = self.root / RUN_REL
        self.assets = []
        entries = []
        for name in ('barracks', 'stable', 'workshop'):
            source = RUN_REL + f'/raw/assemblies/{name}.blend'
            candidate = RUN_REL + f'/candidate-runtime/{name}.glb'
            runtime = f'public/assets/games/rts/models/{name}.glb'
            old, new = (name + '-old').encode(), (name + '-new').encode()
            self.put(source, (name + '-source').encode())
            self.put(candidate, new)
            self.put(runtime, old)
            self.assets.append(dict(id=name, source=source, source_sha256=self.sha(source),
                candidate=candidate, sha256=digest(new), bytes=len(new), runtime=runtime,
                previous_runtime_sha256=digest(old)))
            entries.append(dict(id=name, sha256=digest(old), status='published',
                source_rights={'origin': 'original', 'license': 'project-owned'},
                recipe={'path': 'historical/' + name + '.json', 'sha256': digest(b'old recipe')},
                previous_versions=[{'sha256': digest(b'earlier version'), 'recipe': 'earlier.json'}]))
        self.put_json(REGISTRY, {'assets': entries})
        self.put_json(CONTRACT, {'status': 'candidate', 'runtime_publish_allowed': False,
            'forbidden': ['runtime/public/registry writes', 'other restriction']})
        self.put_json(RUN_REL + '/qa/runtime-packaging.json', {'assets': self.assets})
        for name in sorted(EVIDENCE - {RUN_REL + '/qa/runtime-packaging.json'}):
            self.put_json(name, {'synthetic_evidence': name})
        self.browser = 'tmp/rts/commercial-browser-final.json'
        self.put_json(self.browser, {'pass': True, 'synthetic_actual_browser': True})
        for name in sorted(CODE_PATHS):
            self.put(name, ('synthetic ' + name).encode())
        self.review = dict(decision='approved_for_local_publication', browser_report=self.browser,
            reviewed_files={a[field]: a[hashfield] for a in self.assets
                for field, hashfield in (('source', 'source_sha256'), ('candidate', 'sha256'))},
            code_paths={name: self.sha(name) for name in CODE_PATHS},
            evidence_files={name: self.sha(name) for name in EVIDENCE | {self.browser}})
        self.browser_report = {'pass': True,
            'rootCodeSHA': [{'path': name, 'sha256': self.sha(name)} for name in sorted(CODE_PATHS)],
            'glbs': [{'id': a['id'], 'path': (self.root / a['candidate']).resolve().as_posix(),
                'sha256': a['sha256']} for a in self.assets]}
        self.save_browser(self.browser_report)
        self.save_review()
        self.original = self.snapshot()

    def put(self, name, data):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def put_json(self, name, value):
        self.put(name, (json.dumps(value) + '\n').encode())

    def sha(self, name):
        return digest((self.root / name).read_bytes())

    def save_review(self):
        self.put_json(RUN_REL + '/qa/root-publication-review.json', self.review)

    def save_browser(self, report):
        self.put_json(self.browser, report)
        self.review['evidence_files'][self.browser] = self.sha(self.browser)

    def snapshot(self):
        return {name: (self.root / name).read_bytes()
            for name in [REGISTRY, CONTRACT] + [a['runtime'] for a in self.assets]}

    def publish(self):
        with patch.object(publisher, 'ROOT', self.root), patch.object(publisher, 'RUN', self.run), patch('builtins.print'):
            publisher.main()

    def assert_no_publication(self):
        self.assertEqual(self.snapshot(), self.original)
        self.assertFalse((self.run / 'qa/local-publication.json').exists())

    def rejected(self):
        self.save_review()
        with self.assertRaises((ValueError, OSError)):
            self.publish()
        self.assert_no_publication()
        self.assertFalse((self.run / 'raw/before-local-publication').exists())

    def test_complete_review_allows_local_transaction_and_backups(self):
        self.publish()
        for a in self.assets:
            self.assertEqual(self.sha(a['runtime']), a['sha256'])
        registry = json.loads((self.root / REGISTRY).read_bytes())
        self.assertTrue(all(a['runtime_publish_allowed'] for a in registry['assets']))
        old_entries = json.loads(self.original[REGISTRY])['assets']
        for entry, old_entry in zip(registry['assets'], old_entries):
            self.assertEqual(entry['source_rights'], old_entry['source_rights'])
            self.assertEqual(entry['recipe'], old_entry['recipe'])
            self.assertEqual(entry['previous_versions'][:-1], old_entry['previous_versions'])
            self.assertEqual(entry['previous_versions'][-1],
                {key: value for key, value in old_entry.items() if key != 'previous_versions'})
        contract = json.loads((self.root / CONTRACT).read_bytes())
        self.assertEqual(contract['status'], 'published_local_worktree')
        report = json.loads((self.run / 'qa/local-publication.json').read_bytes())
        self.assertFalse(report['external_deployment'])
        self.assertFalse(report['commercial_game_complete'])
        self.assertEqual(report['registry_sha256'], self.sha(REGISTRY))
        self.assertEqual(report['review_sha256'], self.sha(RUN_REL + '/qa/root-publication-review.json'))
        for name, data in self.original.items():
            self.assertEqual((self.run / 'raw/before-local-publication' / Path(name).name).read_bytes(), data)

    def test_missing_empty_or_extra_reviewed_files_rejected(self):
        for mode in ('missing', 'empty', 'extra'):
            with self.subTest(mode=mode):
                self.review['reviewed_files'] = {a[field]: a[hashfield] for a in self.assets
                    for field, hashfield in (('source', 'source_sha256'), ('candidate', 'sha256'))}
                if mode == 'missing':
                    del self.review['reviewed_files'][self.assets[0]['source']]
                elif mode == 'empty':
                    self.review['reviewed_files'] = {}
                else:
                    self.put('extra.blend', b'extra')
                    self.review['reviewed_files']['extra.blend'] = self.sha('extra.blend')
                self.rejected()

    def test_missing_empty_or_extra_code_set_rejected(self):
        for mode in ('missing', 'empty', 'extra'):
            with self.subTest(mode=mode):
                self.review['code_paths'] = {name: self.sha(name) for name in CODE_PATHS}
                if mode == 'missing':
                    del self.review['code_paths'][sorted(CODE_PATHS)[0]]
                elif mode == 'empty':
                    self.review['code_paths'] = {}
                else:
                    self.put('src/unowned.ts', b'extra')
                    self.review['code_paths']['src/unowned.ts'] = self.sha('src/unowned.ts')
                self.rejected()

    def test_reviewed_code_byte_change_rejected(self):
        self.put(sorted(CODE_PATHS)[0], b'changed after review')
        self.rejected()

    def test_each_required_evidence_cannot_be_omitted(self):
        for name in sorted(EVIDENCE | {self.browser}):
            with self.subTest(name=name):
                original = self.review['evidence_files'].pop(name)
                self.rejected()
                self.review['evidence_files'][name] = original

    def test_empty_evidence_and_unbound_browser_rejected(self):
        self.review['evidence_files'] = {}
        self.rejected()

    def test_additional_hash_bound_binary_visual_evidence_is_allowed(self):
        path = RUN_REL + '/qa/browser-qa/capture.png'
        self.put(path, b'\x89PNG\r\n\x1a\nsynthetic visual evidence')
        self.review['evidence_files'][path] = self.sha(path)
        self.save_review()
        self.publish()
        self.assertTrue((self.run / 'qa/local-publication.json').exists())

    def test_browser_byte_change_rejected(self):
        self.put_json(self.browser, {'changed': True})
        self.rejected()

    def test_browser_pass_must_be_boolean_true_even_if_rehashed(self):
        for value in (False, 'true', 1, None):
            with self.subTest(value=value):
                self.put_json(self.browser, {'pass': value})
                self.review['evidence_files'][self.browser] = self.sha(self.browser)
                self.rejected()

    def test_browser_code_rows_require_exact_set_no_duplicates_and_review_hash(self):
        for mode in ('wrong_path', 'wrong_hash', 'duplicate', 'missing', 'mapping', 'empty'):
            with self.subTest(mode=mode):
                report = copy.deepcopy(self.browser_report)
                rows = report['rootCodeSHA']
                if mode == 'wrong_path':
                    rows[0]['path'] = 'src/scripts/games/rts/unreviewed.ts'
                elif mode == 'wrong_hash':
                    rows[0]['sha256'] = digest(b'wrong code hash')
                elif mode == 'duplicate':
                    rows[-1] = copy.deepcopy(rows[0])
                elif mode == 'missing':
                    rows.pop()
                elif mode == 'mapping':
                    report['rootCodeSHA'] = copy.deepcopy(self.review['code_paths'])
                else:
                    report['rootCodeSHA'] = []
                self.save_browser(report)
                with self.assertRaises(ValueError):
                    publisher.verify_publication(self.root, self.assets, self.review)
                self.assert_no_publication()

    def test_browser_glb_rows_require_exact_ids_paths_and_package_hashes(self):
        for mode in ('wrong_id', 'wrong_hash', 'wrong_path', 'relative_path', 'duplicate', 'missing', 'empty'):
            with self.subTest(mode=mode):
                report = copy.deepcopy(self.browser_report)
                rows = report['glbs']
                if mode == 'wrong_id':
                    rows[0]['id'] = 'town-hall'
                elif mode == 'wrong_hash':
                    rows[0]['sha256'] = digest(b'wrong glb hash')
                elif mode == 'wrong_path':
                    rows[0]['path'] = rows[1]['path']
                elif mode == 'relative_path':
                    rows[0]['path'] = self.assets[0]['candidate']
                elif mode == 'duplicate':
                    rows[-1] = copy.deepcopy(rows[0])
                elif mode == 'missing':
                    rows.pop()
                else:
                    report['glbs'] = []
                self.save_browser(report)
                with self.assertRaises(ValueError):
                    publisher.verify_publication(self.root, self.assets, self.review)
                self.assert_no_publication()

    def test_invalid_evidence_json_is_rejected_before_staging(self):
        name = RUN_REL + '/qa/independent-asset-review.json'
        self.put(name, b'{not json')
        self.review['evidence_files'][name] = self.sha(name)
        self.save_review()
        with patch.object(publisher.tempfile, 'TemporaryDirectory', side_effect=AssertionError('no staging before validation')):
            with self.assertRaises(ValueError):
                self.publish()
        self.assert_no_publication()

    def test_missing_late_input_is_rejected_before_staging(self):
        (self.root / CONTRACT).unlink()
        with patch.object(publisher.tempfile, 'TemporaryDirectory', side_effect=AssertionError('no staging before validation')):
            with self.assertRaises(OSError):
                self.publish()
        self.assertFalse((self.run / 'raw/before-local-publication').exists())
        self.assertFalse((self.run / 'qa/local-publication.json').exists())
        for asset in self.assets:
            self.assertEqual((self.root / asset['runtime']).read_bytes(), self.original[asset['runtime']])

    def test_duplicate_json_review_keys_rejected_before_staging(self):
        data = json.dumps(self.review)
        data = '{"decision":"pending",' + data[1:]
        self.put(RUN_REL + '/qa/root-publication-review.json', data.encode())
        with patch.object(publisher.tempfile, 'TemporaryDirectory', side_effect=AssertionError('no staging before validation')):
            with self.assertRaises(ValueError):
                self.publish()
        self.assert_no_publication()

    def test_candidate_size_mismatch_rejected_before_staging(self):
        assets = copy.deepcopy(self.assets)
        assets[-1]['bytes'] += 1
        name = RUN_REL + '/qa/runtime-packaging.json'
        self.put_json(name, {'assets': assets})
        self.review['evidence_files'][name] = self.sha(name)
        self.rejected()

    def test_package_ids_and_source_candidate_hashes_must_match_review(self):
        for mode in ('duplicate_id', 'missing_id', 'source_sha256', 'sha256'):
            with self.subTest(mode=mode):
                assets = copy.deepcopy(self.assets)
                if mode == 'duplicate_id':
                    assets[-1] = copy.deepcopy(assets[0])
                elif mode == 'missing_id':
                    assets.pop()
                else:
                    assets[-1][mode] = digest(b'unreviewed bytes')
                name = RUN_REL + '/qa/runtime-packaging.json'
                self.put_json(name, {'assets': assets})
                self.review['evidence_files'][name] = self.sha(name)
                self.rejected()

    def test_success_report_cannot_be_overwritten(self):
        path = self.run / 'qa/local-publication.json'
        path.write_bytes(b'earlier success marker')
        with self.assertRaises(ValueError):
            self.publish()
        self.assertEqual(self.snapshot(), self.original)
        self.assertEqual(path.read_bytes(), b'earlier success marker')

    def test_staging_write_failure_does_not_touch_public_targets(self):
        real_write = Path.write_bytes
        calls = 0
        def fail_second(path, data):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError('injected staging failure')
            return real_write(path, data)
        with patch.object(Path, 'write_bytes', autospec=True, side_effect=fail_second):
            with self.assertRaisesRegex(OSError, 'injected staging failure'):
                self.publish()
        self.assert_no_publication()
        self.assertFalse((self.run / 'raw/before-local-publication').exists())
        self.assertFalse(any(self.run.glob('.publication-*')))

    def test_browser_multiple_alias_absolute_or_outside_path_rejected(self):
        for browser in ([self.browser], '', '../outside.json', './' + self.browser,
                        self.browser.replace('/', '\\'), str(self.root / self.browser)):
            with self.subTest(browser=browser):
                self.review['browser_report'] = browser
                self.rejected()

    def test_browser_must_be_the_exact_hash_bound_path(self):
        self.put_json('tmp/rts/other-browser.json', {'other': True})
        self.review['browser_report'] = 'tmp/rts/other-browser.json'
        self.rejected()

    def test_changed_source_candidate_and_runtime_rejected(self):
        for field in ('source', 'candidate', 'runtime'):
            with self.subTest(field=field):
                path = self.root / self.assets[0][field]
                old = path.read_bytes()
                path.write_bytes(b'changed')
                with self.assertRaises(ValueError):
                    self.publish()
                path.write_bytes(old)
                self.assert_no_publication()
                self.assertFalse((self.run / 'raw/before-local-publication').exists())

    def test_source_candidate_paths_must_be_exact_not_aliases(self):
        for field in ('source', 'candidate'):
            with self.subTest(field=field):
                assets = copy.deepcopy(self.assets)
                old = assets[0][field]
                alias = './' + old
                assets[0][field] = alias
                review = copy.deepcopy(self.review)
                review['reviewed_files'][alias] = review['reviewed_files'].pop(old)
                with self.assertRaises(ValueError):
                    publisher.verify_publication(self.root, assets, review)

    def test_bad_contract_parse_before_any_write(self):
        self.put(CONTRACT, b'{bad json')
        self.original = self.snapshot()
        with self.assertRaises(ValueError):
            self.publish()
        self.assert_no_publication()
        self.assertFalse((self.run / 'raw/before-local-publication').exists())

    def test_bad_contract_shape_before_any_write(self):
        self.put_json(CONTRACT, {'forbidden': None})
        self.original = self.snapshot()
        with self.assertRaises(ValueError):
            self.publish()
        self.assert_no_publication()
        self.assertFalse((self.run / 'raw/before-local-publication').exists())

    def test_late_backup_collision_before_any_write(self):
        backup = self.run / 'raw/before-local-publication'
        backup.mkdir()
        (backup / 'workshop.glb').write_bytes(b'old unrelated backup')
        with self.assertRaises(ValueError):
            self.publish()
        self.assert_no_publication()
        self.assertEqual({p.name for p in backup.iterdir()}, {'workshop.glb'})

    def test_second_or_late_replace_failure_rolls_back_every_target(self):
        for fail_at in (2, 4, 5, 6):
            with self.subTest(fail_at=fail_at):
                real_replace = os.replace
                calls = 0
                def fail_once(source, target):
                    nonlocal calls
                    calls += 1
                    if calls == fail_at:
                        raise OSError('injected replace failure')
                    return real_replace(source, target)
                with patch('os.replace', side_effect=fail_once):
                    with self.assertRaisesRegex(OSError, 'injected replace failure'):
                        self.publish()
                self.assert_no_publication()
                for name, data in self.original.items():
                    self.assertEqual((self.run / 'raw/before-local-publication' / Path(name).name).read_bytes(), data)
                self.assertFalse(any(self.run.glob('.publication-*')))

    def test_pending_review_does_not_authorize_publication(self):
        self.review['decision'] = 'pending'
        self.rejected()

if __name__ == '__main__':
    unittest.main()
