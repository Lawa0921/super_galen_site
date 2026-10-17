"""Stage model polish round 3 (2026-10-17) candidates onto this branch's runtime paths and refresh every registry.

Usage: python art-factory/rts/tools/model_polish_r3_stage.py
- public/assets/games/rts/models/<file>.glb  <- run candidate/models/<file>.glb (first run snapshots the replaced file
  into raw/publication-before/models/, so the stage is reversible and reruns rebuild from the same baseline)
- public/assets/games/rts/materials/polish-v2/* <- run candidate/materials/* that a published GLB references;
  polish-v1 files no published GLB references any more are removed (their registry rows are dropped)
- model-registry.json sha256 / lod1Sha256; unit / building / prop registry rows (previous version kept, status
  published, user_overall_art_acceptance pending); unit rows get a model_refinement hop (source lock + binding) that
  unit-source-rights.test.ts walks; detail-material-registry polish-v2 rows; commercial-readiness + unit source audit
  hashes. Record per file: qa/<id>-r3.json for units, qa/buildings.json, qa/props.json.
"""
from pathlib import Path
import hashlib, json, shutil

ROOT = Path(__file__).resolve().parents[3]
REL_RUN = 'art-factory/rts/runs/model-polish/2026-10-17-v1'
RUN = ROOT / REL_RUN
PUB = ROOT / 'public/assets/games/rts'
HOP = 'model-polish-r3-2026-10-17'
CONTRACT = 'art-factory/rts/contracts/model-polish-2026-10-16.json'
REVIEW = 'art-factory/rts/review/model-polish-20261016.html#round3'
SCOPE = 'local branch feat/browser-rts-model-polish only; not merged, not deployed; awaiting user approval in /games/rts/models/'
CHANGE = 'model polish round 3 2026-10-17: shield rivets/corner, walnut wood, worker cuff, barracks relief, 1024 shared landmark/prop maps, canopy density'


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def load_text(p):
    text = Path(p).read_bytes().decode('utf-8'); return json.loads(text), text


def dump(p, data, original_text):
    text = json.dumps(data, indent=2, ensure_ascii=False) + '\n'
    if '\r\n' in original_text:
        text = text.replace('\n', '\r\n')
    Path(p).write_bytes(text.encode('utf-8'))


def glb_uris(path):
    raw = path.read_bytes(); n = int.from_bytes(raw[12:16], 'little'); doc = json.loads(raw[20:20 + n])
    return [im['uri'] for im in doc.get('images', []) if 'uri' in im]


def record_for(file_id):
    base = file_id.removesuffix('-lod1')
    for rel in (f'qa/{base}-r3.json', 'qa/buildings.json', 'qa/props.json'):
        p = RUN / rel
        if p.exists():
            data = json.loads(p.read_text(encoding='utf-8'))
            rows = data if isinstance(data, list) else data.get('files', [])
            if any(r.get('file') in (f'{file_id}.glb', f'props/{file_id}.glb') for r in rows):
                return p
    raise KeyError(file_id)


