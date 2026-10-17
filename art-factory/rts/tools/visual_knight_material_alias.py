"""Alias verified identical equipment materials; preserve every art payload byte."""
import hashlib
import json
from copy import deepcopy
from pathlib import Path
from detail_materials import read_glb, write_glb

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / 'art-factory/rts/runs/visual-revision/2026-10-16-complete-v3'
RUN = ROOT / 'art-factory/rts/runs/visual-revision/2026-10-16-knight-material-alias-v1'
ALIASES = {8: 0, 9: 1, 6: 5}


def surface(doc, index):
    material = deepcopy(doc['materials'][index])
    name = material.pop('name')
    assert 'teamcloth' not in name.lower()
    assert set(material) == {'doubleSided', 'normalTexture', 'pbrMetallicRoughness'}
    pbr = material['pbrMetallicRoughness']
    assert set(pbr) == {'baseColorTexture', 'metallicRoughnessTexture'}
    for info in (material['normalTexture'], pbr['baseColorTexture'], pbr['metallicRoughnessTexture']):
        info['index'] = doc['textures'][info['index']]
    return material


def main():
    rows = []
    for name in ('knight', 'knight-lod1'):
        source = BASE / 'candidate' / (name + '.glb')
        target = RUN / 'candidate' / source.name
        assert not target.exists(), 'Preserve earlier candidates'
        doc, binary = read_glb(source)
        for old, new in ALIASES.items():
            assert surface(doc, old) == surface(doc, new), 'Material surface differs'
        updated = deepcopy(doc)
        for mesh in updated['meshes']:
            for primitive in mesh['primitives']:
                primitive['material'] = ALIASES.get(primitive['material'], primitive['material'])
        target.parent.mkdir(parents=True, exist_ok=True)
        write_glb(target, updated, binary)
        actual, actual_binary = read_glb(target)
        assert actual == updated and actual_binary == binary
        rows.append({'id': name, 'source': source.relative_to(ROOT).as_posix(),
                     'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                     'file': target.relative_to(ROOT).as_posix(),
                     'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
                     'bin_unchanged': True, 'material_surfaces_identical': True})
    (RUN / 'qa').mkdir(exist_ok=True)
    (RUN / 'qa/material-alias.json').write_text(json.dumps({'assets': rows,
        'aliases': ALIASES, 'scope': 'Primitive material references only; textures, parameters and all geometry/animation unchanged',
        'runtime_publish_allowed': False, 'user_art_approval': False}, indent=2) + '\n')
    print(json.dumps(rows))


if __name__ == '__main__':
    main()
