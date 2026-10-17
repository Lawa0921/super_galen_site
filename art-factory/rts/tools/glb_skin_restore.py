"""Restore original skin weights through explicit exported source vertex IDs."""
import copy
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

from original_guard_walk_refine_glb import _read, _pack, _floats


def restore_skin(document, binary, source):
    document = copy.deepcopy(document)
    output = bytearray(binary)
    vertices, changed, owners, touched = 0, 0, set(), set()
    protected = bytearray(b'\x01' * len(binary))
    def writer(index, allowed_types):
        accessor = document['accessors'][index]
        if accessor.get('sparse') or accessor.get('normalized') or accessor['type'] != 'VEC4' or accessor['componentType'] not in allowed_types:
            raise ValueError('Unsupported skin accessor')
        view = document['bufferViews'][accessor['bufferView']]
        component = accessor['componentType']
        fmt, size = {5121: ('B', 1), 5123: ('H', 2), 5126: ('f', 4)}[component]
        start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        stride = view.get('byteStride', 4 * size)
        if view.get('buffer', 0) != 0 or start + (accessor['count'] - 1) * stride + size * 4 > len(output):
            raise ValueError('Skin accessor out of bounds')
        def write(row, values):
            offset = start + row * stride
            struct.pack_into('<' + fmt * 4, output, offset, *values)
            protected[offset:offset + size * 4] = b'\x00' * (size * 4)
        return accessor, write
    for node in document['nodes']:
        if 'mesh' not in node:
            continue
        name = node.get('name')
        if name not in source or name in owners or 'skin' not in node:
            raise ValueError('Ambiguous/missing source mesh owner')
        owners.add(name)
        palette = [document['nodes'][joint]['name'] for joint in document['skins'][node['skin']]['joints']]
        if len(palette) != len(set(palette)):
            raise ValueError('Ambiguous skin joint names')
        joint_ids = {name: index for index, name in enumerate(palette)}
        for primitive in document['meshes'][node['mesh']]['primitives']:
            attrs = primitive['attributes']
            if '_RTS_SOURCE_VERTEX' not in attrs:
                raise ValueError('Explicit source vertex identity required')
            if any(k.startswith(('JOINTS_', 'WEIGHTS_')) and k not in ('JOINTS_0', 'WEIGHTS_0') for k in attrs):
                raise ValueError('Expected at most four skin influences')
            if any(attrs[k] in touched for k in ('JOINTS_0', 'WEIGHTS_0')):
                raise ValueError('Shared mutable skin accessor')
            touched.update(attrs[k] for k in ('JOINTS_0', 'WEIGHTS_0'))
            ids = _floats(document, binary, attrs['_RTS_SOURCE_VERTEX'])
            positions = _floats(document, binary, attrs['POSITION'])
            joints_accessor, write_joints = writer(attrs['JOINTS_0'], (5121, 5123))
            weights_accessor, write_weights = writer(attrs['WEIGHTS_0'], (5126,))
            if len(ids) * 3 != len(positions) or joints_accessor['count'] != len(ids) or weights_accessor['count'] != len(ids):
                raise ValueError('Skin identity/position/count mismatch')
            all_joints, all_weights = [], []
            for index, identity in enumerate(ids):
                if not math.isfinite(identity) or int(identity) != identity or not 0 <= identity < len(source[name]['vertices']):
                    raise ValueError('Invalid source vertex identity')
                row = source[name]['vertices'][int(identity)]
                if math.dist(positions[index * 3:index * 3 + 3], row['position']) > 1e-6:
                    raise ValueError('Source identity position mismatch')
                values = sorted(row['weights'], key=lambda pair: (-pair[1], pair[0]))
                if len(values) > 4 or not values or any(not math.isfinite(w) or w <= 0 for _, w in values) or abs(sum(w for _, w in values) - 1) > 1e-6:
                    raise ValueError('Invalid source influence vector')
                if any(bone not in joint_ids for bone, _ in values):
                    raise ValueError('Source joint missing from exported palette')
                js = [joint_ids[bone] for bone, _ in values] + [0] * (4 - len(values))
                ws = [weight for _, weight in values] + [0.] * (4 - len(values))
                write_joints(index, js)
                write_weights(index, ws)
                all_joints.append(js)
                all_weights.append(ws)
                vertices += 1
            for accessor, rows in ((joints_accessor, all_joints), (weights_accessor, all_weights)):
                for key, reducer in (('min', min), ('max', max)):
                    if key in accessor:
                        accessor[key] = [reducer(row[i] for row in rows) for i in range(4)]
    assert all(a == b for a, b, keep in zip(binary, output, protected) if keep), 'Non-skin binary changed'
    changed = sum(a != b for a, b in zip(binary, output))
    return document, bytes(output), {'vertices': vertices, 'meshes': len(owners), 'changed_binary_bytes': changed, 'only_joint_weight_ranges_changed': True}


def main():
    run = Path(sys.argv[1]).resolve()
    sha = lambda data: hashlib.sha256(data).hexdigest()
    source_bytes = (run / 'qa/blender-static-skin.json').read_bytes()
    reference = json.loads((run / 'qa/blender-reference.json').read_text(encoding='utf-8'))
    assert sha(source_bytes) == reference['static_skin_sha256']
    source = json.loads(source_bytes)
    report = json.loads((run / 'qa/export-direct.json').read_text(encoding='utf-8'))
    exports = []
    for asset in report['exports']:
        document, binary, original = _read(run / 'candidate' / asset['file'])
        assert sha(original) == asset['sha256']
        doc, blob, result = restore_skin(document, binary, source)
        data = _pack(doc, blob)
        filename = asset['file'].replace('-direct-', '-restored-')
        (run / 'candidate' / filename).write_bytes(data)
        exports.append({'lod': asset['lod'], 'file': filename, 'bytes': len(data), 'sha256': sha(data), 'source_sha256': asset['sha256'], 'skin_restore': result})
    report.update({'mode': 'restored', 'exports': exports, 'status': 'source_weights_restored_pending_quaternion_and_parity'})
    (run / 'qa/export-restored.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(exports, indent=2))


if __name__ == '__main__':
    main()
