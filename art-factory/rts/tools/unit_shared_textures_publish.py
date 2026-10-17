"""Fixed 14-model lossless local packaging; preserves crossbow and all art gates."""
from pathlib import Path
import argparse
import copy
import hashlib
import json
import shutil
from unit_shared_textures import verify_externalization, require
from unit_shared_textures_build import read_glb

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / 'art-factory/rts/runs/unit-shared-textures/2026-10-09-v1'
RELEASE = ROOT / 'art-factory/rts/runs/unit-shared-textures/2026-10-09-local-14'
UNITS = ['neutral-raider', 'priest', 'commander', 'knight', 'siege', 'worker', 'guard']
IDS = [name + suffix for name in UNITS for suffix in ['', '-lod1']]
VIEWS = {('idle', .15, False), ('walk', .45, False), ('attack', .37, False), ('hurt', .2, False),
         ('death', .75, False), ('idle', .15, True), ('idle', .45, True)}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def encoded(data):
    return (json.dumps(data, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def relative(path):
    return path.relative_to(ROOT).as_posix()


def validate_selection(ids, report):
    require(len(ids) == len(IDS) and set(ids) == set(IDS), 'Only the fixed 14-model cohort is eligible')
    for browser in ['chromium', 'firefox', 'webkit']:
        for unit in UNITS:
            rows = [row for row in report['results'] if row['browser'] == browser and row['id'] == unit]
            require(len(rows) == 1, 'Missing or duplicate browser/unit')
            row = rows[0]
            require(row.get('errors') == [], 'Browser errors')
            views = row['views']
            require(len(views) == len(VIEWS) and {(v['clip'], v['dt'], v['portrait']) for v in views} == VIEWS,
                    'Missing or duplicate view')
            for view in views:
                require(view['changedChannels'] == 0, 'Nonzero default pixels; controlled result cannot override')
                require(view['errors'] == [] and view['contextLost'] is False and view['drawCalls'] > 0, 'Invalid rendering')
    return ids


def preflight():
    require(not (RELEASE / 'qa/published.json').exists(), 'Already published; do not overwrite history')
    review_path = RELEASE / 'qa/root-packaging-review.json'
    review = read(review_path)
    require(review['status'] == 'APPROVE_LIMITED_14_MODEL_PACKAGING', 'Missing limited packaging approval')
    require(review['commercial_quality_approved'] is False, 'Packaging cannot approve commercial quality')
    for name, expected in review['evidence_sha256'].items():
        target = (ROOT / name).resolve()
        require(target.is_relative_to(ROOT) and sha(target.read_bytes()) == expected, 'Review evidence changed: ' + name)
    browser = ROOT / review['browser_report']
    require(relative(browser) in review['evidence_sha256'], 'Unbound browser evidence')
    validate_selection(review['ids'], read(browser))
    parity_path = RUN / 'qa/byte-parity.json'
    require(relative(parity_path) in review['evidence_sha256'], 'Unbound parity evidence')
    parity = read(parity_path)
    validator_path = ROOT / review['validator_report']
    retry_path = ROOT / review['retry_report']
    require(relative(validator_path) in review['evidence_sha256'] and relative(retry_path) in review['evidence_sha256'],
            'Unbound validator/retry evidence')
    validators = read(validator_path)['rows']
    retry = read(retry_path)
    require(retry['status'] == 'passed' and len(retry['browsers']) == 3
            and {row['browser'] for row in retry['browsers']} == {'chromium', 'firefox', 'webkit'}
            and all(row['status'] == 'passed' and row['pageErrors'] == [] for row in retry['browsers']), 'Retry QA failed')
    for key, name in [('models', 'models.ts'), ('sharedMaterialLoader', 'shared-material-loader.ts')]:
        require(retry['sourceHashes'][key] == sha((ROOT / 'src/scripts/games/rts' / name).read_bytes()), 'Retry source drift')
    unit_registry = ROOT / 'art-factory/rts/manifests/unit-registry.json'
    current = read(unit_registry)
    frozen_registry = read(RUN / 'raw/unit-registry.json')
    require(current == frozen_registry, 'Current unit registry changed since candidate snapshot')
    entries = {asset['id']: asset for asset in current['assets']}
    selected, images, unchanged = {}, {}, {}
    for row in parity['models']:
        name = row['id']
        source_path = RUN / 'raw/models' / (name + '.glb')
        source = source_path.read_bytes()
        runtime = ROOT / ('public' + entries[name]['url'])
        require(sha(source) == row['source_sha256'] == sha(runtime.read_bytes()), 'Runtime/source drift: ' + name)
        if name not in IDS:
            unchanged[relative(runtime)] = row['source_sha256']
            continue
        candidate = (RUN / 'candidate/models' / (name + '.glb')).read_bytes()
        require(sha(candidate) == row['candidate_sha256'], 'Candidate drift: ' + name)
        validation = [v for v in validators if v['id'] == name]
        require(len(validation) == 1 and validation[0]['sha256'] == sha(candidate)
                and validation[0]['issues']['numErrors'] == 0, 'GLB validator failed: ' + name)
        require(any(v['id'] == name and v['sha256'] == sha(candidate) for v in retry['candidate']['modelSha256']),
                'Retry candidate drift: ' + name)
        model_images = {}
        for uri in row['extracted_image_uris']:
            image_path = RUN / 'candidate/materials/unit-shared' / uri.rsplit('/', 1)[-1]
            payload = image_path.read_bytes()
            require(sha(payload) == parity['images'][uri]['sha256'], 'Image drift: ' + uri)
            model_images[uri] = payload
            images[uri] = payload
        verify_externalization(*read_glb(source), *read_glb(candidate), model_images)
        selected[name] = candidate
    require(set(selected) == set(IDS) and len(images) == 18 and len(unchanged) == 2, 'Wrong closed subset')
    require(any(retry['failingImagePath'].endswith(uri.rsplit('/', 1)[-1]) for uri in images),
            'Failure/retry did not exercise selected images')
    registry = copy.deepcopy(current)
    for entry in registry['assets']:
        if entry['id'] not in selected:
            continue
        original = copy.deepcopy(entry)
        candidate_path = RUN / 'candidate/models' / (entry['id'] + '.glb')
        entry.update(bytes=len(selected[entry['id']]), sha256=sha(selected[entry['id']]),
                     candidate=relative(candidate_path), candidate_sha256=sha(selected[entry['id']]),
                     qa=relative(review_path), qa_sha256=sha(review_path.read_bytes()))
        entry['lossless_packaging'] = {'original_asset_record': original, 'review': relative(review_path),
                                     'scope': 'Encoded image deduplication only; art and source-rights status unchanged'}
    shared_registry = {'contract': 'art-factory/rts/contracts/unit-shared-textures.json', 'assets': []}
    payloads = {}
    for uri, payload in sorted(images.items()):
        filename = uri.rsplit('/', 1)[-1]
        candidate_path = RUN / 'candidate/materials/unit-shared' / filename
        url = '/assets/games/rts/materials/unit-shared/' + filename
        providers = [name for name in parity['images'][uri]['models'] if name in selected]
        source_path = RUN / 'raw/models' / (providers[0] + '.glb')
        shared_registry['assets'].append({'id': 'unit-shared-' + filename, 'status': 'published', 'url': url,
            'bytes': len(payload), 'sha256': sha(payload), 'candidate': relative(candidate_path),
            'source': relative(source_path), 'source_sha256': sha(source_path.read_bytes()),
            'qa': relative(review_path), 'qa_sha256': sha(review_path.read_bytes()),
            'provider_models': providers, 'runtime_publish_allowed': True, 'commercial_quality_approved': False})
        payloads[ROOT / ('public' + url)] = payload
    # Images precede referencing GLBs; registries are written last.
    for name, payload in selected.items():
        payloads[ROOT / ('public' + entries[name]['url'])] = payload
    registry_path = ROOT / 'art-factory/rts/manifests/unit-shared-material-registry.json'
    require(not registry_path.exists(), 'Shared registry already exists')
    for destination in list(payloads)[:len(images)]:
        require(not destination.exists(), 'Shared image already exists: ' + str(destination))
    payloads[unit_registry] = encoded(registry)
    payloads[registry_path] = encoded(shared_registry)
    profile_path = ROOT / 'art-factory/rts/profile.json'
    profile = read(profile_path)
    require('manifests/unit-shared-material-registry.json' not in profile['registries'], 'Profile already modified')
    profile['registries'].append('manifests/unit-shared-material-registry.json')
    payloads[profile_path] = encoded(profile)
    return payloads, unchanged


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    payloads, unchanged = preflight()
    plan = {'status': 'DRY_RUN', 'commercial_quality_approved': False,
            'files': [{'path': relative(p), 'before_sha256': sha(p.read_bytes()) if p.exists() else None,
                       'after_sha256': sha(data), 'bytes': len(data)} for p, data in payloads.items()],
            'unchanged': unchanged}
    if args.apply:
        backup = RELEASE / 'backup'
        require(not backup.exists(), 'Backup exists; inspect interrupted publication instead of overwriting')
        backup.mkdir(parents=True)
        for row in plan['files']:
            target = ROOT / row['path']
            if row['before_sha256'] is not None:
                require(sha(target.read_bytes()) == row['before_sha256'], 'Pre-write drift')
                destination = backup / row['path']
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, destination)
                require(sha(destination.read_bytes()) == row['before_sha256'], 'Backup mismatch')
            else:
                require(not target.exists(), 'Unexpected new file')
        (backup / 'plan.json').write_bytes(encoded(plan))
        for target, data in payloads.items():
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_name(target.name + '.packaging-next')
            require(not temporary.exists(), 'Unexpected temporary file')
            temporary.write_bytes(data)
            temporary.replace(target)
        for row in plan['files']:
            require(sha((ROOT / row['path']).read_bytes()) == row['after_sha256'], 'Post-write mismatch')
        for name, expected in unchanged.items():
            require(sha((ROOT / name).read_bytes()) == expected, 'Excluded model changed')
        plan['status'] = 'LOCAL_PACKAGING_PUBLISHED_POSTVALIDATION_PENDING'
        (RELEASE / 'qa/published.json').write_bytes(encoded(plan))
    print(json.dumps({'status': plan['status'], 'files': len(plan['files']), 'models': len(IDS), 'images': 18,
                      'excluded_models': 2, 'commercial_quality_approved': False}))


if __name__ == '__main__':
    main()
