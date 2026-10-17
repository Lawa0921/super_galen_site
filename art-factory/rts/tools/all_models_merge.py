"""Assemble final screenshots only from complete, current-SHA browser captures."""
import hashlib
import json
import shutil
import sys
from pathlib import Path
from urllib.parse import urlparse


def merge_captures(assets, hashes, reports):
    rows = {}
    served = {}
    for report in reports:
        assert not report['errors'], ('Browser errors', report['errors'])
        local = {}
        for file in report['servedAssets']:
            url = urlparse(file['url']).path
            if url not in hashes:
                continue
            assert file['status'] == 200, ('HTTP failure', url)
            assert file['sha256'] == hashes[url], ('Stale browser asset', url)
            local[url] = file
        for row in report['rows']:
            ident = row['id']
            assert ident not in rows, ('Duplicate model', ident)
            assert ident in assets, ('Unknown model', ident)
            for key in ('url', 'lod1'):
                if assets[ident].get(key):
                    assert assets[ident][key] in local, ('Missing served asset', ident, key)
            rows[ident] = row
        served.update(local)
    assert set(rows) == set(assets), ('Incomplete model coverage', sorted(set(assets) - set(rows)))
    return {'phase': 'final', 'errors': [], 'rows': [rows[key] for key in assets],
            'servedAssets': [served[key] for key in hashes]}


def main():
    root = Path(__file__).resolve().parents[3]
    run = root / 'art-factory/rts/runs/all-models/2026-10-14-v1'
    phases = sys.argv[1:] or ['final-static', 'final-units-stable', 'final-guard', 'final-knight', 'final-crossbow']
    assets = json.loads((run / 'review-manifest.json').read_bytes())['assets']
    names = [Path(row[key]).name for row in assets.values() for key in ('url', 'lod1') if row.get(key)]
    assert len(set(names)) == len(names), 'Duplicate candidate basename'
    hashes = {}
    for row in assets.values():
        for key in ('url', 'lod1'):
            if not row.get(key):
                continue
            original = root / 'public' / row[key].lstrip('/')
            candidate = run / 'candidate' / original.name
            hashes[row[key]] = hashlib.sha256((candidate if candidate.exists() else original).read_bytes()).hexdigest()
    reports = [json.loads((run / 'qa' / phase / 'browser.json').read_bytes()) for phase in phases]
    result = merge_captures(assets, hashes, reports)
    result['sourceLock'] = json.loads((run / 'source-lock.json').read_bytes())
    result['captureSources'] = phases
    target = run / 'qa/final'
    target.mkdir(exist_ok=True)
    for phase, report in zip(phases, reports):
        for row in report['rows']:
            for shot in row['shots']:
                shutil.copyfile(run / 'qa' / phase / shot, target / shot)
    (target / 'browser.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
    print(json.dumps({'models': len(result['rows']), 'files': len(result['servedAssets']),
                      'shots': sum(len(row['shots']) for row in result['rows'])}))


if __name__ == '__main__':
    main()
