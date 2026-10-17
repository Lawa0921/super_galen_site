"""Publish the three exact reviewed construction artifacts locally, with rollback.

This is a bounded worktree integration tool, not an external deployment command.
Review/input validation and serialization finish before the first filesystem write.
"""
import copy
import hashlib
import json
import os
import re
import tempfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[3]
RUN_REL = 'art-factory/rts/runs/building-stages/2026-10-08-v1'
RUN = ROOT / RUN_REL
IDS = ('barracks', 'stable', 'workshop')
CODE_PATHS = frozenset('src/scripts/games/rts/' + name for name in (
    'models.ts', 'scene.ts', 'types.ts', 'visibility.ts', 'visibility.test.ts',
    'construction-presentation.ts', 'model-construction.test.ts',
    'construction-presentation.test.ts'))
EVIDENCE_PATHS = frozenset(RUN_REL + '/qa/' + name for name in (
    'delivery.json', 'runtime-packaging.json', 'independent-asset-review.json',
    'independent-packaging-review.json', 'runtime-code/independent-code-review-v2.json'))
REGISTRY_REL = 'art-factory/rts/manifests/building-registry.json'
CONTRACT_REL = 'art-factory/rts/contracts/building-stages-2026-10-08.json'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def sha(path):
    return digest(path.read_bytes())


def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode('utf-8')


def parse(data):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError('Duplicate JSON key: ' + key)
            result[key] = value
        return result
    def reject_constant(value):
        raise ValueError('Invalid JSON constant: ' + value)
    value = json.loads(data.decode('utf-8'), object_pairs_hook=unique, parse_constant=reject_constant)
    if not isinstance(value, dict):
        raise ValueError('Expected a JSON object')
    return value


def contained(root, name):
    """One canonical ROOT-relative POSIX path, including for nonexistent outputs."""
    if (not isinstance(name, str) or not name or '\\' in name or ':' in name
            or any(part in ('', '.', '..') for part in name.split('/'))
            or PurePosixPath(name).is_absolute()):
        raise ValueError('Expected one canonical ROOT-relative path: ' + repr(name))
    path = root / name
    resolved = path.resolve()
    if not resolved.is_relative_to(root) or resolved != path:
        raise ValueError('Path outside ROOT or aliased through symlink: ' + name)
    return path


def hash_map(review, field, required, exact):
    values = review.get(field)
    if not isinstance(values, dict) or not values:
        raise ValueError('Review requires nonempty ' + field + ' path/hash mapping')
    keys = set(values)
    if (keys != required if exact else not required.issubset(keys)):
        raise ValueError('Review ' + field + ' does not contain the required path set')
    for name, expected in values.items():
        if not isinstance(expected, str) or re.fullmatch('[0-9a-f]{64}', expected) is None:
            raise ValueError('Review requires exact SHA256: ' + repr(name))
    return values