def stage():
    staged = []
    for src in sorted((RUN / 'candidate/models').rglob('*.glb')):
        rel = src.relative_to(RUN / 'candidate/models')
        dst = PUB / 'models' / rel
        snap = RUN / 'raw/publication-before/models' / rel
        if not snap.exists():
            snap.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(dst, snap)
        shutil.copy2(src, dst); staged.append(dst)
    # Shared maps actually referenced by published GLBs.
    referenced = set()
    for glb in sorted((PUB / 'models').rglob('*.glb')):
        referenced.update(Path(u).as_posix().split('materials/', 1)[1] for u in glb_uris(glb) if 'materials/polish-v' in u)
    v2 = PUB / 'materials/polish-v2'; v2.mkdir(parents=True, exist_ok=True)
    for old in list(v2.iterdir()):
        if f'polish-v2/{old.name}' not in referenced:
            old.unlink()
    for rel in sorted(referenced):
        if rel.startswith('polish-v2/'):
            shutil.copy2(RUN / 'candidate/materials' / rel.split('/', 1)[1], PUB / 'materials' / rel)
    # The courtyard-earth PNG retires once no GLB references it (terrain-registry row follows).
    court_png = PUB / 'terrain/dirt-road.png'
    if court_png.exists() and not any(u.endswith('terrain/dirt-road.png') for glb in (PUB / 'models').rglob('*.glb') for u in glb_uris(glb)):
        court_png.unlink()
        path = ROOT / 'art-factory/rts/manifests/terrain-registry.json'; data, text = load_text(path)
        for row in data.get('assets', []):
            if row.get('id') == 'courtyard-earth' and row.get('runtime', '').endswith('.png'):
                row.setdefault('previous_versions', []).append({k: row.get(k) for k in ('runtime', 'sha256', 'bytes')})
                c = RUN / 'candidate/materials/courtyard-earth-color.jpg'
                row.update(runtime='/assets/games/rts/materials/polish-v2/courtyard-earth-color.jpg', sha256=sha(c), bytes=c.stat().st_size,
                           runtime_encoding={'qa': f'{REL_RUN}/qa/textures.json', 'note': 'JPEG q90 re-encode of the lossless PNG decode'})
        dump(path, data, text)
        path = ROOT / 'art-factory/rts/manifests/commercial-readiness.json'; data, text = load_text(path)
        h = data.get('asset_hashes', {})
        if h.pop('assets/games/rts/terrain/dirt-road.png', None) is not None:
            h['assets/games/rts/materials/polish-v2/courtyard-earth-color.jpg'] = sha(RUN / 'candidate/materials/courtyard-earth-color.jpg')
        dump(path, data, text)
    removed_v1 = []
    for old in sorted((PUB / 'materials/polish-v1').iterdir()):
        if f'polish-v1/{old.name}' not in referenced:
            old.unlink(); removed_v1.append(old.name)
    # Runtime registry.
    reg_path = PUB / 'model-registry.json'; reg, text = load_text(reg_path)
    for dst in staged:
        stem = dst.stem; lod1 = stem.endswith('-lod1'); key = stem[:-5] if lod1 else stem
        if key in reg['assets']:
            reg['assets'][key]['lod1Sha256' if lod1 else 'sha256'] = sha(dst)
    dump(reg_path, reg, text)
    # Factory registries.
    lock_rows, bind_rows, unit_rows, docs = [], [], [], []
    for kind in ('unit', 'building', 'prop'):
        path = ROOT / f'art-factory/rts/manifests/{kind}-registry.json'; data, text = load_text(path)
        for row in data['assets']:
            dst = PUB / row['url'].removeprefix('/assets/games/rts/') if row.get('url') else PUB / 'models' / (row['id'] + '.glb')
            if dst not in staged:
                continue
            new = sha(dst); lod = 1 if row['id'].endswith('-lod1') else 0; base_id = row['id'].removesuffix('-lod1')
            already = row.get('model_polish', {}).get('run') == REL_RUN
            if not already and row.get('sha256') == new:
                continue
            if already:
                previous_sha = row['model_refinement']['previous_sha256'] if kind == 'unit' else row['model_polish']['previous_sha256']
            else:
                prev = {k: v for k, v in row.items() if k != 'previous_versions'}
                row.setdefault('previous_versions', []).append({**prev, 'replaced_by': HOP})
                previous_sha = row['sha256']
            record = record_for(row['id'])
            row.update(sha256=new, bytes=dst.stat().st_size, candidate=f'{REL_RUN}/candidate/models/{dst.name}', candidate_sha256=new,
                       qa=f'{REL_RUN}/qa/review.json', status='published', runtime_publish_allowed=True,
                       publication_scope=SCOPE, user_overall_art_acceptance='pending')
            if kind == 'unit':
                row.update(source=record.relative_to(ROOT).as_posix(), source_sha256=sha(record))
                files = json.loads(record.read_text(encoding='utf-8'))['files']
                if 'triangles' in row:
                    row['triangles'] = next(f['triangles'] for f in files if f['file'] == dst.name)
            else:
                row['model_polish_record'] = record.relative_to(ROOT).as_posix()
                row['model_polish_record_sha256'] = sha(record)
            if kind == 'prop' and not lod and row.get('lod1'):
                lod1 = PUB / 'models' / f'{base_id}-lod1.glb'
                row.update(lod1_sha256=sha(lod1), lod1_bytes=lod1.stat().st_size, lod1_candidate=f'{REL_RUN}/candidate/models/{lod1.name}')
            row['model_polish'] = {'run': REL_RUN, 'contract': CONTRACT, 'review_page': REVIEW, 'user_approval': 'pending', 'previous_sha256': previous_sha}
            if kind == 'unit':
                row['model_refinement'] = {'previous_sha256': previous_sha}
                unit_rows.append(row)
                lock_rows.append({'id': base_id, 'lod': lod, 'url': row['url'], 'sha256': previous_sha,
                                  'backup': f'{REL_RUN}/raw/publication-before/models/{dst.name}'})
                bind_rows.append({'id': base_id, 'lod': lod, 'url': row['url'], 'sha256': new, 'source': row['source'],
                                  'source_sha256': row['source_sha256'], 'evidence': f'{REL_RUN}/qa/textures.json',
                                  'evidence_sha256': sha(RUN / 'qa/textures.json'), 'change': CHANGE})
        docs.append((path, data, text))
    lock = RUN / 'source-lock.json'; binding = RUN / 'candidate-sources.json'
    if lock_rows:
        lock.write_text(json.dumps({'run': REL_RUN, 'assets': lock_rows}, indent=2) + '\n', encoding='utf-8')
        binding.write_text(json.dumps({'run': REL_RUN, 'status': 'complete', 'assets': bind_rows}, indent=2) + '\n', encoding='utf-8')
        for row in unit_rows:
            row['model_refinement'].update(source_lock=f'{REL_RUN}/source-lock.json', source_lock_sha256=sha(lock),
                                           source_binding=f'{REL_RUN}/candidate-sources.json', source_binding_sha256=sha(binding))
    for path, data, text in docs:
        dump(path, data, text)
    # Shared material rows.
    path = ROOT / 'art-factory/rts/manifests/detail-material-registry.json'; data, text = load_text(path)
    rows = {r['id']: r for r in data['assets'] if not (r['id'].startswith('polish-v1/') and r['id'].split('/', 1)[1] in removed_v1)}
    rows = {k: v for k, v in rows.items() if not k.startswith('polish-v2/')}
    for f in sorted(v2.iterdir()):
        rid = 'polish-v2/' + f.name
        rows[rid] = {'id': rid, 'url': f'/assets/games/rts/materials/polish-v2/{f.name}', 'candidate': f'{REL_RUN}/candidate/materials/{f.name}',
                     'sha256': sha(f), 'bytes': f.stat().st_size, 'status': 'published', 'runtime_publish_allowed': True,
                     'source_qa': f'{REL_RUN}/qa/textures.json', 'publication_scope': SCOPE, 'user_overall_art_acceptance': 'pending'}
    data['assets'] = list(rows.values()); dump(path, data, text)
    # Commercial unit source audit + readiness hashes.
    path = ROOT / 'art-factory/rts/runs/commercial-readiness/2026-10-09/qa/published-unit-source-audit.json'; data, text = load_text(path)
    for unit in data['units'].values():
        for row in unit.get('runtime_assets', []):
            row['sha256'] = sha(ROOT / 'public' / row['url'].lstrip('/'))
    data['model_polish_r3_refinement'] = f'{REL_RUN}/qa/review.json'; dump(path, data, text)
    path = ROOT / 'art-factory/rts/manifests/commercial-readiness.json'; data, text = load_text(path)
    hashes = data.get('asset_hashes', {})
    for dst in staged:
        k = dst.relative_to(PUB.parent.parent).as_posix()
        if k in hashes:
            hashes[k] = sha(dst)
    for k in list(hashes):
        if k.endswith('model-registry.json'):
            hashes[k] = sha(reg_path)
    dump(path, data, text)
    print('staged', [d.name for d in staged], 'polish-v2', sorted(p.name for p in v2.iterdir()), 'removed polish-v1', removed_v1)


if __name__ == '__main__':
    stage()
