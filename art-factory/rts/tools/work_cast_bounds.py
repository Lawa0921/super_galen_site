"""Promote frozen 60 Hz WebGL samples to conservative candidate-only metadata.

Requires work-cast-diagnose evidence and verifies the sampled asset hashes.
"""
import hashlib
import json
from pathlib import Path

from animation_bounds import update_bounds, validate_sample_times
from procedural_gauntlet_publish import read_glb, write_glb

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / 'art-factory/rts/runs/work-cast/2026-10-11-v2'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def main():
    audit = json.loads((RUN / 'qa/diagnosis/report.json').read_text(encoding='utf-8'))
    prepared = []
    for unit in audit:
        hashes = unit['assets']
        for lod, samples in enumerate(unit['bounds']):
            file = RUN / f"candidate/{unit['unit']}-lod{lod}.glb"
            before = hashlib.sha256(file.read_bytes()).hexdigest()
            require(before == hashes[lod]['sha256'], 'Candidate changed since sampling')
            require(samples['sampling']['sampleHz'] == 60 and samples['sampling']['includesBindPose'], 'Incomplete bind/60 Hz sampling')
            require(samples['sourceNodes'] and not any(e['code'] not in ('bounds_outside', 'bounds_missing_or_invalid', 'runtime_bounds_missing') for e in samples['errors']), 'Unexpected sampling failure')
            doc, binary = read_glb(file)
            require(sorted(c['name'] for c in samples['clips']) == sorted(c['name'] for c in doc['animations']), 'Incomplete clips')
            for clip in samples['clips']:
                validate_sample_times(clip)
            updated = update_bounds(doc, samples['sourceNodes'])
            prepared.append((file, updated, binary, before))
    require(len(prepared) == 6, 'Expected six candidates')
    rows = []
    archive = RUN / 'raw/before-bounds'; archive.mkdir(exist_ok=True)
    for file, doc, binary, before in prepared:
        backup = archive / file.name
        require(not backup.exists(), 'Do not overwrite earlier candidate evidence')
        backup.write_bytes(file.read_bytes())
        write_glb(file, doc, binary)
        rows.append({'file': file.relative_to(ROOT).as_posix(), 'before_sha256': before,
                     'after_sha256': hashlib.sha256(file.read_bytes()).hexdigest()})
    (RUN / 'qa/bounds-append.json').write_text(json.dumps({'runtime_publish_allowed': False, 'margin_m': .05,
        'evidence': 'qa/diagnosis-before-bounds/report.json', 'assets': rows}, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(rows))


if __name__ == '__main__':
    main()
