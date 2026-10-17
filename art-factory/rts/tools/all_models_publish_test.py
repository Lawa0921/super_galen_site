"""The whole batch must have current, independent acceptance before publication."""
import unittest
import hashlib
import tempfile
import copy
import all_models_publish as publication
from pathlib import Path
from all_models_publish import verified_files, verify_inventory, verify_identities


class PublishEvidenceTest(unittest.TestCase):
    def setUp(self):
        self.current = {'/models/worker.glb': 'a', '/models/worker-lod1.glb': 'b'}
        self.review = {'decision': 'approve', 'assets': [{'id': 'worker', 'decision': 'approve',
            'files': [{'url': url, 'sha256': sha} for url, sha in self.current.items()]}]}

    def test_accepts_exact_complete_approved_set(self):
        self.assertEqual(verified_files(self.current, self.review), self.current)

    def test_rejects_pending_model_even_if_hashes_match(self):
        self.review['assets'][0]['decision'] = 'pending'
        with self.assertRaisesRegex(AssertionError, 'Unapproved'):
            verified_files(self.current, self.review)

    def test_rejects_new_geometry_under_old_approval(self):
        self.current['/models/worker-lod1.glb'] = 'new'
        with self.assertRaisesRegex(AssertionError, 'Stale'):
            verified_files(self.current, self.review)

    def test_rejects_missing_lod_and_duplicate_approval(self):
        self.review['assets'][0]['files'].pop()
        with self.assertRaisesRegex(AssertionError, 'coverage'):
            verified_files(self.current, self.review)
        self.review['assets'][0]['files'] *= 2
        with self.assertRaisesRegex(AssertionError, 'Duplicate'):
            verified_files(self.current, self.review)


class PublishPerformanceTest(unittest.TestCase):
    def test_accepts_only_completed_production_evidence_and_rejects_stale_inputs(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); source=root/'fixture.js'; source.write_text('source',encoding='utf-8')
            binding={'path':'fixture.js','sha256':hashlib.sha256(source.read_bytes()).hexdigest()}
            report={'formalAcceptance':True,'verificationCompleted':True,'performanceThresholdPassed':True,
                'errors':[],'contextLost':False,'medianFps':60,'p95Ms':25,
                'units':80,'buildings':20,'visibleUnits':80,'visibleBuildings':20,'screenUnits':80,'screenBuildings':20,
                'status':'playing','portraitKind':'knight','draws':{'portrait':13},'viewport':[1920,1080],'dpr':1,
                'launchArgs':['--mute-audio','--enable-gpu','--force_high_performance_gpu'],
                'mainThread':{'valid':True,'elapsedMs':60000,'heartbeatCount':1000,'maxHeartbeatLatenessMs':30,'maxLongTaskMs':40},
                'releasedAssets':[{'url':'/worker.glb','sha256':'model'}],'browserAssets':[{'url':'/worker.glb','sha256':'model'}],
                'productionHarness':{'mode':'production-bundled-fixture','fixtureBundle':binding,'sourceFixture':binding,'builtIndex':binding,'wrapper':binding,'runner':binding,'bundleHelper':binding,'pageSource':binding,'styleSource':binding,'runtimeSources':[binding]}}
            self.assertIsNone(publication.verify_performance({'/worker.glb':'model'},report,root))
            for key,value in [('verificationCompleted',False),('medianFps',54),('p95Ms',33),('screenUnits',79),('productionHarness',None)]:
                broken=copy.deepcopy(report);broken[key]=value
                with self.assertRaises(AssertionError):publication.verify_performance({'/worker.glb':'model'},broken,root)
            for flag in ['--enable-gpu','--force_high_performance_gpu']:
                broken=copy.deepcopy(report);broken['launchArgs'].remove(flag)
                with self.assertRaisesRegex(AssertionError,'Dedicated GPU'):
                    publication.verify_performance({'/worker.glb':'model'},broken,root)
            for key in ['runner','bundleHelper','pageSource','styleSource']:
                broken=copy.deepcopy(report);broken['productionHarness'][key]={'path':'fixture.js','sha256':'stale'}
                with self.assertRaisesRegex(AssertionError,'Stale production'):
                    publication.verify_performance({'/worker.glb':'model'},broken,root)
            source.write_text('changed',encoding='utf-8')
            with self.assertRaisesRegex(AssertionError,'Stale production'):
                publication.verify_performance({'/worker.glb':'model'},report,root)