def verify_publication(root, assets, review, reads=None):
    """Validate the entire review; return immutable bytes for the transaction."""
    root = Path(root).resolve()
    reads = {} if reads is None else reads
    def read(name):
        path = contained(root, name)
        if name not in reads:
            reads[name] = path.read_bytes()
        return reads[name]
    if not isinstance(review, dict) or review.get('decision') != 'approved_for_local_publication':
        raise ValueError('Independent/root review does not approve publication')
    if (not isinstance(assets, list) or len(assets) != 3
            or any(not isinstance(a, dict) or not isinstance(a.get('id'), str) for a in assets)
            or {a.get('id') for a in assets} != set(IDS)):
        raise ValueError('Expected exactly three approved building assets')
    required = set()
    for asset in assets:
        name = asset['id']
        for field, expected in (
                ('source', RUN_REL + f'/raw/assemblies/{name}.blend'),
                ('candidate', RUN_REL + f'/candidate-runtime/{name}.glb'),
                ('runtime', f'public/assets/games/rts/models/{name}.glb')):
            if asset.get(field) != expected:
                raise ValueError('Unexpected exact asset path: ' + field)
        required.update((asset['source'], asset['candidate']))
    reviewed = hash_map(review, 'reviewed_files', required, exact=True)
    code = hash_map(review, 'code_paths', set(CODE_PATHS), exact=True)
    browser = review.get('browser_report')
    contained(root, browser)
    evidence = hash_map(review, 'evidence_files', set(EVIDENCE_PATHS) | {browser}, exact=False)
    for asset in assets:
        for field, hash_field in (('source', 'source_sha256'), ('candidate', 'sha256')):
            expected = reviewed[asset[field]]
            if expected != asset.get(hash_field) or digest(read(asset[field])) != expected:
                raise ValueError('Current artifact differs from reviewed bytes: ' + asset[field])
        if (type(asset.get('bytes')) is not int or asset['bytes'] <= 0
                or len(read(asset['candidate'])) != asset['bytes']):
            raise ValueError('Candidate byte count differs from package')
        if digest(read(asset['runtime'])) != asset.get('previous_runtime_sha256'):
            raise ValueError('Refuse replacing changed current runtime: ' + asset['runtime'])
    for field, mapping in (('code', code), ('evidence', evidence)):
        for name, expected in mapping.items():
            data = read(name)
            if digest(data) != expected:
                raise ValueError('Review ' + field + ' changed: ' + name)
            if field == 'evidence' and name in EVIDENCE_PATHS | {browser}:
                parse(data)
    browser_report = parse(read(browser))
    if browser_report.get('pass') is not True:
        raise ValueError('Actual browser report must have pass === true')
    code_rows = browser_report.get('rootCodeSHA')
    if (not isinstance(code_rows, list) or len(code_rows) != len(CODE_PATHS)
            or any(not isinstance(row, dict) or not isinstance(row.get('path'), str) for row in code_rows)):
        raise ValueError('Browser rootCodeSHA requires exactly eight path/hash rows')
    code_names = [row['path'] for row in code_rows]
    if len(set(code_names)) != len(code_names) or set(code_names) != CODE_PATHS:
        raise ValueError('Browser code paths must be the exact owned set without duplicates')
    if any(row.get('sha256') != code[row['path']] for row in code_rows):
        raise ValueError('Browser code SHA differs from root review')
    glb_rows = browser_report.get('glbs')
    if (not isinstance(glb_rows, list) or len(glb_rows) != len(IDS)
            or any(not isinstance(row, dict) or not isinstance(row.get('id'), str) for row in glb_rows)):
        raise ValueError('Browser glbs requires exactly three ID/path/hash rows')
    glb_ids = [row['id'] for row in glb_rows]
    if len(set(glb_ids)) != len(glb_ids) or set(glb_ids) != set(IDS):
        raise ValueError('Browser GLB IDs must be the exact approved set without duplicates')
    by_id = {asset['id']: asset for asset in assets}
    for row in glb_rows:
        asset = by_id[row['id']]
        path = row.get('path')
        if (not isinstance(path, str) or '\\' in path or not Path(path).is_absolute()
                or Path(path).resolve() != contained(root, asset['candidate']).resolve()):
            raise ValueError('Browser GLB absolute path differs from package candidate')
        if row.get('sha256') != asset['sha256']:
            raise ValueError('Browser GLB SHA differs from package candidate')
    return reads


