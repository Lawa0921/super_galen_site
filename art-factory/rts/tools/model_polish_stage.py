"""Copies model-polish candidates onto runtime paths of this branch and updates the hash registries.

Usage: python art-factory/rts/tools/model_polish_stage.py [run-dir] [record-suffix] [hop-tag] [change text]
  defaults: art-factory/rts/runs/model-polish/2026-10-16-v1, -apply.json, model-polish-2026-10-16, weapons/facade text.
  The hand pass stages with: art-factory/rts/runs/model-polish/2026-10-16-hands-v1 -hands.json model-polish-hands-2026-10-16
- public/assets/games/rts/models/<file>.glb  <- run candidate/models/<file>.glb
- public/assets/games/rts/materials/polish-v1/* <- run candidate/materials/*
- public/assets/games/rts/model-registry.json sha256 / lod1Sha256 refreshed for every staged file
- art-factory/rts/manifests/{unit,building}-registry.json rows: new sha/bytes/candidate, previous version kept,
  status stays published, user_overall_art_acceptance = pending (branch feat/browser-rts-model-polish not merged)
- art-factory/rts/manifests/detail-material-registry.json gains the polish-v1 rows
- art-factory/rts/manifests/commercial-readiness.json asset_hashes refreshed
The first run snapshots every replaced runtime file into raw/publication-before/ so the stage is reversible.
"""
from pathlib import Path
import hashlib, json, shutil, sys

ROOT = Path(__file__).resolve().parents[3]
REL_RUN = sys.argv[1] if len(sys.argv) > 1 else 'art-factory/rts/runs/model-polish/2026-10-16-v1'
RUN = ROOT / REL_RUN
RECORD = sys.argv[2] if len(sys.argv) > 2 else '-apply.json'
HOP = sys.argv[3] if len(sys.argv) > 3 else 'model-polish-2026-10-16'
CHANGE = sys.argv[4] if len(sys.argv) > 4 else 'model polish 2026-10-16: rebuilt weapons/shields or facade relief + 1024 polish-v1 material maps'
PUB = ROOT / 'public/assets/games/rts'
SCOPE = 'local branch feat/browser-rts-model-polish only; not merged, not deployed; awaiting user approval in /games/rts/models/'


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def load(p):
    return json.loads(Path(p).read_text(encoding='utf-8'))


def dump(p, data, original_text):
    crlf = '\r\n' in original_text
    text = json.dumps(data, indent=2, ensure_ascii=False) + '\n'
    if crlf:
        text = text.replace('\n', '\r\n')
    Path(p).write_bytes(text.encode('utf-8'))


