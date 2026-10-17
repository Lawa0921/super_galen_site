from copy import deepcopy
import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from procedural_gauntlet_publish import write_glb
from work_cast_publish import prepare, publish, RUN, CLIPS

def sha(data): return hashlib.sha256(data).hexdigest()

class WorkCastPublishTest(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name); self.run = self.root / RUN
        self.review = {'status': 'approved-for-local-runtime', 'reviewer': 'root', 'user_overall_art_acceptance': 'pending', 'assets': [], 'evidence': []}
        registry = {'assets': [{'id': 'unrelated', 'status': 'published', 'note': 'keep me'}]}
        manifest = {'assets': {'unrelated': {'note': 'keep me'}}}
        for unit, names in CLIPS.items():
            source = f'{RUN}/raw/{unit}-work-cast.blend'; self.put(source, b'editable source')
            manifest['assets'][unit] = {'url': f'/assets/games/rts/models/{unit}.glb', 'lod1': f'/assets/games/rts/models/{unit}-lod1.glb', 'status': 'published', 'yaw': 1}
            for lod in (0, 1):
                asset_id = unit + ('-lod1' if lod else '')
                candidate = f'{RUN}/candidate/{unit}-lod{lod}.glb'; self.put(candidate, b'')
                write_glb(self.root / candidate, {'animations': [{'name': n} for n in ['Idle', 'Walk', 'Attack', 'Hurt', 'Death', *names]]}, b'')
                old = f'old-{asset_id}'.encode(); url = f'/assets/games/rts/models/{asset_id}.glb'; self.put('public'+url, old)
                registry['assets'].append({'id': asset_id, 'status': 'published', 'url': url, 'sha256': sha(old), 'source_provenance': {'geometry': 'original'}})
                self.review['assets'].append({'unit': unit, 'lod': lod, 'candidate': candidate, 'sha256': sha((self.root/candidate).read_bytes()), 'source': source, 'source_sha256': sha(b'editable source'), 'previous_sha256': sha(old)})
        self.put(f'{RUN}/qa/evidence.txt', b'preserved QA')
        self.review['evidence'] = [{'path': f'{RUN}/qa/evidence.txt', 'sha256': sha(b'preserved QA')}]
        self.json(f'{RUN}/source-lock.json', {'scope': 'immutable input snapshot'})
        self.review['evidence'].append({'path': f'{RUN}/source-lock.json', 'sha256': sha((self.run/'source-lock.json').read_bytes())})
        self.json('art-factory/rts/manifests/unit-registry.json', registry)
        self.json('public/assets/games/rts/model-registry.json', manifest)
        self.json('art-factory/rts/contracts/work-cast.json', {'status': 'candidate', 'runtime_publish_allowed': False, 'user_overall_art_acceptance': 'pending', 'run': RUN, 'source_lock': RUN+'/source-lock.json', 'clips': CLIPS})
        self.write_review()

    def put(self, relative, data):
        path = self.root/relative; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(data)
    def json(self, relative, value): self.put(relative, (json.dumps(value)+'\n').encode())
    def write_review(self): self.json(f'{RUN}/qa/root-review.json', self.review)
    def snapshot(self): return {str(p.relative_to(self.root)): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}

    def test_prepare_is_read_only_and_publish_updates_only_reviewed_assets_with_history(self):
        before = self.snapshot(); checked = prepare(self.root); self.assertEqual(self.snapshot(), before)
        publish(self.root, checked)
        registry = json.loads((self.root/'art-factory/rts/manifests/unit-registry.json').read_text())
        self.assertEqual(registry['assets'][0], {'id': 'unrelated', 'status': 'published', 'note': 'keep me'})
        for row in registry['assets'][1:]:
            self.assertEqual(sha((self.root/('public'+row['url'])).read_bytes()), row['sha256'])
            self.assertEqual(row['source_provenance'], {'geometry': 'original'})
            self.assertIn('work_cast_previous', row)
            self.assertEqual(row['source_sha256'], sha(b'editable source'))
        self.assertTrue((self.run/'raw/runtime-before-publish/public/assets/games/rts/model-registry.json').is_file())
        with self.assertRaises(ValueError): prepare(self.root)

    def test_stale_last_candidate_source_evidence_or_runtime_rejects_before_any_write(self):
        for relative in [self.review['assets'][-1]['candidate'], self.review['assets'][-1]['source'], self.review['evidence'][0]['path'], 'public/assets/games/rts/models/commander-lod1.glb']:
            with self.subTest(path=relative):
                original = (self.root/relative).read_bytes(); self.put(relative, original+b'changed'); before = self.snapshot()
                with self.assertRaises(ValueError): prepare(self.root)
                self.assertEqual(self.snapshot(), before); self.put(relative, original)

    def test_unapproved_missing_duplicate_or_escaping_review_rejects(self):
        original = deepcopy(self.review)
        for variant in ['candidate', 'missing', 'duplicate', 'escape']:
            self.review = deepcopy(original)
            if variant == 'candidate': self.review['status'] = 'candidate'
            if variant == 'missing': self.review['assets'].pop()
            if variant == 'duplicate': self.review['assets'][-1] = self.review['assets'][0]
            if variant == 'escape': self.review['evidence'][0]['path'] = '../outside.txt'
            self.write_review(); before = self.snapshot()
            with self.subTest(variant=variant), self.assertRaises(ValueError): prepare(self.root)
            self.assertEqual(self.snapshot(), before)

    def test_mutation_between_prepare_and_publish_is_rechecked(self):
        checked = prepare(self.root); self.put(self.review['assets'][-1]['candidate'], b'changed after prepare'); before = self.snapshot()
        with self.assertRaises(ValueError): publish(self.root, checked)
        self.assertEqual(self.snapshot(), before)

    def test_replace_failure_restores_all_runtime_targets_and_keeps_backup(self):
        checked = prepare(self.root); before = {p: (self.root/p).read_bytes() for p in checked}
        replace = Path.replace; calls = 0
        def interrupted(source, target):
            nonlocal calls
            calls += 1
            if calls == 4: raise OSError('simulated disk failure')
            return replace(source, target)
        with patch.object(Path, 'replace', interrupted), self.assertRaises(OSError): publish(self.root, checked)
        self.assertEqual({p: (self.root/p).read_bytes() for p in checked}, before)
        self.assertFalse(list(self.root.rglob('*.work-cast-next')))
        self.assertTrue((self.run/'raw/runtime-before-publish').is_dir())

    def test_partial_stage_write_cleans_temporary_files_and_keeps_runtime_unchanged(self):
        checked = prepare(self.root); before = {p: (self.root/p).read_bytes() for p in checked}
        write = Path.write_bytes; calls = 0
        def interrupted(path, data):
            nonlocal calls
            if path.name.endswith('.work-cast-next'):
                calls += 1
                if calls == 2:
                    write(path, data[:8]); raise OSError('partial stage write')
            return write(path, data)
        with patch.object(Path, 'write_bytes', interrupted), self.assertRaises(OSError): publish(self.root, checked)
        self.assertEqual({p: (self.root/p).read_bytes() for p in checked}, before)
        self.assertFalse(list(self.root.rglob('*.work-cast-next')))

    def test_source_lock_must_be_hash_bound_and_contract_must_match_package(self):
        self.review['evidence'].pop(); self.write_review()
        with self.assertRaises(ValueError): prepare(self.root)
        self.review['evidence'].append({'path': RUN+'/source-lock.json', 'sha256': sha((self.run/'source-lock.json').read_bytes())}); self.write_review()
        contract = json.loads((self.root/'art-factory/rts/contracts/work-cast.json').read_text()); contract['run'] = 'different-run'; self.json('art-factory/rts/contracts/work-cast.json', contract)
        with self.assertRaises(ValueError): prepare(self.root)

    def test_missing_or_changed_source_lock_rejects(self):
        path = self.run/'source-lock.json'; original = path.read_bytes()
        path.write_bytes(original+b'changed')
        with self.assertRaises(ValueError): prepare(self.root)
        path.unlink()
        with self.assertRaises(ValueError): prepare(self.root)

if __name__ == '__main__': unittest.main()
