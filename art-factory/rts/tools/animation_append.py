"""Append reviewed animation curves to a locked GLB without re-exporting its art.

Pure data transformation: no filesystem writes or publication decision. The
caller must supply an export of the same rig and preserve its source evidence.
"""
from copy import deepcopy
import math
import struct

from unit_shared_textures import require, view_range


def _buffer(document, binary):
    buffers = document.get('buffers', [])
    require(len(buffers) == 1 and 'uri' not in buffers[0], 'Requires one embedded buffer')
    size = buffers[0].get('byteLength')
    require(type(size) is int and 0 <= size <= len(binary), 'Invalid buffer length')


def _nodes(document):
    names, parents = {}, {}
    for index, node in enumerate(document.get('nodes', [])):
        if node.get('name'):
            names.setdefault(node['name'], []).append(index)
        for child in node.get('children', []):
            require(type(child) is int and 0 <= child < len(document['nodes']), 'Invalid child node')
            require(child not in parents, 'Ambiguous parent node')
            parents[child] = index
    return names, parents


def _same_bind(a, b):
    if 'matrix' in a or 'matrix' in b:
        fields = [('matrix', [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])]
        require(not any(key in n for n in (a, b) for key in ('translation', 'rotation', 'scale')), 'Mixed matrix/TRS bind')
    else:
        fields = [('translation', [0, 0, 0]), ('rotation', [0, 0, 0, 1]), ('scale', [1, 1, 1])]
    for key, default in fields:
        left, right = a.get(key, default), b.get(key, default)
        require(len(left) == len(right) == len(default), 'Invalid bind shape')
        require(all(math.isfinite(v) for v in [*left, *right]), 'Non-finite bind')
        near = lambda x, y: all(abs(p - q) <= 1e-5 for p, q in zip(x, y))
        require(near(left, right) or key == 'rotation' and near(left, [-v for v in right]), 'Source and target bind differ')


def _curve(document, binary, index, expected_type):
    accessors = document.get('accessors', [])
    require(type(index) is int and 0 <= index < len(accessors), 'Invalid animation accessor')
    accessor = accessors[index]
    require(accessor.get('type') == expected_type and accessor.get('componentType') == 5126,
            'Animation curves must be float32 with the expected shape')
    require(not any(k in accessor for k in ('sparse', 'extensions', 'normalized')), 'Unsupported animation accessor')
    count = accessor.get('count')
    require(type(count) is int and count > 0, 'Invalid curve count')
    begin, end = view_range(document, binary, accessor.get('bufferView'))
    view = document['bufferViews'][accessor['bufferView']]
    require(not view.get('extensions'), 'Unsupported curve bufferView')
    width = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[expected_type]
    stride, offset = view.get('byteStride', width * 4), accessor.get('byteOffset', 0)
    require(type(offset) is int and offset >= 0 and offset % 4 == 0
            and type(stride) is int and stride >= width * 4 and stride % 4 == 0
            and begin + offset + (count - 1) * stride + width * 4 <= end, 'Curve exceeds buffer bounds')
    values = [struct.unpack_from('<' + 'f' * width, binary, begin + offset + i * stride) for i in range(count)]
    require(all(math.isfinite(v) for row in values for v in row), 'Non-finite animation curve')
    return values


