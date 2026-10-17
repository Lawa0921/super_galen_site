"""Publish the complete accepted model batch into the local worktree only."""
import copy
import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / 'art-factory/rts/runs/all-models/2026-10-14-v1'


def read(path):
    return json.loads(path.read_bytes())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def relative(path):
    return path.relative_to(ROOT).as_posix()


def save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


def verified_files(current, review):
    assert review['decision'] == 'approve', 'Unapproved batch'
    approved = {}
    for row in review['assets']:
        assert row['decision'] == 'approve', ('Unapproved model', row['id'])
        for file in row['files']:
            url = file['url']
            assert url not in approved, ('Duplicate approval', url)
            assert current.get(url) == file['sha256'], ('Stale approval', url)
            approved[url] = file['sha256']
    assert approved == current, 'Incomplete approval coverage'
    return approved


def verify_inventory(manifest, lock_rows, canonical):
    def normalized(data):
        return {(ident, lod, row[key]) for ident, row in data.items()
                for lod, key in enumerate(('url', 'lod1')) if row.get(key)}
    expected = normalized(canonical)
    assert normalized(manifest) == expected, 'Runtime inventory mismatch'
    locked = {(row['id'], row['lod'], row['url']) for row in lock_rows}
    assert len(locked) == len(lock_rows) and locked == expected, 'Incorrect source-lock identity'
    names = [Path(row[2]).name for row in expected]
    assert len(set(names)) == len(names), 'Duplicate candidate basename'


def verify_coverage(manifest, ledger):
    assert ledger['status'] == 'approved-for-local-publication', 'Unapproved coverage batch'
    expected_files = sum(bool(row.get(key)) for row in manifest.values() for key in ('url', 'lod1'))
    assert (ledger['models'], ledger['files']) == (len(manifest), expected_files), 'Coverage count mismatch'
    ids = [row['id'] for row in ledger['assets']]
    assert len(ids) == len(set(ids)) and set(ids) == set(manifest), 'Coverage inventory mismatch'
    assert all(row['status'] == 'approved-model-pending-batch' for row in ledger['assets']), 'Unapproved coverage model'


def verify_identities(identities, review, sources, root):
    for row in review['assets']:
        for file in row['files']:
            expected = identities[file['url']]
            assert row['id'] == expected['id'], ('Review identity', file['url'])
            assert Path(file['file']).as_posix() == expected['file'], ('Review path', file['url'])
            assert sha(root / file['file']) == file['sha256'] == expected['sha256'], ('Review file changed', file['url'])
    for item in sources:
        expected = identities[item['url']]
        assert (item['id'], item['lod']) == (expected['id'], expected['lod']), ('Source identity', item['url'])
        assert item['sha256'] == expected['sha256'], ('Source model changed', item['url'])
        assert sha(root / item['source']) == item['source_sha256'], ('Source changed', item['url'])
        assert sha(root / item['evidence']) == item['evidence_sha256'], ('Source evidence changed', item['url'])


def verify_performance(current, report, root):
    assert report.get('formalAcceptance') and report.get('verificationCompleted') and report.get('performanceThresholdPassed'), 'Incomplete performance verification'
    assert not report['errors'] and not report['contextLost']
    assert report['medianFps'] >= 55 and report['p95Ms'] < 33
    for key, count in [('units', 80), ('buildings', 20), ('visibleUnits', 80), ('visibleBuildings', 20), ('screenUnits', 80), ('screenBuildings', 20)]:
        assert report[key] == count
    assert report['status'] == 'playing' and report['portraitKind'] == 'knight' and report['draws']['portrait'] > 0
    assert report['viewport'] == [1920, 1080] and report['dpr'] == 1 and '--mute-audio' in report['launchArgs']
    assert {'--enable-gpu','--force_high_performance_gpu'}.issubset(report['launchArgs']), 'Dedicated GPU launch required'
    monitor = report['mainThread']
    assert monitor['valid'] and monitor['elapsedMs'] >= 60000 and monitor['heartbeatCount'] > 0
    assert monitor['maxHeartbeatLatenessMs'] < 500 and monitor['maxLongTaskMs'] < 500
    for key in ['releasedAssets', 'browserAssets']:
        assert {r['url']: r['sha256'] for r in report[key]} == current
        assert all(current[r['url']] == r['sha256'] for r in report[key])
    provenance = report.get('productionHarness')
    assert provenance and provenance['mode'] == 'production-bundled-fixture', 'Production harness required'
    assert provenance['runtimeSources'], 'Missing runtime source bindings'
    for binding in [provenance[key] for key in ['fixtureBundle', 'sourceFixture', 'builtIndex', 'wrapper', 'runner', 'bundleHelper', 'pageSource', 'styleSource']] + provenance['runtimeSources']:
        assert sha(root / binding['path']) == binding['sha256'], ('Stale production evidence', binding['path'])


