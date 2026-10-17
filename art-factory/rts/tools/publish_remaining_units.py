"""Fail-closed, single-unit publisher for reviewed human RTS units.

Publication is an explicit final step. --dry-run (the safe default) performs
all gates and reports intended paths without writing runtime or registry data.
A separate qa/root-review.json must be supplied by the root reviewer; this
publisher never creates or upgrades a visual approval.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
FACTORY = ROOT / 'art-factory/rts'
RUNTIME = ROOT / 'public/assets/games/rts'
CLIPS = ['Idle', 'Walk', 'Attack', 'Hurt', 'Death']
UNITS = {
    'worker': {'run': 'human-units/2026-10-05-v1/worker',
               'stem': 'worker-production', 'contract': 'human-units.json'},
    'crossbow': {'run': 'human-units/2026-10-05-v1/crossbow',
                 'stem': 'crossbow-production', 'contract': 'human-units.json'},
    'neutral-raider': {'run': 'human-units/2026-10-05-v1/neutral-raider',
                       'stem': 'neutral-raider-production', 'contract': 'human-units.json'},
    'priest': {'run': 'human-units/2026-10-05-v2/priest',
               'stem': 'priest-production', 'contract': 'human-units-masked-v2.json'},
    'commander': {'run': 'human-units/2026-10-05-v2/commander',
                  'stem': 'commander-production', 'contract': 'human-units-masked-v2.json'},
    'knight': {'run': 'kingdom-knight/2026-10-05-v3',
               'stem': 'knight', 'contract': 'knight.json'},
}


def read(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))


def write(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.next')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n',
                         encoding='utf-8', newline='\n')
    temporary.replace(path)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def report_sha(row):
    return row.get('sha256') if isinstance(row, dict) else None


def exact_clips(value):
    return isinstance(value, list) and len(value) == len(CLIPS) and set(value) == set(CLIPS)


def relative_repo_path(path: Path) -> str:
    return path.resolve().relative_to(ROOT.resolve()).as_posix()


def _asset_rows(rows, label):
    if not isinstance(rows, list) or len(rows) != 2:
        raise ValueError(f'{label} must list exactly LOD0 and LOD1')
    by_lod = {}
    for row in rows:
        if not isinstance(row, dict) or row.get('lod') not in (0, 1):
            raise ValueError(f'{label} must label each asset by LOD 0 or 1')
        lod = row['lod']
        if lod in by_lod or not isinstance(report_sha(row), str):
            raise ValueError(f'{label} has duplicate LOD or missing SHA-256')
        by_lod[lod] = row
    if set(by_lod) != {0, 1}:
        raise ValueError(f'{label} must contain both LODs')
    return by_lod


def _source_record(report):
    source = report.get('source')
    if isinstance(source, dict):
        path = source.get('path')
        sha = source.get('sha256')
    else:
        path = report.get('source_path')
        sha = report.get('source_sha256')
    if not isinstance(path, str) or not isinstance(sha, str):
        raise ValueError('production-verify must record exact source_path and source_sha256')
    return path, sha


def _check_source_report_path(recorded, source_file):
    try:
        resolved = Path(recorded)
        if not resolved.is_absolute():
            resolved = ROOT / resolved
        if resolved.resolve() != source_file.resolve():
            raise ValueError('production-verify source path differs from selected source .blend')
    except OSError as error:
        raise ValueError(f'cannot resolve production-verify source path: {error}') from error


def preflight(unit: str, run: Path | None = None, stem: str | None = None):
    """Validate all evidence against the exact bytes selected for publication."""
    if unit not in UNITS:
        raise ValueError('unit must be exactly one of: ' + ', '.join(sorted(UNITS)))
    defaults = UNITS[unit]
    run = (Path(run) if run else FACTORY / 'runs' / defaults['run']).resolve()
    if not run.is_relative_to((FACTORY / 'runs').resolve()):
        raise ValueError('selected run must be inside art-factory/rts/runs')
    stem = stem or defaults['stem']
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*', stem):
        raise ValueError('stem must be a simple filename stem')

    candidate = run / 'candidate'
    qa = run / 'qa'
    production = read(qa / 'production-verify.json')
    if production.get('unit') != unit:
        raise ValueError('production-verify unit does not match selected unit')
    source_path, source_report_sha = _source_record(production)
    source_file = Path(source_path)
    if not source_file.is_absolute():
        source_file = ROOT / source_file
    source_file = source_file.resolve()
    if not source_file.is_relative_to(run) or not source_file.is_file():
        raise ValueError('production-verify source must be an existing .blend inside the selected run')
    if source_file.suffix.lower() != '.blend':
        raise ValueError('production-verify source must be the editable .blend')
    source_sha = digest(source_file.read_bytes())
    if source_report_sha != source_sha:
        raise ValueError('production-verify source SHA differs from exact source .blend')
    if production.get('source_raw_sha_matches') is False:
        raise ValueError('original raw source SHA check failed when provided')

    glb_paths = {lod: candidate / f'{stem}-lod{lod}.glb' for lod in (0, 1)}
    buffers = {}
    glb_sha = {}
    for lod, path in glb_paths.items():
        if not path.is_file():
            raise ValueError(f'missing candidate LOD{lod}: {path}')
        buffers[lod] = path.read_bytes()
        glb_sha[lod] = digest(buffers[lod])
    for gate in ('weights_pass', 'triangle_pass'):
        if production.get(gate) is not True:
            raise ValueError(f'production-verify {gate} must pass')
    if production.get('ground_pass') is False:
        raise ValueError('production-verify ground-contact check failed')
    if production.get('passed_static') is not True:
        raise ValueError('production-verify static structural gate must pass')
    checked_lods = production.get('glbs')
    if not isinstance(checked_lods, dict):
        raise ValueError('production-verify is missing per-LOD GLB checks')
    for lod in (0, 1):
        row = checked_lods.get(f'lod{lod}')
        if not isinstance(row, dict) or row.get('passed') is not True:
            raise ValueError(f'production-verify LOD{lod} structural check did not pass')
        if row.get('sha256') != glb_sha[lod]:
            raise ValueError(f'production-verify LOD{lod} SHA differs from selected candidate')
        if not exact_clips(row.get('clips')):
            raise ValueError(f'production-verify LOD{lod} does not list the exact five clips')
        if row.get('canonical_bones_present') is not True:
            raise ValueError(f'production-verify LOD{lod} lacks all canonical human bones')
        joints = row.get('joints_per_skin')
        if (not isinstance(joints, list) or not joints
                or any(not isinstance(count, int) or count <= 0 for count in joints)
                or not any(count >= 20 for count in joints)):
            raise ValueError(f'production-verify LOD{lod} skin joint counts are invalid')
        weights = row.get('weights', {})
        if (weights.get('invalid_joint_indices') != 0 or weights.get('invalid_weight_values') != 0
                or weights.get('unweighted_vertices') != 0
                or not isinstance(weights.get('max_weight_sum_error'), (int, float))
                or weights['max_weight_sum_error'] > 0.01):
            raise ValueError(f'production-verify LOD{lod} exported skin weights are invalid')
        pbr = row.get('pbr', {})
        if not row.get('materials') or pbr.get('pbr_material_count', 0) < 1 or pbr.get('failures'):
            raise ValueError(f'production-verify LOD{lod} lacks valid textured PBR/material evidence')

    webgl = read(qa / 'three.json')
    if webgl.get('status') != 'pass' or webgl.get('errors') != []:
        raise ValueError('actual Three.js WebGL QA must pass without errors')
    if not exact_clips(webgl.get('clips')) or not exact_clips(webgl.get('lowClips')):
        raise ValueError('WebGL QA must verify all five clips on both LODs')
    if any(webgl.get('changed', {}).get(name) is not True
           for name in ('walk', 'attack', 'hurt', 'death')):
        raise ValueError('WebGL action-motion checks are incomplete')
    webgl_assets = _asset_rows(webgl.get('sourceAssets'), 'WebGL sourceAssets')
    for lod in (0, 1):
        if report_sha(webgl_assets[lod]) != glb_sha[lod]:
            raise ValueError(f'WebGL LOD{lod} SHA differs from selected candidate')
    details = webgl.get('details')
    if not isinstance(details, list) or len(details) < 4:
        raise ValueError('WebGL QA must include actual blue/red visibility checks for both LODs')
    for row in details:
        if (not isinstance(row, dict) or not isinstance(row.get('teams'), list)
                or not isinstance(row.get('visible'), list)):
            raise ValueError('WebGL team/LOD details are malformed')
    team_colors = {tuple(row['teams']) for row in details}
    visibility = {tuple(row['visible']) for row in details}
    if visibility != {(True, False), (False, True)}:
        raise ValueError('WebGL QA must cover both LOD selections')
    if unit == 'neutral-raider':
        if team_colors != {()}:
            raise ValueError('neutral-raider must remain without TeamCloth tint')
    else:
        combinations = {(tuple(row['visible']), tuple(row['teams'])) for row in details}
        if len(team_colors) != 2 or () in team_colors or len(combinations) != 4:
            raise ValueError('WebGL QA must cover both team colours on each LOD')

    khronos = read(qa / 'khronos.json')
    if khronos.get('errors') != 0:
        raise ValueError('Khronos glTF validation must contain zero errors')
    khronos_assets = khronos.get('assets')
    if not isinstance(khronos_assets, list) or len(khronos_assets) != 2:
        raise ValueError('Khronos validation must contain exactly both LOD assets')
    khronos_hashes = [report_sha(row) for row in khronos_assets]
    if sorted(khronos_hashes) != sorted(glb_sha.values()):
        raise ValueError('Khronos asset hashes differ from selected candidates')
    if any(row.get('issues', {}).get('numErrors') != 0 for row in khronos_assets):
        raise ValueError('Khronos reports an asset validation error')

    # This file must be created independently by root after actual source and
    # runtime review. The publisher never writes, repairs, or upgrades it.
    review = read(qa / 'root-review.json')
    if review.get('status') != 'approved-for-runtime' or review.get('reviewer') != 'root':
        raise ValueError('independent root-review.json must explicitly approve this unit')
    if review.get('unit') != unit:
        raise ValueError('root-review unit does not match selected unit')
    if review.get('source_sha256') != source_sha:
        raise ValueError('root-review source SHA differs from exact source .blend')
    review_assets = _asset_rows(review.get('assets'), 'root-review assets')
    for lod in (0, 1):
        if report_sha(review_assets[lod]) != glb_sha[lod]:
            raise ValueError(f'root-review LOD{lod} SHA differs from selected candidate')
    if review.get('reviewed_lods') != [0, 1] or not exact_clips(review.get('reviewed_clips')):
        raise ValueError('root review must explicitly cover both LODs and all five clips')
    if review.get('reviewed_teams') != ['blue', 'red']:
        raise ValueError('root review must explicitly cover blue and red teams')
    if review.get('actual_webgl_review') is not True:
        raise ValueError('root review must explicitly record actual WebGL inspection')
    if not isinstance(review.get('grip_motion_review'), str) or len(review['grip_motion_review'].strip()) < 12:
        raise ValueError('root review must include a concrete grip and motion note')
    evidence = review.get('evidence')
    if not isinstance(evidence, list) or not evidence:
        raise ValueError('root review must cite preserved visual evidence')
    for relative in evidence:
        path = (qa / relative).resolve()
        if not path.is_relative_to(qa.resolve()):
            raise ValueError('root-review evidence must stay inside the selected QA directory')
        if not path.is_file():
            raise ValueError(f'root-review evidence file is missing: {relative}')

    # Read JSON targets only after all candidate/report gates pass. These are
    # returned for an exact, selected-unit update during the later publish step.
    return {
        'unit': unit,
        'run': run,
        'stem': stem,
        'source_sha256': source_sha,
        'assets': [
            {'lod': lod, 'sha256': glb_sha[lod], 'bytes': len(buffers[lod]),
             'candidate': relative_repo_path(glb_paths[lod])}
            for lod in (0, 1)
        ],
        'buffers': buffers,
        'source': source_file,
        'review': review,
        'intended_ids': [unit, unit + '-lod1'],
        'intended_urls': [
            f'/assets/games/rts/models/{unit}.glb',
            f'/assets/games/rts/models/{unit}-lod1.glb',
        ],
    }


def publish(checked):
    """Copy only this unit's two assets and metadata after preflight succeeds."""
    unit = checked['unit']
    manifest_path = RUNTIME / 'model-registry.json'
    registry_path = FACTORY / 'manifests/unit-registry.json'
    contract_path = FACTORY / 'contracts' / UNITS[unit]['contract']
    manifest, registry, contract = read(manifest_path), read(registry_path), read(contract_path)
    records = []
    for asset, lod in zip(checked['assets'], (0, 1)):
        asset_id = unit if lod == 0 else unit + '-lod1'
        url = f'/assets/games/rts/models/{asset_id}.glb'
        target = ROOT / 'public' / url.lstrip('/')
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(target.name + '.next')
        temporary.write_bytes(checked['buffers'][lod])
        temporary.replace(target)
        records.append({
            'id': asset_id, 'status': 'published', 'url': url,
            'bytes': asset['bytes'], 'sha256': asset['sha256'],
            'candidate': asset['candidate'],
            'source': relative_repo_path(checked['source']),
            'source_sha256': checked['source_sha256'],
            'qa': relative_repo_path(checked['run'] / 'qa/three.json'),
            'root_review': relative_repo_path(checked['run'] / 'qa/root-review.json'),
            'runtime_publish_allowed': True,
        })
    changed_ids = {unit, unit + '-lod1'}
    registry['assets'] = [row for row in registry['assets'] if row.get('id') not in changed_ids] + records
    manifest['assets'][unit] = {
        'url': records[0]['url'], 'lod1': records[1]['url'],
        'status': 'published', 'scale': 1, 'yaw': 0,
    }
    publication = contract.setdefault('unit_publications', {})
    publication[unit] = {
        'status': 'published',
        'source_sha256': checked['source_sha256'],
        'assets': [{'id': row['id'], 'sha256': row['sha256']} for row in records],
        'root_review': relative_repo_path(checked['run'] / 'qa/root-review.json'),
    }
    write(registry_path, registry)
    write(manifest_path, manifest)
    write(contract_path, contract)
    result = {
        'published': unit,
        'asset_ids': [row['id'] for row in records],
        'sha256': [row['sha256'] for row in records],
        'scope': 'selected unit only; local runtime only; no push or deployment',
    }
    write(checked['run'] / 'qa/publication.json', result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('unit', choices=sorted(UNITS), help='exactly one approved unit')
    parser.add_argument('--run', type=Path, help='candidate run under art-factory/rts/runs')
    parser.add_argument('--stem', help='candidate .blend / GLB filename stem')
    parser.add_argument('--dry-run', action='store_true',
                        help='validate all gates and print intended changes (default)')
    parser.add_argument('--publish', action='store_true',
                        help='perform local publication after all preflight gates pass')
    args = parser.parse_args()
    if args.dry_run and args.publish:
        parser.error('--dry-run and --publish are mutually exclusive')
    checked = preflight(args.unit, args.run, args.stem)
    if args.publish:
        result = publish(checked)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(json.dumps({
            'status': 'preflight-passed',
            'dry_run': True,
            'unit': checked['unit'],
            'source_sha256': checked['source_sha256'],
            'assets': checked['assets'],
            'intended_ids': checked['intended_ids'],
            'intended_urls': checked['intended_urls'],
            'writes': [],
        }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
