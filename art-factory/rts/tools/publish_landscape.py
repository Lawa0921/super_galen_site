"""Publish generated ground tiles only after candidate and actual assembly QA."""
import json
import shutil
from pathlib import Path
from terrain_detail_process import sha256

root = Path(__file__).resolve().parents[3]
factory = root / 'art-factory/rts'
run = factory / 'runs/landscape-enrichment/2026-10-05'
def read(path):
    return json.loads(path.read_text(encoding='utf-8'))
def write(path, value):
    path.write_bytes((json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
report = read(run / 'qa/materials.json')
review = read(run / 'qa/root-review.json')
assembly = read(run / 'qa/after-v3/assembly.json')
layout = read(run / 'qa/layout-review.json')
assert report['mechanical'] == 'passed'
assert review['status'] == 'approved-for-runtime'
assert layout['status'] == 'approved-for-local-preview'
assert {r['map'] for r in assembly['results']} == {'river', 'pass'}
assert all(not r['errors'] for r in assembly['results'])
records = []
for asset in report['assets']:
    name = asset['id']
    source = run / f'candidate/{name}.webp'
    assert sha256(source) == asset['sha256']
    target = root / f'public/assets/games/rts/terrain/{name}.webp'
    shutil.copyfile(source, target)
    assert sha256(target) == sha256(source)
    records.append({'id': name, 'status': 'published', 'url': f'/assets/games/rts/terrain/{name}.webp',
                    'bytes': target.stat().st_size, 'sha256': sha256(target),
                    'raw': (run / 'raw/terrain-atlas.png').relative_to(root).as_posix(),
                    'raw_sha256': report['source_sha256'], 'source': 'builtin-imagegen',
                    'prompt': (run / 'prompts/terrain-atlas.txt').relative_to(root).as_posix(),
                    'candidate': source.relative_to(root).as_posix(),
                    'postprocess': 'art-factory/rts/tools/landscape_materials.py',
                    'qa': (run / 'qa/root-review.json').relative_to(root).as_posix(),
                    'runtime_publish_allowed': True})
registry = read(factory / 'manifests/terrain-registry.json')
ids = {r['id'] for r in records}
registry['assets'] = [a for a in registry['assets'] if a['id'] not in ids] + records
write(factory / 'manifests/terrain-registry.json', registry)
contract = read(factory / 'contracts/landscape-enrichment.json')
contract.update(status='published', runtime_publish_allowed=True,
                status_scope='four generated terrain texture assets',
                assembly_human_review='root material review and independent landscape v3 assembly review passed',
                landscape_assembly_status=layout['status'],
                user_overall_art_acceptance='pending-user-preview')
write(factory / 'contracts/landscape-enrichment.json', contract)
screens = read(factory / 'manifests/screen-breakdown.json')
screens['screens'] = [s for s in screens['screens'] if s['id'] != 'rts-landscape-enrichment']
screens['screens'].append({'id': 'rts-landscape-enrichment', 'assets': sorted(ids),
                          'contract': 'art-factory/rts/contracts/landscape-enrichment.json',
                          'runtime': '/games/rts battlefield', 'evidence': run.relative_to(root).as_posix(),
                          'user_overall_art_acceptance': 'pending-user-preview'})
write(factory / 'manifests/screen-breakdown.json', screens)
print(json.dumps({'published': len(records), 'bytes': sum(r['bytes'] for r in records)}))