def stage():
    before = RUN / 'raw/publication-before'
    staged = []
    for src in sorted((RUN / 'candidate/models').glob('*.glb')):
        dst = PUB / 'models' / src.name
        snap = before / 'models' / src.name
        if not snap.exists():
            snap.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(dst, snap)
        shutil.copy2(src, dst); staged.append(dst)
    # Publish only the maps a staged GLB references; drop stale polish-v1 files (e.g. superseded formats).
    mats = PUB / 'materials/polish-v1'; mats.mkdir(parents=True, exist_ok=True)
    wanted = set()
    # Every published GLB's polish-v1 references stay (a later pass may stage only some of the models).
    for dst in sorted((PUB / 'models').glob('*.glb')):
        raw = dst.read_bytes(); n = int.from_bytes(raw[12:16], 'little'); doc = json.loads(raw[20:20 + n])
        wanted.update(Path(im['uri']).name for im in doc.get('images', []) if 'polish-v1/' in im.get('uri', ''))
    for old in mats.iterdir():
        if old.name not in wanted:
            old.unlink()
    for name in sorted(wanted):
        if (RUN / 'candidate/materials' / name).exists():  # a later pass may reuse the published maps unchanged
            shutil.copy2(RUN / 'candidate/materials' / name, mats / name)
    # Runtime registry.
    reg_path = PUB / 'model-registry.json'; text = reg_path.read_bytes().decode('utf-8'); reg = json.loads(text)
    for dst in staged:
        stem = dst.stem; lod1 = stem.endswith('-lod1'); key = stem[:-5] if lod1 else stem
        entry = reg['assets'][key]
        entry['lod1Sha256' if lod1 else 'sha256'] = sha(dst)
    dump(reg_path, reg, text)
    # Factory registries (one row per file id) + a source lock (previous bytes) and source binding (new bytes) so the
    # unit-source-rights lineage walk can verify this hop like the 2026-10-14 assembly hop.
    lock_rows, bind_rows, pending = [], [], []
    for kind in ('unit', 'building'):
        path = ROOT / f'art-factory/rts/manifests/{kind}-registry.json'; text = path.read_bytes().decode('utf-8'); data = json.loads(text)
        for row in data['assets']:
            dst = PUB / 'models' / (row['id'] + '.glb')
            if dst not in staged:
                continue
            new = sha(dst); lod = 1 if row['id'].endswith('-lod1') else 0; base_id = row['id'][:-5] if lod else row['id']
            record = RUN / 'qa' / (f'{base_id}{RECORD}' if kind == 'unit' else f'{base_id}-facade.json')
            already = row.get('model_polish', {}).get('run') == REL_RUN
            if already or row.get('sha256') != new:
                if not already:
                    prev = {k: v for k, v in row.items() if k != 'previous_versions'}
                    row.setdefault('previous_versions', []).append({**prev, 'replaced_by': HOP})
                    previous_sha = row['sha256']
                else:
                    previous_sha = row['model_refinement']['previous_sha256']
                row.update(sha256=new, bytes=dst.stat().st_size, candidate=f'{REL_RUN}/candidate/models/{dst.name}', candidate_sha256=new,
                           source=record.relative_to(ROOT).as_posix(), source_sha256=sha(record),
                           qa=f'{REL_RUN}/qa/review.json', status='published', runtime_publish_allowed=True,
                           publication_scope=SCOPE, user_overall_art_acceptance='pending')
                if kind == 'unit' and 'triangles' in row:
                    row['triangles'] = next(f['triangles'] for f in json.loads(record.read_text(encoding='utf-8'))['files'] if f['file'] == dst.name)
                row['model_polish'] = {'run': REL_RUN, 'contract': 'art-factory/rts/contracts/model-polish-2026-10-16.json',
                                       'review_page': 'art-factory/rts/review/model-polish-20261016.html', 'user_approval': 'pending'}
                row['model_refinement'] = {'previous_sha256': previous_sha}
                pending.append(row)
                lock_rows.append({'id': base_id, 'lod': lod, 'url': row['url'], 'sha256': previous_sha,
                                  'backup': f'{REL_RUN}/raw/publication-before/models/{dst.name}'})
                bind_rows.append({'id': base_id, 'lod': lod, 'url': row['url'], 'sha256': new, 'source': row['source'],
                                  'source_sha256': row['source_sha256'], 'evidence': f'{REL_RUN}/qa/textures.json',
                                  'evidence_sha256': sha(RUN / 'qa/textures.json'),
                                  'change': CHANGE})
        data['_path'] = path; data['_text'] = text
        pending.append(data)
    lock = RUN / 'source-lock.json'; binding = RUN / 'candidate-sources.json'
    lock.write_text(json.dumps({'run': REL_RUN, 'assets': lock_rows}, indent=2) + '\n', encoding='utf-8')
    binding.write_text(json.dumps({'run': REL_RUN, 'status': 'complete', 'assets': bind_rows}, indent=2) + '\n', encoding='utf-8')
    for item in pending:
        if '_path' in item:
            continue
        item['model_refinement'].update(source_lock=f'{REL_RUN}/source-lock.json', source_lock_sha256=sha(lock),
                                        source_binding=f'{REL_RUN}/candidate-sources.json', source_binding_sha256=sha(binding))
    for item in pending:
        if '_path' in item:
            path, text = item.pop('_path'), item.pop('_text'); dump(path, item, text)
    # Shared material rows.
    path = ROOT / 'art-factory/rts/manifests/detail-material-registry.json'; text = path.read_bytes().decode('utf-8'); data = json.loads(text)
    rows = {r['id']: r for r in data['assets'] if not (r['id'].startswith('polish-v1/') and not (mats / r['id'].split('/', 1)[1]).exists())}
    for f in sorted(mats.iterdir()):
        rid = 'polish-v1/' + f.name
        if rid in rows and not (RUN / 'candidate/materials' / f.name).exists():
            continue  # published by an earlier pass and reused unchanged: keep its provenance row
        rows[rid] = {'id': rid, 'url': f'/assets/games/rts/materials/polish-v1/{f.name}', 'candidate': f'{REL_RUN}/candidate/materials/{f.name}',
                     'sha256': sha(f), 'bytes': f.stat().st_size, 'status': 'published', 'runtime_publish_allowed': True,
                     'source_qa': f'{REL_RUN}/qa/textures.json', 'publication_scope': SCOPE, 'user_overall_art_acceptance': 'pending'}
    data['assets'] = list(rows.values())
    dump(path, data, text)
    # Commercial source audit: runtime unit rows carry the live bytes' hashes.
    path = ROOT / 'art-factory/rts/runs/commercial-readiness/2026-10-09/qa/published-unit-source-audit.json'
    text = path.read_bytes().decode('utf-8'); data = json.loads(text)
    for unit in data['units'].values():
        for row in unit.get('runtime_assets', []):
            row['sha256'] = sha(ROOT / 'public' / row['url'].lstrip('/'))
    data['model_polish_refinement'] = f'{REL_RUN}/qa/review.json'
    dump(path, data, text)
    # Commercial readiness hashes.
    path = ROOT / 'art-factory/rts/manifests/commercial-readiness.json'; text = path.read_bytes().decode('utf-8'); data = json.loads(text)
    hashes = data.get('asset_hashes', {})
    for dst in staged:
        k = 'assets/games/rts/models/' + dst.name
        if k in hashes:
            hashes[k] = sha(dst)
    for k in list(hashes):
        if k.endswith('model-registry.json'):
            hashes[k] = sha(reg_path)
    dump(path, data, text)
    print('staged', [d.name for d in staged], 'materials', len(list(mats.iterdir())))


if __name__ == '__main__':
    stage()
