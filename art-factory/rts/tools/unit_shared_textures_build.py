"""Build a fresh frozen-source candidate package; never writes public files."""
from pathlib import Path
import gzip
import hashlib
import json
import shutil
import struct
from unit_shared_textures import externalize_images, verify_externalization, require

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / 'art-factory/rts/runs/unit-shared-textures/2026-10-09-v1'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_glb(data):
    require(len(data) >= 20, 'Truncated GLB')
    magic, version, total = struct.unpack_from('<III', data)
    require(magic == 0x46546c67 and version == 2 and total == len(data), 'Invalid GLB header')
    chunks, offset = {}, 12
    while offset < len(data):
        require(offset + 8 <= len(data), 'Truncated chunk header')
        length, kind = struct.unpack_from('<II', data, offset)
        require(offset + 8 + length <= len(data) and kind not in chunks, 'Invalid or duplicate chunk')
        chunks[kind] = data[offset + 8:offset + 8 + length]
        offset += 8 + length
    require(set(chunks) <= {0x4e4f534a, 0x004e4942} and 0x4e4f534a in chunks, 'Unsupported GLB chunks')
    return json.loads(chunks[0x4e4f534a]), chunks.get(0x004e4942, b'')


def write_glb(document, binary):
    text = json.dumps(document, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    text += b' ' * ((-len(text)) % 4)
    binary += b'\0' * ((-len(binary)) % 4)
    return (struct.pack('<III', 0x46546c67, 2, 28 + len(text) + len(binary))
            + struct.pack('<II', len(text), 0x4e4f534a) + text
            + struct.pack('<II', len(binary), 0x004e4942) + binary)


def main():
    require(not RUN.exists(), 'Candidate run exists; create a new version instead of overwriting')
    for folder in ['raw/models', 'raw/tools', 'candidate/models', 'candidate/materials/unit-shared', 'qa']:
        (RUN / folder).mkdir(parents=True)
    registry = ROOT / 'art-factory/rts/manifests/unit-registry.json'
    shutil.copy2(registry, RUN / 'raw/unit-registry.json')
    shutil.copy2(ROOT / 'public/assets/games/rts/model-registry.json', RUN / 'raw/model-registry.json')
    shutil.copy2(ROOT / 'art-factory/rts/contracts/unit-shared-textures.json', RUN / 'contract.json')
    for name in ['unit_shared_textures.py', 'unit_shared_textures_test.py', 'unit_shared_textures_build.py']:
        shutil.copy2(Path(__file__).with_name(name), RUN / 'raw/tools' / name)
    rows, images = [], {}
    for asset in json.loads(registry.read_text(encoding='utf-8'))['assets']:
        require(asset.get('status') == 'published', 'Source asset is not current published baseline')
        path = ROOT / ('public' + asset['url'])
        original = path.read_bytes()
        require(sha(original) == asset['sha256'], 'Source registry SHA mismatch: ' + asset['id'])
        (RUN / 'raw/models' / path.name).write_bytes(original)
        doc, binary = read_glb(original)
        out, data, files = externalize_images(doc, binary)
        verify_externalization(doc, binary, out, data, files)
        candidate = write_glb(out, data)
        reloaded, reloaded_binary = read_glb(candidate)
        verify_externalization(doc, binary, reloaded, reloaded_binary, files)
        (RUN / 'candidate/models' / path.name).write_bytes(candidate)
        for uri, payload in files.items():
            destination = RUN / 'candidate/materials/unit-shared' / uri.rsplit('/', 1)[-1]
            if destination.exists():
                require(destination.read_bytes() == payload, 'Shared image hash collision')
            else:
                destination.write_bytes(payload)
            row = images.setdefault(uri, {'sha256': sha(payload), 'bytes': len(payload), 'models': []})
            row['models'].append(asset['id'])
        rows.append({'id': asset['id'], 'url': asset['url'], 'source_sha256': sha(original),
                     'candidate_sha256': sha(candidate), 'source_bytes': len(original),
                     'candidate_bytes': len(candidate), 'source_gzip6': len(gzip.compress(original, compresslevel=6, mtime=0)),
                     'candidate_gzip6': len(gzip.compress(candidate, compresslevel=6, mtime=0)),
                     'extracted_image_uris': list(files), 'semantic_all_buffer_views_and_images_parity': True})
    before = sum(row['source_gzip6'] for row in rows)
    after = sum(row['candidate_gzip6'] for row in rows) + sum(image['bytes'] for image in images.values())
    report = {'status': 'CANDIDATE_EXACT_BYTE_PARITY_PASSED', 'runtime_publish_allowed': False,
              'commercial_quality_approved': False, 'source_rights_status': 'Unchanged; guard/worker blocked',
              'models': rows, 'images': images, 'source_gzip6_sum': before,
              'candidate_gzip6_plus_identity_images_sum': after,
              'estimated_saving_bytes': before - after,
              'transport_note': 'Sum of one request per model/shared image; actual browser duplicate loads/cache and map download still require measurement'}
    (RUN / 'qa/byte-parity.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps({key: report[key] for key in ['status', 'source_gzip6_sum', 'candidate_gzip6_plus_identity_images_sum', 'estimated_saving_bytes']}))
    print(json.dumps({'models': len(rows), 'unique_images': len(images), 'runtime_changed': False}))


if __name__ == '__main__':
    main()
