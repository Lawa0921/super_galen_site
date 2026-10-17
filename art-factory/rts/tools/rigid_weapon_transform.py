"""Reorient an existing rigid weapon; append POSITION/NORMAL, preserve old BIN."""
from copy import deepcopy
import math
import struct
from unit_shared_textures import require, view_range


def read_attribute(doc, binary, index):
    accessor = doc['accessors'][index]
    require(accessor['type'] in ('VEC3', 'VEC4') and 'sparse' not in accessor and not accessor.get('normalized'), 'Requires dense unnormalized vectors')
    formats = {5126: ('f', 4), 5123: ('H', 2), 5121: ('B', 1)}
    require(accessor['componentType'] in formats, 'Unsupported attribute format')
    fmt, size = formats[accessor['componentType']]; width = int(accessor['type'][-1])
    start, end = view_range(doc, binary, accessor['bufferView'])
    offset = accessor.get('byteOffset', 0); stride = doc['bufferViews'][accessor['bufferView']].get('byteStride', size*width)
    require(type(offset) is int and offset >= 0 and stride >= size*width and accessor['count'] > 0
            and start+offset+(accessor['count']-1)*stride+size*width <= end, 'Invalid attribute range')
    values = [struct.unpack_from('<'+fmt*width, binary, start+offset+i*stride) for i in range(accessor['count'])]
    require(all(math.isfinite(v) for row in values for v in row), 'Nonfinite attribute')
    return values


def flip_weapon_x(doc, binary, node_name):
    targets = [n for n in doc['nodes'] if n.get('name') == node_name]
    require(len(targets) == 1, 'Expected one named weapon node')
    node = targets[0]; mesh_id = node['mesh']
    require(sum(n.get('mesh') == mesh_id for n in doc['nodes']) == 1, 'Weapon mesh is shared')
    require('skin' in node, 'Weapon is not skinned')
    mesh = doc['meshes'][mesh_id]; joints = doc['skins'][node['skin']]['joints']
    grip = []; source = []
    for primitive in mesh['primitives']:
        require(not primitive.get('targets') and 'TANGENT' not in primitive['attributes'], 'Unsupported morph/tangent weapon')
        attrs = primitive['attributes']
        positions = read_attribute(doc, binary, attrs['POSITION']); normals = read_attribute(doc, binary, attrs['NORMAL'])
        joint_rows = read_attribute(doc, binary, attrs['JOINTS_0']); weights = read_attribute(doc, binary, attrs['WEIGHTS_0'])
        require(len(positions) == len(normals) == len(joint_rows) == len(weights), 'Attribute count mismatch')
        for row, influence in zip(joint_rows, weights):
            require(abs(sum(influence)-1) < 1e-6 and all(w >= 0 for w in influence), 'Invalid weapon weights')
            require(all(w == 0 or 0 <= j < len(joints) and doc['nodes'][joints[j]].get('name') == 'Hand_R' for j, w in zip(row, influence)), 'Weapon must be rigid to Hand_R')
        if doc['materials'][primitive['material']].get('name') == 'WornLeatherGrip': grip.extend(positions)
        source.append((positions, normals))
    require(grip, 'No canonical leather grip pivot')
    pivot = [(min(v[i] for v in grip)+max(v[i] for v in grip))/2 for i in range(3)]
    out = deepcopy(doc); packed = bytearray(binary); records = []
    for primitive, (positions, normals) in zip(out['meshes'][mesh_id]['primitives'], source):
        old_attrs = deepcopy(primitive['attributes'])
        for name, rows in [('POSITION', positions), ('NORMAL', normals)]:
            center = pivot if name == 'POSITION' else [0, 0, 0]
            values = [(v[0], 2*center[1]-v[1], 2*center[2]-v[2]) for v in rows]
            while len(packed) % 4: packed.append(0)
            payload = struct.pack('<'+'f'*len(values)*3, *(v for row in values for v in row))
            out['bufferViews'].append({'buffer': 0, 'byteOffset': len(packed), 'byteLength': len(payload), 'target': 34962}); packed.extend(payload)
            accessor = {'bufferView': len(out['bufferViews'])-1, 'componentType': 5126, 'type': 'VEC3', 'count': len(values)}
            if name == 'POSITION':
                # Bounds must reflect the actual float32 values serialized above.
                actual = list(struct.iter_unpack('<fff', payload))
                accessor.update(min=[min(v[i] for v in actual) for i in range(3)], max=[max(v[i] for v in actual) for i in range(3)])
            out['accessors'].append(accessor); primitive['attributes'][name] = len(out['accessors'])-1
        records.append({'before': old_attrs, 'after': deepcopy(primitive['attributes'])})
    out['buffers'][0]['byteLength'] = len(packed)
    return out, bytes(packed), {'node_name': node_name, 'mesh': mesh_id, 'pivot': pivot, 'rotation_x_degrees': 180, 'attributes': records}
