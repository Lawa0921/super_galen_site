"""Publish reviewed props from their immutable, mechanically verified runs."""
from pathlib import Path
import hashlib
import json
import shutil
import struct

ROOT = Path(__file__).resolve().parents[3]
FACTORY = ROOT / 'art-factory/rts'
RUNTIME = ROOT / 'public/assets/games/rts'
RUNS = {'oak': '2026-10-04-oak-v2', **{asset: '2026-10-04-original' for asset in ('rock', 'gold-mine', 'timber-pile')}}


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8', newline='\n')


registry_path = RUNTIME / 'model-registry.json'
registry = json.loads(registry_path.read_text(encoding='utf-8'))
records = []
for asset_id, run_id in RUNS.items():
    run = FACTORY / 'runs/kingdom-props' / run_id
    qa_path = run / 'qa/structural.json'
    qa = json.loads(qa_path.read_text(encoding='utf-8'))
    assert qa['status'] == 'pass'
    record = next(asset for asset in qa['assets'] if asset['id'] == asset_id)
    assert record['pass'] and all(record['checks'].values()), asset_id
    source = run / 'candidate' / (asset_id + '.glb')
    blend = run / 'raw' / (asset_id + '.blend')
    raw = source.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == record['sha256_glb']
    assert hashlib.sha256(blend.read_bytes()).hexdigest() == record['sha256_blend']
    magic, version, length = struct.unpack('<4sII', raw[:12])
    assert magic == b'glTF' and version == 2 and length == len(raw)
    target = RUNTIME / 'models' / source.name
    shutil.copyfile(source, target)
    entry = {'url': f'/assets/games/rts/models/{source.name}', 'status': 'published', 'scale': 1, 'yaw': 0}
    registry['assets'][asset_id] = entry
    records.append({'id': asset_id, **entry, 'sha256': record['sha256_glb'], 'bytes': len(raw),
                    'candidate': source.relative_to(ROOT).as_posix(), 'source': blend.relative_to(ROOT).as_posix(),
                    'qa': qa_path.relative_to(ROOT).as_posix(),
                    'visual_review': 'Root reviewed reimport contact sheets, oak revision comparison and real browser assembly',
                    'assembly_review': 'Resource harvesting and construction passed in actual browser; unit art remains a test fixture',
                    'runtime_publish_allowed': True})
write_json(registry_path, registry)
write_json(FACTORY / 'manifests/prop-registry.json', {'assets': records})
contract_path = FACTORY / 'contracts/kingdom-props.json'
contract = json.loads(contract_path.read_text(encoding='utf-8'))
contract.update({'status': 'published', 'runtime_publish_allowed': True,
                 'active_runs': RUNS, 'assembly_human_review': 'root-browser-reviewed',
                 'runtime_oak_scale': [0.48, 0.645],
                 'runtime_scale_reason': 'Reduced canopy height keeps workers and adjacent resources readable from the RTS camera'})
for revision in contract['revisions']:
    if revision['run_id'] == RUNS['oak']:
        revision.update({'status': 'published', 'runtime_publish_allowed': True})
write_json(contract_path, contract)
profile_path = FACTORY / 'profile.json'
profile = json.loads(profile_path.read_text(encoding='utf-8'))
if 'manifests/prop-registry.json' not in profile['registries']:
    profile['registries'].append('manifests/prop-registry.json')
write_json(profile_path, profile)
print(json.dumps({'published': len(records), 'bytes': sum(record['bytes'] for record in records)}))