def append_animations(base, base_binary, source, source_binary, names):
    """Return a copy with new named clips; retain every original BIN byte/index.

    Refuse ambiguous names, changed bind/hierarchy, malformed curve bounds and
    unsupported accessor forms instead of guessing or modifying the base rig.
    """
    _buffer(base, base_binary); _buffer(source, source_binary)
    require(isinstance(names, list) and names and len(set(names)) == len(names), 'Invalid clip selection')
    existing = {clip.get('name') for clip in base.get('animations', [])}
    require(not existing.intersection(names), 'Cannot replace an existing clip')
    chosen = []
    for name in names:
        matching = [clip for clip in source.get('animations', []) if clip.get('name') == name]
        require(len(matching) == 1, 'Missing or ambiguous source clip: ' + name)
        chosen.append(matching[0])
    base_names, base_parents = _nodes(base)
    source_names, source_parents = _nodes(source)
    node_map = {}

    def map_node(index, chain=()):
        require(type(index) is int and 0 <= index < len(source.get('nodes', [])), 'Invalid animation node')
        require(index not in chain, 'Cyclic parent node')
        if index in node_map:
            return node_map[index]
        node = source['nodes'][index]; name = node.get('name')
        require(name and len(source_names.get(name, [])) == 1 and len(base_names.get(name, [])) == 1,
                'Missing or ambiguous target node: ' + str(name))
        target = base_names[name][0]
        _same_bind(node, base['nodes'][target])
        parent = source_parents.get(index)
        expected_parent = None if parent is None else map_node(parent, (*chain, index))
        require(base_parents.get(target) == expected_parent, 'Animation target parent differs: ' + name)
        node_map[index] = target
        return target

    for clip in chosen:
        require(clip.get('channels') and clip.get('samplers') and not clip.get('extensions'), 'Empty or unsupported clip')
        require({channel.get('sampler') for channel in clip['channels']} == set(range(len(clip['samplers']))),
                'Every animation sampler must be referenced by a channel')
        for channel in clip['channels']:
            require(not channel.get('extensions') and not channel['target'].get('extensions'), 'Unsupported animation channel')
            map_node(channel['target'].get('node'))
            path = channel['target'].get('path')
            require(path in ('rotation', 'translation', 'scale'), 'Unsupported animation target path')
            sampler_index = channel.get('sampler')
            require(type(sampler_index) is int and 0 <= sampler_index < len(clip['samplers']), 'Invalid animation sampler')
            sampler = clip['samplers'][sampler_index]
            interpolation = sampler.get('interpolation', 'LINEAR')
            require(interpolation in ('LINEAR', 'STEP', 'CUBICSPLINE') and not sampler.get('extensions'), 'Unsupported interpolation')
            times = [r[0] for r in _curve(source, source_binary, sampler.get('input'), 'SCALAR')]
            values = _curve(source, source_binary, sampler.get('output'), 'VEC4' if path == 'rotation' else 'VEC3')
            require(times[0] >= 0 and all(a < b for a, b in zip(times, times[1:])), 'Animation times must increase')
            require(len(values) == len(times) * (3 if interpolation == 'CUBICSPLINE' else 1), 'Animation key count mismatch')

    # Local transforms alone do not establish skin compatibility: a mesh can
    # use different inverse bind matrices with otherwise identical bone nodes.
    def palette(document, data, skin, remap):
        joints = skin.get('joints', [])
        require(joints and len(set(joints)) == len(joints), 'Invalid skin bind joints')
        matrices = (_curve(document, data, skin['inverseBindMatrices'], 'MAT4') if 'inverseBindMatrices' in skin
                    else [[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] for _ in joints])
        require(len(matrices) == len(joints), 'Skin inverse bind count differs')
        return {remap(joint): matrix for joint, matrix in zip(joints, matrices)}

    source_skins = [skin for skin in source.get('skins', []) if set(skin.get('joints', [])).intersection(node_map)]
    source_palettes = [palette(source, source_binary, skin, map_node) for skin in source_skins]
    mapped_targets = set(node_map.values())
    base_skins = [skin for skin in base.get('skins', []) if set(skin.get('joints', [])).intersection(mapped_targets)]
    base_palettes = [palette(base, base_binary, skin, lambda joint: joint) for skin in base_skins]

    def compatible(left, right):
        return left.keys() == right.keys() and all(
            all(abs(a - b) <= 1e-5 for a, b in zip(matrix, right[joint])) for joint, matrix in left.items())

    require(all(any(compatible(a, b) for b in base_palettes) for a in source_palettes)
            and all(any(compatible(b, a) for a in source_palettes) for b in base_palettes),
            'Source and target skin inverse bind differ or are missing')

    out, binary = deepcopy(base), bytearray(base_binary)
    view_map, accessor_map = {}, {}

    def copy_accessor(index):
        if index in accessor_map:
            return accessor_map[index]
        accessor = deepcopy(source['accessors'][index]); view_index = accessor['bufferView']
        if view_index not in view_map:
            begin, end = view_range(source, source_binary, view_index)
            view = deepcopy(source['bufferViews'][view_index])
            binary.extend(b'\0' * (-len(binary) % 4)); view['byteOffset'] = len(binary)
            binary.extend(source_binary[begin:end]); view_map[view_index] = len(out.setdefault('bufferViews', []))
            out['bufferViews'].append(view)
        accessor['bufferView'] = view_map[view_index]
        accessor_map[index] = len(out.setdefault('accessors', [])); out['accessors'].append(accessor)
        return accessor_map[index]

    for original in chosen:
        clip = deepcopy(original)
        for sampler in clip['samplers']:
            sampler['input'] = copy_accessor(sampler['input']); sampler['output'] = copy_accessor(sampler['output'])
        for channel in clip['channels']:
            channel['target']['node'] = node_map[channel['target']['node']]
        out.setdefault('animations', []).append(clip)
    out['buffers'][0]['byteLength'] = len(binary)
    return out, bytes(binary)