class PublishCoverageTest(unittest.TestCase):
    def setUp(self):
        self.manifest = {'worker': {'url': '/worker.glb', 'lod1': '/worker-lod1.glb'},
                         'rock': {'url': '/rock.glb'}}
        self.ledger = {'status': 'approved-for-local-publication', 'models': 2, 'files': 3,
                       'assets': [{'id': ident, 'status': 'approved-model-pending-batch'}
                                  for ident in self.manifest]}

    def test_accepts_complete_approved_coverage(self):
        publication.verify_coverage(self.manifest, self.ledger)

    def test_rejects_pending_batch_and_pending_model(self):
        for field in ('batch', 'model'):
            ledger = copy.deepcopy(self.ledger)
            if field == 'batch':
                ledger['status'] = 'in-progress-not-for-publication'
            else:
                ledger['assets'][0]['status'] = 'repairing'
            with self.assertRaisesRegex(AssertionError, 'Unapproved coverage'):
                publication.verify_coverage(self.manifest, ledger)

    def test_rejects_missing_swapped_or_duplicate_model(self):
        for ids in (['worker'], ['worker', 'wrong'], ['worker', 'worker', 'rock']):
            ledger = copy.deepcopy(self.ledger)
            ledger['assets'] = [{'id': ident, 'status': 'approved-model-pending-batch'} for ident in ids]
            with self.assertRaisesRegex(AssertionError, 'Coverage inventory'):
                publication.verify_coverage(self.manifest, ledger)

    def test_rejects_incorrect_model_or_file_count(self):
        for field in ('models', 'files'):
            ledger = copy.deepcopy(self.ledger)
            ledger[field] += 1
            with self.assertRaisesRegex(AssertionError, 'Coverage count'):
                publication.verify_coverage(self.manifest, ledger)


class PublishIdentityTest(unittest.TestCase):
    def test_rejects_same_size_inventory_with_wrong_model(self):
        canonical = {'worker': {'url': '/models/worker.glb'}}
        manifest = {'wrong-worker': {'url': '/models/worker.glb'}}
        lock = [{'id': 'wrong-worker', 'lod': 0, 'url': '/models/worker.glb'}]
        with self.assertRaisesRegex(AssertionError, 'inventory'):
            verify_inventory(manifest, lock, canonical)

    def test_accepts_canonical_inventory_and_rejects_swapped_lod(self):
        canonical = {'worker': {'url': '/models/worker.glb', 'lod1': '/models/worker-lod1.glb'}}
        lock = [{'id': 'worker', 'lod': lod, 'url': url} for lod, url in enumerate(canonical['worker'].values())]
        verify_inventory(canonical, lock, canonical)
        lock[0]['lod'] = 1
        with self.assertRaisesRegex(AssertionError, 'source-lock'):
            verify_inventory(canonical, lock, canonical)

    def test_rejects_swapped_review_id_and_wrong_file_even_with_same_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in ('correct.glb', 'wrong.glb'):
                (root / name).write_bytes(b'model')
            checksum = hashlib.sha256(b'model').hexdigest()
            identities = {'/models/worker.glb': {'id': 'worker', 'lod': 0, 'file': 'correct.glb', 'sha256': checksum}}
            review = {'assets': [{'id': 'worker', 'files': [{'url': '/models/worker.glb', 'file': 'correct.glb', 'sha256': checksum}]}]}
            verify_identities(identities, review, [], root)
            review['assets'][0]['id'] = 'guard'
            with self.assertRaisesRegex(AssertionError, 'Review identity'):
                verify_identities(identities, review, [], root)
            review['assets'][0]['id'] = 'worker'
            review['assets'][0]['files'][0]['file'] = 'wrong.glb'
            with self.assertRaisesRegex(AssertionError, 'Review path'):
                verify_identities(identities, review, [], root)

    def test_rejects_stale_source_evidence(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'source.blend').write_bytes(b'source')
            (root / 'evidence.json').write_bytes(b'new evidence')
            identities = {'/models/worker.glb': {'id': 'worker', 'lod': 0, 'file': 'correct.glb', 'sha256': 'model'}}
            source = {'id': 'worker', 'lod': 0, 'url': '/models/worker.glb', 'sha256': 'model',
                      'source': 'source.blend', 'source_sha256': hashlib.sha256(b'source').hexdigest(),
                      'evidence': 'evidence.json', 'evidence_sha256': hashlib.sha256(b'old evidence').hexdigest()}
            with self.assertRaisesRegex(AssertionError, 'Source evidence'):
                verify_identities(identities, {'assets': []}, [source], root)


if __name__ == '__main__':
    unittest.main()
