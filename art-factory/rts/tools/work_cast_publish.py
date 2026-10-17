"""Publish only the six reviewed Work/Cast derivatives to this local worktree.

The root review is produced independently after visual and mechanical QA. This
tool never creates approval. Preflight is read-only; all targets are backed up.
"""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import sys
from procedural_gauntlet_publish import read_glb

RUN = 'art-factory/rts/runs/work-cast/2026-10-11-v2'
CLIPS = {'worker': ['Mine', 'Chop', 'Build'], 'priest': ['Cast'], 'commander': ['CastCleave', 'CastMend', 'CastBanner']}
REGISTRY = 'art-factory/rts/manifests/unit-registry.json'
MANIFEST = 'public/assets/games/rts/model-registry.json'
CONTRACT = 'art-factory/rts/contracts/work-cast.json'
REVIEW = RUN+'/qa/root-review.json'

def require(condition, message):
    if not condition: raise ValueError(message)

def sha(data): return hashlib.sha256(data).hexdigest()
def encoded(value): return (json.dumps(value, ensure_ascii=False, indent=2)+'\n').encode('utf-8')
def inside(root, relative):
    path = (root/relative).resolve()
    require(path.is_relative_to(root), f'Path escapes root: {relative}')
    return path
def read(root, relative): return json.loads(inside(root, relative).read_text(encoding='utf-8'))
def check_hash(root, relative, expected):
    path = inside(root, relative)
    require(path.is_file() and sha(path.read_bytes()) == expected, f'SHA mismatch: {relative}')

def prepare(root):
    root = root.resolve(); review = read(root, REVIEW)
    require(review.get('status') == 'approved-for-local-runtime' and review.get('reviewer') == 'root', 'Independent root approval required')
    require(review.get('user_overall_art_acceptance') == 'pending', 'Do not claim user acceptance')
    rows = review.get('assets', [])
    require(len(rows) == 6 and {(r['unit'], r['lod']) for r in rows} == {(u, lod) for u in CLIPS for lod in (0, 1)}, 'Exactly six unique reviewed assets required')
    evidence = review.get('evidence', [])
    require(bool(evidence), 'Preserved QA evidence required')
    source_locks = [r for r in evidence if r['path'] == RUN+'/source-lock.json']
    require(len(source_locks) == 1, 'Source lock must be explicitly hash-bound')
    for record in evidence: check_hash(root, record['path'], record['sha256'])
    registry, manifest, contract = [read(root, path) for path in (REGISTRY, MANIFEST, CONTRACT)]
    require(contract.get('status') == 'candidate' and contract.get('runtime_publish_allowed') is False, 'Only unpublished candidate may enter this publisher')
    require(contract.get('run') == RUN and contract.get('source_lock') == RUN+'/source-lock.json' and contract.get('clips') == CLIPS, 'Contract differs from reviewed Work/Cast package')
    outputs = {}
    for row in rows:
        unit, lod = row['unit'], row['lod']; asset_id = unit + ('-lod1' if lod else '')
        candidate = f'{RUN}/candidate/{unit}-lod{lod}.glb'; source = f'{RUN}/raw/{unit}-work-cast.blend'
        require(row['candidate'] == candidate and row['source'] == source, 'Unexpected candidate or source path')
        check_hash(root, candidate, row['sha256']); check_hash(root, source, row['source_sha256'])
        doc, _ = read_glb(root/candidate)
        require(sorted(c['name'] for c in doc['animations']) == sorted(['Idle', 'Walk', 'Attack', 'Hurt', 'Death', *CLIPS[unit]]), 'Required clips differ')
        url = f'/assets/games/rts/models/{asset_id}.glb'; target = 'public'+url
        check_hash(root, target, row['previous_sha256'])
        matches = [r for r in registry['assets'] if r['id'] == asset_id]
        require(len(matches) == 1 and matches[0]['sha256'] == row['previous_sha256'] and matches[0]['url'] == url, 'Current registry differs from reviewed base')
        old = deepcopy(matches[0]); data = (root/candidate).read_bytes()
        matches[0].update(status='published', url=url, bytes=len(data), sha256=row['sha256'], candidate=candidate, candidate_sha256=row['sha256'],
                          source=source, source_sha256=row['source_sha256'], qa=REVIEW, qa_sha256=sha((root/REVIEW).read_bytes()),
                          root_review=REVIEW, runtime_publish_allowed=True, publication_scope='local worktree only', user_overall_art_acceptance='pending',
                          animation_revision={'source_lock': RUN+'/source-lock.json', 'source_lock_sha256': source_locks[0]['sha256'], 'clips': CLIPS[unit], 'geometry_exception': 'Existing commander sword rigid X180 about grip; otherwise source mesh/rig/material and all old clips preserved'}, work_cast_previous=old)
        entry = manifest['assets'][unit]
        require(entry['url'] == f'/assets/games/rts/models/{unit}.glb' and entry['lod1'] == f'/assets/games/rts/models/{unit}-lod1.glb', 'Runtime manifest path mismatch')
        entry.update(status='published', source=source)
        entry['lod1Sha256' if lod else 'sha256'] = row['sha256']
        outputs[target] = data
    contract.update(status='published', runtime_publish_allowed=True, publication_scope='local worktree only', root_review=REVIEW, user_overall_art_acceptance='pending')
    outputs.update({REGISTRY: encoded(registry), MANIFEST: encoded(manifest), CONTRACT: encoded(contract)})
    return outputs

def publish(root, checked):
    root = root.resolve()
    require(prepare(root) == checked, 'Inputs changed since preflight')
    backup = root/RUN/'raw/runtime-before-publish'
    require(not backup.exists(), 'Publication backup already exists; inspect previous attempt')
    originals = {relative: (root/relative).read_bytes() for relative in checked}
    for relative, data in originals.items():
        path = backup/relative; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(data)
    staged, replaced = {}, []
    try:
        for relative, data in checked.items():
            target = root/relative; temporary = target.with_name(target.name+'.work-cast-next')
            require(not temporary.exists(), f'Stale staged file: {temporary}')
            staged[relative] = temporary; temporary.write_bytes(data)
        for relative, temporary in staged.items():
            replaced.append(relative); temporary.replace(root/relative)
    except BaseException:
        for relative in replaced: (root/relative).write_bytes(originals[relative])
        raise
    finally:
        for temporary in staged.values():
            if temporary.exists(): temporary.unlink()
    return {'status': 'published-local-only', 'assets': 6, 'backup': str(backup), 'user_overall_art_acceptance': 'pending'}

if __name__ == '__main__':
    root = Path(__file__).resolve().parents[3]; checked = prepare(root)
    require(sys.argv[1:] in (['--dry-run'], ['--publish']), 'Use --dry-run or --publish')
    print(json.dumps(publish(root, checked) if sys.argv[1] == '--publish' else {'status': 'preflight-pass', 'targets': list(checked)}, indent=2))
