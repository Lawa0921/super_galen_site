"""Lossless embedded-image externalization; candidate-only authoring helper."""
from copy import deepcopy
from collections import Counter
import hashlib
import json

SUPPORTED_EXTENSIONS = {
    'KHR_materials_specular', 'KHR_materials_ior', 'KHR_materials_transmission',
    'KHR_materials_clearcoat', 'KHR_materials_sheen', 'KHR_materials_unlit',
    'KHR_materials_emissive_strength', 'KHR_materials_volume',
    'KHR_materials_anisotropy', 'KHR_materials_iridescence',
    'KHR_texture_transform', 'KHR_lights_punctual', 'KHR_mesh_quantization',
    'KHR_draco_mesh_compression', 'EXT_mesh_gpu_instancing',
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def walk(value):
    if isinstance(value, dict):
        yield value
        for key, child in value.items():
            if key != 'extras':
                yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def view_range(document, binary, index):
    views = document.get('bufferViews', [])
    require(type(index) is int and 0 <= index < len(views), 'bufferView index outside range')
    view = views[index]
    start, length = view.get('byteOffset', 0), view.get('byteLength')
    require(view.get('buffer') == 0 and type(start) is int and type(length) is int
            and start >= 0 and length > 0 and start + length <= len(binary)
            and start + length <= document['buffers'][0]['byteLength'], 'bufferView bounds invalid')
    return start, start + length


def externalize_images(document, binary):
    """Return a rewritten copy, compact BIN, and exact encoded image bytes by URI.

    Supported input is a single-buffer GLB document. Geometry bufferView bytes,
    including interleaved data, sparse data and animation curves, are copied
    unchanged. This function performs no filesystem writes or art approval.
    """
    out = deepcopy(document)
    embedded = [image for image in out.get('images', []) if 'bufferView' in image]
    if not embedded:
        return out, bytes(binary), {}
    buffers = out.get('buffers', [])
    require(len(buffers) == 1 and 'uri' not in buffers[0], 'Requires a single embedded buffer')
    require(type(buffers[0].get('byteLength')) is int and 0 <= buffers[0]['byteLength'] <= len(binary),
            'Single embedded buffer length outside bounds')
    for node in walk(out):
        unsupported = set(node.get('extensions', {})) - SUPPORTED_EXTENSIONS
        require(not unsupported, f'Unsupported extensions for lossless relocation: {sorted(unsupported)}')
    unsupported = (set(out.get('extensionsUsed', [])) | set(out.get('extensionsRequired', []))) - SUPPORTED_EXTENSIONS
    require(not unsupported, f'Unsupported extensions for lossless relocation: {sorted(unsupported)}')
    ranges = [view_range(out, binary, i) for i in range(len(out.get('bufferViews', [])))]
    image_views = set()
    files = {}
    for image in embedded:
        index = image['bufferView']
        start, end = view_range(out, binary, index)
        require('uri' not in image, 'Embedded image cannot also have a URI')
        mime = image.get('mimeType')
        require(mime in ('image/jpeg', 'image/png'), f'Unsupported image MIME: {mime}')
        data = bytes(binary[start:end])
        suffix = '.jpg' if mime == 'image/jpeg' else '.png'
        uri = '../materials/unit-shared/' + hashlib.sha256(data).hexdigest() + suffix
        files[uri] = data
        del image['bufferView']
        image['uri'] = uri
        image_views.add(index)
    for node in walk(out):
        if 'bufferView' in node:
            require(node['bufferView'] not in image_views, 'Removed image bufferView is referenced by non-image data')
    for i in image_views:
        a, b = ranges[i]
        for j, (c, d) in enumerate(ranges):
            require(j in image_views or max(a, c) >= min(b, d), 'Image and retained bufferViews overlap')
    remap, views, data = {}, [], bytearray()
    for i, view in enumerate(out.get('bufferViews', [])):
        if i in image_views:
            continue
        remap[i] = len(views)
        data.extend(b'\0' * ((-len(data)) % 4))
        copied = deepcopy(view)
        copied['byteOffset'] = len(data)
        start, end = ranges[i]
        data.extend(binary[start:end])
        views.append(copied)
    for node in walk(out):
        if 'bufferView' in node:
            require(node['bufferView'] in remap, 'Unresolved bufferView reference')
            node['bufferView'] = remap[node['bufferView']]
    out['bufferViews'] = views
    out['buffers'][0]['byteLength'] = len(data)
    return out, bytes(data), files


def verify_externalization(source, source_binary, candidate, candidate_binary, files):
    """Compare content rather than relocation indices, independently of packing."""
    def descriptor(doc, data, index):
        start, end = view_range(doc, data, index)
        properties = {k: v for k, v in doc['bufferViews'][index].items() if k not in ('byteOffset', 'buffer')}
        return {'properties': properties, 'sha256': hashlib.sha256(data[start:end]).hexdigest()}

    def semantic(doc, data, external):
        result = deepcopy(doc)
        for image in result.get('images', []):
            if 'bufferView' in image:
                image['_encoded_image_sha256'] = descriptor(doc, data, image.pop('bufferView'))['sha256']
            elif image.get('uri') in external:
                uri = image.pop('uri')
                digest = hashlib.sha256(external[uri]).hexdigest()
                require(uri.rsplit('/', 1)[-1].split('.')[0] == digest, 'External image content hash mismatch')
                image['_encoded_image_sha256'] = digest
        for node in walk(result):
            if 'bufferView' in node:
                node['bufferView'] = descriptor(doc, data, node['bufferView'])
        result.pop('bufferViews', None)
        for buffer in result.get('buffers', []):
            buffer.pop('byteLength', None)
        return result

    require(semantic(source, source_binary, {}) == semantic(candidate, candidate_binary, files),
            'glTF semantic/image/attribute/animation parity mismatch')
    removed = {image['bufferView'] for image in source.get('images', []) if 'bufferView' in image}
    retained_images = {image['bufferView'] for image in candidate.get('images', []) if 'bufferView' in image}
    before = Counter(json.dumps(descriptor(source, source_binary, i), sort_keys=True)
                     for i in range(len(source.get('bufferViews', []))) if i not in removed)
    after = Counter(json.dumps(descriptor(candidate, candidate_binary, i), sort_keys=True)
                    for i in range(len(candidate.get('bufferViews', []))) if i not in retained_images)
    require(before == after, 'Retained bufferView bytes or properties changed')
    return True