def publish(root, run):
    """Preflight, prepare all bytes, then replace five targets and the report last."""
    root = Path(root).resolve()
    run = Path(run).absolute()
    if run != contained(root, RUN_REL) or not run.is_dir():
        raise ValueError('Expected the exact construction run within ROOT')
    review_rel = RUN_REL + '/qa/root-publication-review.json'
    review_path = contained(root, review_rel)
    package_rel = RUN_REL + '/qa/runtime-packaging.json'
    registry_path = contained(root, REGISTRY_REL)
    contract_path = contained(root, CONTRACT_REL)
    report_path = contained(root, RUN_REL + '/qa/local-publication.json')
    before = contained(root, RUN_REL + '/raw/before-local-publication')
    if report_path.exists():
        raise ValueError('Refuse replacing an existing publication report')
    reads = {name: contained(root, name).read_bytes()
        for name in (review_rel, package_rel, REGISTRY_REL, CONTRACT_REL)}
    review = parse(reads[review_rel])
    package = parse(reads[package_rel])
    registry = parse(reads[REGISTRY_REL])
    contract = parse(reads[CONTRACT_REL])
    assets = copy.deepcopy(package.get('assets'))
    if isinstance(assets, list):
        for asset in assets:
            if isinstance(asset, dict) and isinstance(asset.get('id'), str):
                expected = f'public/assets/games/rts/models/{asset["id"]}.glb'
                if 'runtime' in asset and asset['runtime'] != expected:
                    raise ValueError('Unexpected runtime path in package')
                asset['runtime'] = expected
    verify_publication(root, assets, review, reads)
    entries_list = registry.get('assets')
    if (not isinstance(entries_list, list) or any(not isinstance(e, dict) or not isinstance(e.get('id'), str) for e in entries_list)
            or len({e['id'] for e in entries_list}) != len(entries_list)):
        raise ValueError('Registry requires unique asset IDs')
    entries = {entry['id']: entry for entry in entries_list}
    forbidden = contract.get('forbidden')
    if not isinstance(forbidden, list) or any(not isinstance(value, str) for value in forbidden):
        raise ValueError('Contract forbidden must be a string list')
    for asset in assets:
        entry = entries.get(asset['id'])
        if entry is None or entry.get('sha256') != asset['previous_runtime_sha256']:
            raise ValueError('Registry does not match current runtime')
        if not isinstance(entry.get('previous_versions', []), list):
            raise ValueError('Registry previous_versions must be a list')
    # Prepare old/new bytes and every collision/containment check before mkdir/write.
    targets = [contained(root, a['runtime']) for a in assets] + [registry_path, contract_path]
    originals = {path: reads[path.relative_to(root).as_posix()] for path in targets}
    backups = {path: contained(root, (before / path.name).relative_to(root).as_posix()) for path in targets}
    for path, backup in backups.items():
        if backup.exists() and backup.read_bytes() != originals[path]:
            raise ValueError('Refuse replacing previous backup: ' + backup.name)
    if before.exists() and not before.is_dir():
        raise ValueError('Backup location must be a directory')
    devices = {run.stat().st_dev, report_path.parent.stat().st_dev}
    devices.update(path.parent.stat().st_dev for path in targets)
    if len(devices) != 1:
        raise ValueError('Staging and all targets must share one filesystem')
    for asset in assets:
        entry = entries[asset['id']]
        history = entry.setdefault('previous_versions', [])
        history.append(copy.deepcopy({key: value for key, value in entry.items() if key != 'previous_versions'}))
        entry.update(candidate=asset['candidate'], source=asset['source'], source_sha256=asset['source_sha256'],
            sha256=asset['sha256'], bytes=asset['bytes'], status='published', runtime_publish_allowed=True,
            publication_scope='local worktree only', qa=RUN_REL + '/qa/delivery.json', root_review=review_rel,
            assembly_evidence=review['browser_report'],
            visual_review='Original stage components and completed appearance independently approved; actual browser progress and selection reviewed.',
            assembly_review='Four cumulative stages, ground anchor, hidden picking, independent instances and remembered construction in fog verified.',
            commercial_game_complete=False)
    contract.update(status='published_local_worktree', runtime_publish_allowed=True,
        publication_scope='Root integration after exact-source, asset, code and actual-browser reviews; no external deployment',
        assembly_human_review='Independent asset and code consultants plus root browser evidence review passed for these three stage assets',
        root_publication_review=review_rel)
    contract['forbidden'] = [v for v in forbidden if v != 'runtime/public/registry writes']
    if 'external deployment without explicit authorization' not in contract['forbidden']:
        contract['forbidden'].append('external deployment without explicit authorization')
    updates = {contained(root, a['runtime']): reads[a['candidate']] for a in assets}
    updates[registry_path], updates[contract_path] = encode(registry), encode(contract)
    report = {'status': 'published_local_worktree', 'external_deployment': False,
        'commercial_game_complete': False, 'review_sha256': digest(reads[review_rel]),
        'registry_sha256': digest(updates[registry_path]),
        'files': [{'path': a['runtime'], 'sha256': digest(reads[a['candidate']])} for a in assets],
        'pending': ['Production build and three-browser regression', 'Performance and download budgets on new local runtime', 'Other buildings and destruction/repair lifecycle']}
    updates[report_path] = encode(report)
    # Rollback payloads are also fully staged before the first public replacement.
    with tempfile.TemporaryDirectory(prefix='.publication-', dir=run) as folder:
        staging = Path(folder)
        new_files, old_files = {}, {}
        for index, (target, data) in enumerate(updates.items()):
            new_files[target] = staging / f'new-{index}'
            new_files[target].write_bytes(data)
        for index, (target, data) in enumerate(originals.items()):
            old_files[target] = staging / f'old-{index}'
            old_files[target].write_bytes(data)
        before.mkdir(parents=True, exist_ok=True)
        for target, backup in backups.items():
            if not backup.exists():
                # Exclusive creation cannot overwrite a concurrent/new backup.
                with backup.open('xb') as handle:
                    handle.write(originals[target])
                    handle.flush()
                    os.fsync(handle.fileno())
        try:
            for target, staged in new_files.items():
                os.replace(staged, target)
        except BaseException as failure:
            rollback_errors = []
            try:
                report_path.unlink(missing_ok=True)
            except OSError as error:
                rollback_errors.append(str(error))
            for target, staged in old_files.items():
                try:
                    os.replace(staged, target)
                except OSError as error:
                    rollback_errors.append(str(error))
            if rollback_errors:
                raise RuntimeError('Publication failed; rollback incomplete; preserved backups at '
                    + str(before) + ': ' + '; '.join(rollback_errors)) from failure
            raise
    return report


def main():
    publish(ROOT, RUN)
    print('Published 3 reviewed construction GLBs locally; external deployment unchanged')


if __name__ == '__main__':
    main()
