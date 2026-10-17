"""Gate-checked local publication of a roster-expansion unit pending user style approval.

Refuses unless every mechanical report for the exact candidate SHA passed: Khronos validator
zero errors, integrity, closed-hand contact, Three runtime collision, 60 Hz bounds, source
crossings and IK reach. Copies the GLB pair and the content-addressed body atlas to runtime,
and records the unit in model-registry.json (user_style_approval: pending), unit-registry.json
and unit-shared-material-registry.json. Never removes the catalog preview flag.

Usage: python roster_publish.py --run <run> --unit pikeman [--publish]
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PUBLIC = ROOT / 'public/assets/games/rts'


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def rel(path):
    return Path(path).resolve().relative_to(ROOT).as_posix()


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def dump(path, data):
    # Keep each registry's existing line endings (several are stored CRLF) so diffs stay minimal.
    crlf = Path(path).is_file() and b'\r\n' in Path(path).read_bytes()[:200]
    Path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8', newline='\r\n' if crlf else '\n')


def gates(run, unit):
    qa = run / 'qa'
    pack = load(qa / 'pack.json')
    candidates = {row['lod']: run / f'candidate/{unit}{"-lod1" if row["lod"] else ""}.glb' for row in pack}
    for row in pack:
        assert sha(candidates[row['lod']]) == row['sha256'], 'candidate changed since packing'
    shas = {sha(p) for p in candidates.values()}
    validator = load(qa / 'gltf-validator.json')
    assert validator['errors'] == 0 and {a['sha256'] for a in validator['assets']} == shas, 'validator'
    integrity = load(qa / 'integrity.json')
    assert integrity['status'] == 'passed' and {l['sha256'] for l in integrity['lods']} == shas, 'integrity'
    collision = load(qa / f'{unit}-runtime-collision.json')
    assert collision['checks'] > 0 and collision['max_crossings'] == 0 and {a['sha256'] for a in collision['assets']} == shas, 'runtime collision'
    hands = load(qa / f'{unit}-hand-contact.json')
    build = load(qa / 'build.json')
    assert not hands['failures'] and hands['source_sha256'] == build['blend']['sha256'], 'hand contact'
    bounds = load(qa / 'bounds-check.json')
    assert not bounds['failures'], 'bounds'
    assert all(not v for v in build['source_crossings'].values()), 'source crossings'
    assert all(v <= .001 for v in build['motion']['ik_residual_m'].values()), 'grip IK reach'
    return pack, candidates, {'validator_errors': 0, 'validator_warnings': validator['warnings'], 'integrity': 'passed',
                              'runtime_collision_checks': collision['checks'], 'hand_checks': hands['checks'],
                              'hand_gap_range_m': hands['gap_range_m'], 'min_wrap_sectors': hands['min_wrap_sectors'],
                              'bounds_min_margin_m': min(r['min_margin_m'] for r in bounds['rows']),
                              'ik_residual_m': build['motion']['ik_residual_m']}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--unit', required=True)
    parser.add_argument('--publish', action='store_true')
    parser.add_argument('--provenance', default='')
    parser.add_argument('--visual-review', default='')
    args = parser.parse_args()
    run, unit = args.run.resolve(), args.unit
    pack, candidates, summary = gates(run, unit)
    build = load(run / 'qa/build.json')
    print(json.dumps({'gates': 'passed', **summary}))
    if not args.publish:
        return
    texture_uri = pack[0]['body_texture_uri']
    texture_name = Path(texture_uri).name
    texture_src = run / 'materials/unit-shared' / texture_name
    assert pack[1]['body_texture_uri'] == texture_uri and sha(texture_src) == Path(texture_name).stem
    targets = {0: PUBLIC / f'models/{unit}.glb', 1: PUBLIC / f'models/{unit}-lod1.glb'}
    for lod, target in targets.items():
        shutil.copyfile(candidates[lod], target)
        assert sha(target) == pack[lod]['sha256']
    texture_target = PUBLIC / 'materials/unit-shared' / texture_name
    shutil.copyfile(texture_src, texture_target)
    source = run / f'raw/{unit}-assembly.blend'
    common = {'status': 'published', 'source': rel(source), 'source_sha256': sha(source),
              'qa': rel(run / 'qa/publication.json'), 'runtime_publish_allowed': True,
              'publication_scope': 'local worktree only; catalog preview gate kept',
              'user_style_approval': 'pending', 'user_overall_art_acceptance': 'pending',
              'provenance': args.provenance, 'visual_review': args.visual_review,
              'review_page': f'art-factory/rts/review/roster-{unit}-20261016.html'}
    registry = load(ROOT / 'art-factory/rts/manifests/unit-registry.json')
    registry['assets'] = [a for a in registry['assets'] if a['id'] not in (unit, unit + '-lod1')]
    for lod in (0, 1):
        ident = unit + ('-lod1' if lod else '')
        registry['assets'].append({'id': ident, 'url': '/' + rel(targets[lod]).removeprefix('public/'), 'bytes': targets[lod].stat().st_size,
                                   'sha256': pack[lod]['sha256'], 'candidate': rel(candidates[lod]), 'candidate_sha256': pack[lod]['sha256'],
                                   'triangles': pack[lod]['triangles'], 'lod': lod, 'clips': build['clips'],
                                   'evidence': rel(run / 'qa/build.json'), **common})
    dump(ROOT / 'art-factory/rts/manifests/unit-registry.json', registry)
    shared = load(ROOT / 'art-factory/rts/manifests/unit-shared-material-registry.json')
    ident = 'unit-shared-' + texture_name
    shared['assets'] = [a for a in shared['assets'] if a['id'] != ident]
    shared['assets'].append({'id': ident, 'status': 'published', 'url': '/' + rel(texture_target).removeprefix('public/'),
                             'bytes': texture_target.stat().st_size, 'sha256': sha(texture_target), 'candidate': rel(texture_src),
                             'source': rel(run / 'prep/candidate/body-1024-q90.jpg'), 'source_sha256': sha(run / 'prep/candidate/body-1024-q90.jpg'),
                             'qa': rel(run / 'prep/qa/team-mask-prep.json'), 'qa_sha256': sha(run / 'prep/qa/team-mask-prep.json'),
                             'provider_models': [unit, unit + '-lod1'], 'runtime_publish_allowed': True,
                             'commercial_quality_approved': False, 'user_style_approval': 'pending'})
    dump(ROOT / 'art-factory/rts/manifests/unit-shared-material-registry.json', shared)
    models = load(PUBLIC / 'model-registry.json')
    models['assets'][unit] = {'url': f'/assets/games/rts/models/{unit}.glb', 'lod1': f'/assets/games/rts/models/{unit}-lod1.glb',
                              'status': 'published', 'scale': 1, 'yaw': 0, 'sha256': pack[0]['sha256'], 'lod1Sha256': pack[1]['sha256'],
                              'source': rel(source), 'provenance': args.provenance, 'user_style_approval': 'pending',
                              'note': 'Published for style review only; UNITS[kind].preview stays true and the kind is not in REQUIRED_MODELS until the user approves.'}
    dump(PUBLIC / 'model-registry.json', models)
    dump(run / 'qa/publication.json', {'unit': unit, 'gates': summary,
                                       'runtime': {str(l): {'path': rel(t), 'sha256': sha(t), 'bytes': t.stat().st_size} for l, t in targets.items()},
                                       'shared_texture': {'path': rel(texture_target), 'sha256': sha(texture_target)},
                                       'user_style_approval': 'pending', 'preview_gate': 'kept'})
    print(json.dumps({'published': [rel(t) for t in targets.values()] + [rel(texture_target)]}))


if __name__ == '__main__':
    main()