def main():
    manifest = read(RUN / 'review-manifest.json')['assets']
    lock = read(RUN / 'source-lock.json')
    assert len(manifest) == 34 and len(lock['assets']) == 46
    canonical = read(ROOT / 'public/assets/games/rts/model-registry.json')['assets']
    collapse_source = (ROOT / 'src/scripts/games/rts/building-collapse.ts').read_text(encoding='utf8')
    rubble_section = collapse_source.split('export const RUBBLE_MODELS=[', 1)[1].split('] as const;', 1)[0]
    rubble = re.findall(r"\{id:'([^']+)',url:'([^']+)'\}", rubble_section)
    assert len(rubble) == 2 and all(ident not in canonical for ident, _ in rubble)
    canonical.update({ident: {'url': url} for ident, url in rubble})
    verify_inventory(manifest, lock['assets'], canonical)
    current, candidates, identities = {}, {}, {}
    for row in lock['assets']:
        target = ROOT / 'public' / row['url'].lstrip('/')
        assert sha(target) == row['sha256'], ('Runtime changed since baseline', row['url'])
        candidate = RUN / 'candidate' / target.name
        current[row['url']] = sha(candidate if candidate.exists() else target)
        identities[row['url']] = {'id': row['id'], 'lod': row['lod'],
            'file': relative(candidate if candidate.exists() else target), 'sha256': current[row['url']]}
        if current[row['url']] != row['sha256']:
            candidates[row['url']] = candidate
    independent = read(RUN / 'qa/independent-review.json')
    verified_files(current, independent)
    verify_coverage(manifest, read(RUN / 'qa/coverage-ledger.json'))
    verify_identities(identities, independent, [], ROOT)
    integrity = read(RUN / 'qa/integrity.json')
    validator = read(RUN / 'qa/gltf-validator.json')
    assert integrity['status'] == 'passed' and not integrity['failures']
    assert validator['errors'] == 0
    for rows in (integrity['rows'], validator['assets']):
        found = {manifest[r['id']]['lod1' if r['lod'] else 'url']: r['sha256'] for r in rows}
        assert found == current, 'Stale structural validation'
    browser = read(RUN / 'qa/final/browser.json')
    assert not browser['errors'] and {r['id'] for r in browser['rows']} == set(manifest)
    assert {urlparse(r['url']).path: r['sha256'] for r in browser['servedAssets']} == current
    floor = read(RUN / 'qa/final/floor-gate.json')
    assert floor['status'] == 'passed' and floor['unit_clip_lod_sweeps'] == 94
    game = read(RUN / 'qa/game/evidence.json')
    units = {r['id'] for r in browser['rows'] if r['data']['clips']}
    unit_urls = {manifest[unit][key] for unit in units for key in ('url', 'lod1')}
    assert not game['errors'] and game['allServedModelHashesMatch']
    assert set(game['selectionPortraitVisible']) == units and len(units) == 8
    assert {r['url']: r['sha256'] for r in game['assets']} == {url: current[url] for url in unit_urls}
    assert game['download']['firstMapEstimatedGzipBytes'] <= 35_000_000
    performance_path = RUN / 'qa/performance-production/performance-release-formal-production-dedicated-portrait.json'
    performance = read(performance_path)
    verify_performance(current, performance, ROOT)
    source_bundle = read(RUN / 'candidate-sources.json')
    assert source_bundle['status'] == 'complete', 'Incomplete source bundle'
    source_rows = source_bundle['assets']
    verify_identities(identities, independent, source_rows, ROOT)
    sources = {r['url']: r for r in source_rows}
    assert len(sources) == len(source_rows) and set(sources) == set(candidates), 'Candidate source coverage'
    for url, item in sources.items():
        assert item['sha256'] == current[url], ('Stale source binding', url)
        assert sha(ROOT / item['source']) == item['source_sha256'], ('Source changed', url)
        assert (ROOT / item['evidence']).is_file()
    for unit in ('worker', 'guard', 'priest', 'neutral-raider', 'knight', 'crossbow'):
        collision = read(RUN / f'qa/{unit}-runtime-collision.json')
        assert collision['checks'] > 0 and not collision['failures'] and collision['max_crossings'] == 0
        for item in collision['assets']:
            assert item['sha256'] == current[manifest[unit]['lod1' if item['lod'] else 'url']]
    print(json.dumps({'status': 'all-publication-gates-passed', 'models': 34, 'files': 46, 'changed_files': len(candidates)}))
    if '--publish' not in sys.argv:
        return
    metadata = [ROOT / f'art-factory/rts/manifests/{kind}-registry.json' for kind in ('unit', 'building', 'prop')]
    runtime_path = ROOT / 'public/assets/games/rts/model-registry.json'
    commercial_path = ROOT / 'art-factory/rts/manifests/commercial-readiness.json'
    audit_path = ROOT / 'art-factory/rts/runs/commercial-readiness/2026-10-09/qa/published-unit-source-audit.json'
    backup = RUN / 'raw/publication-before'
    assert not backup.exists(), 'Publication backup already exists; inspect before repeating'
    backup.mkdir()
    for path in metadata + [runtime_path, commercial_path, audit_path]:
        (backup / path.name).write_bytes(path.read_bytes())
    evidence = ['source-lock.json', 'candidate-sources.json', 'qa/independent-review.json', 'qa/coverage-ledger.json',
                'qa/integrity.json', 'qa/gltf-validator.json', 'qa/final/browser.json',
                'qa/final/floor-gate.json', 'qa/game/evidence.json', 'qa/game/shadow-motion.json', performance_path.relative_to(RUN).as_posix()]
    root_review_path = RUN / 'qa/root-review.json'
    save(root_review_path, {'status': 'approved-all-models-local-runtime', 'models': 34, 'files': 46,
        'scope': 'All runtime models, required rigs, skinning, animation clips, equipment contact, both LODs, construction and collapse.',
        'assets': [{'url': url, 'sha256': checksum} for url, checksum in current.items()],
        'changed_assets': source_rows, 'runtime_publish_allowed': True, 'publication_scope': 'local worktree only',
        'user_overall_art_acceptance': 'pending', 'commercial_game_complete': False,
        'evidence': [{'path': relative(RUN / name), 'sha256': sha(RUN / name)} for name in evidence]})
    review_ref, review_sha = relative(root_review_path), sha(root_review_path)
    for path in metadata:
        registry = read(path)
        for row in registry['assets']:
            url = row.get('url')
            if url not in current:
                continue
            if url not in sources:
                row['latest_model_validation'] = review_ref
                continue
            item = sources[url]
            row.setdefault('previous_versions', []).append(copy.deepcopy({k: v for k, v in row.items() if k != 'previous_versions'}))
            row['latest_model_validation'] = review_ref
            row.update(status='published', sha256=current[url], bytes=candidates[url].stat().st_size,
                source=item['source'], source_sha256=item['source_sha256'], candidate=relative(candidates[url]),
                candidate_sha256=current[url], qa=review_ref, qa_sha256=review_sha, root_review=review_ref,
                assembly_evidence=relative(RUN / 'qa/game/evidence.json'), runtime_publish_allowed=True,
                publication_scope='local worktree only', user_overall_art_acceptance='pending',
                visual_review=item['change'], assembly_review='Complete 34-model batch passed current-SHA runtime, animation, LOD and lifecycle validation.')
            row['model_refinement'] = {'source_lock': relative(RUN / 'source-lock.json'),
                'source_lock_sha256': sha(RUN / 'source-lock.json'),
                'source_binding': relative(RUN / 'candidate-sources.json'),
                'source_binding_sha256': sha(RUN / 'candidate-sources.json'),
                'previous_sha256': next(r['sha256'] for r in lock['assets'] if r['url'] == url)}
        save(path, registry)
    runtime = read(runtime_path)
    for ident, row in runtime['assets'].items():
        for key, checksum_key in (('url', 'sha256'), ('lod1', 'lod1Sha256')):
            if row.get(key) in current:
                row[checksum_key] = current[row[key]]
        if row.get('url') in sources:
            row['source'] = sources[row['url']]['source']
    save(runtime_path, runtime)
    for url, candidate in candidates.items():
        (ROOT / 'public' / url.lstrip('/')).write_bytes(candidate.read_bytes())
    audit = read(audit_path)
    for row in audit['units'].values():
        for item in row['runtime_assets']:
            if item['url'] in current:
                item['sha256'] = current[item['url']]
    audit['all_models_refinement'] = review_ref
    save(audit_path, audit)
    commercial = read(commercial_path)
    commercial.setdefault('historical_model_refinements', []).append(commercial['latest_model_refinement'])
    commercial['latest_model_refinement'] = {'run': relative(RUN), 'scope': 'All 34 models, 46 GLBs, 8 articulated units and 94 clip/LOD sweeps',
        'status': 'published-local-worktree', 'review': review_ref, 'user_overall_art_acceptance': 'pending',
        'remaining_character_issues': [], 'full_release_gate': 'Model batch verified locally; unrelated whole-game release and rights approvals remain unchanged.'}
    for url in current:
        commercial['asset_hashes'][url.lstrip('/')] = sha(ROOT / 'public' / url.lstrip('/'))
    commercial['asset_hashes']['assets/games/rts/model-registry.json'] = sha(runtime_path)
    save(commercial_path, commercial)
    for url, checksum in current.items():
        assert sha(ROOT / 'public' / url.lstrip('/')) == checksum
    save(RUN / 'qa/publication.json', {'status': 'published-local-worktree', 'models': 34, 'files': 46,
        'changed_assets': source_rows, 'external_deployment': False, 'root_review': review_ref})
    print(json.dumps({'status': 'published-local-worktree', 'changed_files': len(candidates)}))


if __name__ == '__main__':
    main()
