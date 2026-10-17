"""Package a roster-expansion Blender export with the published unit texture conventions.

* AssemblyDetail_<kind> materials point at the shared ../materials/detail-v1 surfaces exactly as
  all_models_pack.package() writes them for the published worker/guard/priest hands.
* The generated body atlas becomes one content-addressed ../materials/unit-shared/<sha256>.jpg
  file shared by LOD0 and LOD1 (priest convention); the bytes are the prep JPEG, not a re-encode.
* TANGENT is dropped where the material has no normal map; the buffer is losslessly compacted.

Usage: python roster_pack.py --run <run> --unit pikeman
"""
import argparse
import copy
import hashlib
import json
import shutil
from pathlib import Path

from procedural_gauntlet_publish import read_glb, write_glb
from commander_grip_pack import compact

SAMPLER = {'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def detail_material(name, texture):
    kind = name.split('_', 1)[1]
    return {'name': name, 'doubleSided': True,
            'pbrMetallicRoughness': {'metallicFactor': .45 if kind == 'steel' else .55 if kind == 'brass' else 0,
                                     'roughnessFactor': 1, 'baseColorTexture': {'index': texture(kind + '-color.jpg')},
                                     'metallicRoughnessTexture': {'index': texture(kind + '-mr.png')}},
            'normalTexture': {'index': texture(kind + '-normal.png'), 'scale': .10 if kind in ('steel', 'brass') else .16}}


def package(source, target, body_jpeg, body_material, motion=None):
    doc, binary = read_glb(source)
    body_bytes = Path(body_jpeg).read_bytes() if body_jpeg else b''
    body_uri = f'../materials/unit-shared/{sha(body_bytes)}.jpg' if body_jpeg else None
    images, textures, samplers = [], [], [SAMPLER]
    cache = {}

    def texture(uri):
        if uri not in cache:
            images.append({'name': Path(uri).stem, 'uri': uri})
            textures.append({'source': len(images) - 1, 'sampler': 0})
            cache[uri] = len(textures) - 1
        return cache[uri]
    materials = []
    for m in doc['materials']:
        if m['name'].startswith('AssemblyDetail_'):
            materials.append(detail_material(m['name'], lambda f: texture('../materials/detail-v1/' + f)))
        elif m['name'] == body_material:
            out = copy.deepcopy(m)
            out['pbrMetallicRoughness']['baseColorTexture'] = {'index': texture(body_uri)}
            out['doubleSided'] = True
            materials.append(out)
        elif (m['name'].startswith('TeamCloth_') or m['name'] in ('HempString', 'NeutralLinenFletching', 'BareSkinHand')) and 'baseColorTexture' not in m.get('pbrMetallicRoughness', {}):
            out = copy.deepcopy(m)
            out['doubleSided'] = True
            materials.append(out)  # plain team-tinted cloth (runtime /TeamCloth/ tint), no texture
        else:
            raise ValueError('Unmapped material ' + m['name'])
    doc['materials'], doc['images'], doc['textures'], doc['samplers'] = materials, images, textures, samplers
    for mesh in doc['meshes']:
        for p in mesh['primitives']:
            if 'normalTexture' not in materials[p['material']]:
                p['attributes'].pop('TANGENT', None)
    if motion is not None:
        doc['scenes'][doc.get('scene', 0)].setdefault('extras', {})['rtsMotion'] = motion
    added = [k for k in ('skins', 'animations') if k not in doc]  # static props have neither
    for k in added:
        doc[k] = []
    packed, record = compact(doc, binary)
    for k in added:
        doc.pop(k)
    write_glb(target, doc, packed)
    data = Path(target).read_bytes()
    triangles = sum(doc['accessors'][p['indices']]['count'] // 3 for m in doc['meshes'] for p in m['primitives'])
    return {'path': Path(target).as_posix(), 'sha256': sha(data), 'bytes': len(data), 'triangles': triangles,
            'body_texture_uri': body_uri, 'body_texture_sha256': sha(body_bytes) if body_jpeg else None, 'body_texture_bytes': len(body_bytes),
            'packing': record}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--unit', required=True)
    args = parser.parse_args()
    run = args.run
    build = json.loads((run / 'qa/build.json').read_text(encoding='utf-8'))
    body_jpeg = run / 'prep/candidate/body-1024-q90.jpg'
    shared = run / 'materials/unit-shared'
    shared.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(body_jpeg, shared / f'{sha(body_jpeg.read_bytes())}.jpg')
    rows = []
    for lod in (0, 1):
        source = run / f'raw/{args.unit}-edited-lod{lod}.glb'
        target = run / f'candidate/{args.unit}{"-lod1" if lod else ""}.glb'
        row = package(source, target, body_jpeg, f'TeamClothMasked_{args.unit}', build.get('rtsMotion'))
        row.update(lod=lod, source=source.as_posix(), source_sha256=sha(source.read_bytes()))
        rows.append(row)
    (run / 'qa/pack.json').write_text(json.dumps(rows, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps([{k: r[k] for k in ('lod', 'bytes', 'triangles', 'sha256')} for r in rows]))


if __name__ == '__main__':
    main()
