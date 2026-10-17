"""Apply frozen full-animation samples to candidate metadata, preserving all art."""
import hashlib
import json
from copy import deepcopy
from pathlib import Path

from animation_bounds import update_bounds, validate_sample_times
from procedural_gauntlet_publish import read_glb, write_glb

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / 'art-factory/rts/runs/visual-revision/2026-10-16-unit-bounds-v1'


def without_bounds(doc):
    result = deepcopy(doc)
    for node in result['nodes']:
        extras = node.get('extras')
        if extras is not None:
            extras.pop('rtsConservativeBounds', None)
            if not extras:
                node.pop('extras')
    return result


def main():
    evidence = json.loads((RUN / 'qa/before.json').read_text(encoding='utf-8'))
    assert {r['id'] for r in evidence['assets']} == {'guard', 'guard-lod1', 'knight', 'knight-lod1'}
    prepared = []
    for row in evidence['assets']:
        source = ROOT / row['file']
        raw = source.read_bytes()
        assert hashlib.sha256(raw).hexdigest() == row['sha256']
        assert row['sampling']['sampleHz'] == 60 and row['sampling']['includesBindPose']
        assert row['sourceNodes'] and all(e['code'] in (
            'bounds_outside', 'bounds_missing_or_invalid', 'runtime_bounds_missing'
        ) for e in row['errors'])
        doc, binary = read_glb(source)
        assert sorted(c['name'] for c in row['clips']) == sorted(c['name'] for c in doc['animations'])
        for clip in row['clips']:
            validate_sample_times(clip)
        updated = update_bounds(doc, row['sourceNodes'], margin=.05)
        assert without_bounds(updated) == without_bounds(doc)
        target = RUN / 'candidate' / source.name
        backup = RUN / 'raw/before' / source.name
        assert not target.exists() and not backup.exists(), 'Preserve prior evidence'
        prepared.append((row, raw, updated, binary, target, backup))
    results = []
    for row, raw, doc, binary, target, backup in prepared:
        target.parent.mkdir(parents=True, exist_ok=True)
        backup.parent.mkdir(parents=True, exist_ok=True)
        backup.write_bytes(raw)
        write_glb(target, doc, binary)
        actual, actual_binary = read_glb(target)
        assert actual == doc and actual_binary == binary
        results.append({'id': row['id'], 'source': row['file'], 'source_sha256': row['sha256'],
                        'file': target.relative_to(ROOT).as_posix(),
                        'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
                        'skinned_nodes': len(row['sourceNodes']), 'bin_unchanged': True,
                        'only_conservative_bounds_metadata_changed': True})
    report = {'assets': results, 'sampling_evidence': 'qa/before.json', 'sample_hz': 60,
              'margin_m': .05, 'old_spheres_preserved_by_union': True,
              'runtime_publish_allowed': False, 'user_art_approval': False}
    (RUN / 'qa/append.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
