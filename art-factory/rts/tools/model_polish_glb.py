"""Minimal byte-level GLB surgery for the model polish pass (2026-10-16).

Only the named weapon/prop meshes are replaced; every other node, skin, animation channel and accessor is carried
over unchanged, then the binary chunk is compacted so orphaned buffer views do not bloat the file.
"""
from pathlib import Path
import json, struct
import numpy as np

COMP = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
COUNT = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


class Glb:
    def __init__(self, path):
        data = Path(path).read_bytes()
        magic, _, length = struct.unpack_from('<4sII', data, 0)
        assert magic == b'glTF', path
        jlen, jtype = struct.unpack_from('<II', data, 12)
        assert jtype == 0x4E4F534A
        self.json = json.loads(data[20:20 + jlen].decode('utf-8'))
        off = 20 + jlen
        blen, btype = struct.unpack_from('<II', data, off)
        assert btype == 0x004E4942
        self.bin = bytearray(data[off + 8:off + 8 + blen])

    # ---- reading ------------------------------------------------------------------------------------------------
    def accessor(self, index):
        a = self.json['accessors'][index]
        bv = self.json['bufferViews'][a['bufferView']]
        dtype, n = COMP[a['componentType']], COUNT[a['type']]
        start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = bv.get('byteStride')
        item = np.dtype(dtype).itemsize * n
        if stride and stride != item:
            raw = np.frombuffer(bytes(self.bin), dtype=np.uint8, count=stride * a['count'], offset=start)
            raw = raw.reshape(a['count'], stride)[:, :item].copy()
            arr = raw.view(dtype).reshape(a['count'], n)
        else:
            arr = np.frombuffer(bytes(self.bin), dtype=dtype, count=a['count'] * n, offset=start).reshape(a['count'], n)
        if a.get('normalized') and dtype in (np.uint8, np.uint16):
            arr = arr.astype(np.float32) / np.iinfo(dtype).max
        return arr

    def mesh_index(self, name):
        for i, m in enumerate(self.json['meshes']):
            if m.get('name') == name:
                return i
        raise KeyError(name)

    def node_of_mesh(self, mesh_index):
        return [i for i, n in enumerate(self.json['nodes']) if n.get('mesh') == mesh_index]

    def material_index(self, name):
        for i, m in enumerate(self.json.get('materials', [])):
            if m.get('name') == name:
                return i
        raise KeyError(name)

    # ---- writing ------------------------------------------------------------------------------------------------
    def _view(self, payload, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        view = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(payload)}
        if target:
            view['target'] = target
        self.bin.extend(payload)
        self.json['bufferViews'].append(view)
        return len(self.json['bufferViews']) - 1

    def add_accessor(self, array, kind, component=5126, target=34962, normalized=False, minmax=False):
        array = np.ascontiguousarray(array, dtype=COMP[component])
        n = COUNT[kind]
        flat = array.reshape(-1, n) if n > 1 else array.reshape(-1)
        acc = {'bufferView': self._view(flat.tobytes(), target), 'componentType': component, 'count': int(flat.shape[0]), 'type': kind}
        if normalized:
            acc['normalized'] = True
        if minmax:
            f = flat.reshape(-1, n)
            acc['min'] = [float(v) for v in f.min(axis=0)]
            acc['max'] = [float(v) for v in f.max(axis=0)]
        self.json['accessors'].append(acc)
        return len(self.json['accessors']) - 1

    def ensure_texture(self, uri, sampler=None):
        """External image texture (relative URI like the existing detail-v1 maps), repeat-wrapped, mipmapped."""
        images = self.json.setdefault('images', [])
        for i, im in enumerate(images):
            if im.get('uri') == uri:
                image = i
                break
        else:
            images.append({'uri': uri, 'name': Path(uri).name})
            image = len(images) - 1
        samplers = self.json.setdefault('samplers', [])
        sampler = sampler or {'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}
        if sampler in samplers:
            s = samplers.index(sampler)
        else:
            samplers.append(sampler)
            s = len(samplers) - 1
        textures = self.json.setdefault('textures', [])
        want = {'sampler': s, 'source': image}
        for i, t in enumerate(textures):
            if t == want:
                return i
        textures.append(want)
        return len(textures) - 1

    def ensure_material(self, material):
        mats = self.json.setdefault('materials', [])
        for i, m in enumerate(mats):
            if m.get('name') == material['name']:
                mats[i] = material
                return i
        mats.append(material)
        return len(mats) - 1

    def replace_mesh(self, name, primitives, joint=None):
        """primitives: [{'material': index, 'position': (n,3), 'normal': (n,3), 'uv': (n,2), 'indices': (m,)}].
        joint: joint slot (index into the skin's joints list) every vertex is rigidly bound to; None keeps the mesh unskinned."""
        mi = self.mesh_index(name)
        out = []
        for p in primitives:
            pos = np.asarray(p['position'], np.float32)
            attrs = {'POSITION': self.add_accessor(pos, 'VEC3', minmax=True),
                     'NORMAL': self.add_accessor(np.asarray(p['normal'], np.float32), 'VEC3'),
                     'TEXCOORD_0': self.add_accessor(np.asarray(p['uv'], np.float32), 'VEC2')}
            from model_polish_geometry import tangents
            attrs['TANGENT'] = self.add_accessor(tangents(pos, p['normal'], p['uv'], p['indices']), 'VEC4')
            if joint is not None:
                joints = np.zeros((len(pos), 4), np.uint16); joints[:, 0] = joint
                weights = np.zeros((len(pos), 4), np.float32); weights[:, 0] = 1
                attrs['JOINTS_0'] = self.add_accessor(joints, 'VEC4', component=5123)
                attrs['WEIGHTS_0'] = self.add_accessor(weights, 'VEC4')
            idx = np.asarray(p['indices'])
            comp = 5123 if idx.max() < 65535 else 5125
            out.append({'attributes': attrs, 'indices': self.add_accessor(idx, 'SCALAR', component=comp, target=34963),
                        'material': p['material'], 'mode': 4})
        self.json['meshes'][mi]['primitives'] = out

    def rigid_joint(self, name):
        """The single joint slot an existing rigid weapon mesh is bound to (asserts it really is rigid)."""
        prim = self.json['meshes'][self.mesh_index(name)]['primitives'][0]
        if 'JOINTS_0' not in prim['attributes']:
            return None
        j = self.accessor(prim['attributes']['JOINTS_0']); w = self.accessor(prim['attributes']['WEIGHTS_0'])
        top = j[np.arange(len(j)), np.argmax(w, axis=1)]
        values, counts = np.unique(top, return_counts=True)
        assert counts.max() == len(top), f'{name} is not rigidly skinned: {dict(zip(values.tolist(), counts.tolist()))}'
        return int(values[0])

    def prune_materials(self):
        """Remove materials no primitive references, then textures / images / samplers nothing references."""
        j = self.json
        used = sorted({p['material'] for m in j['meshes'] for p in m['primitives'] if 'material' in p})
        remap = {old: new for new, old in enumerate(used)}
        j['materials'] = [j['materials'][i] for i in used]
        for m in j['meshes']:
            for p in m['primitives']:
                if 'material' in p:
                    p['material'] = remap[p['material']]

        def texture_refs(node, out):
            if isinstance(node, dict):
                if 'index' in node and isinstance(node['index'], int) and set(node) <= {'index', 'texCoord', 'scale', 'strength', 'extensions', 'extras'}:
                    out.append(node)
                for v in node.values():
                    texture_refs(v, out)
            elif isinstance(node, list):
                for v in node:
                    texture_refs(v, out)
        refs = []
        texture_refs(j['materials'], refs)
        used_t = sorted({r['index'] for r in refs})
        tmap = {old: new for new, old in enumerate(used_t)}
        for r in refs:
            r['index'] = tmap[r['index']]
        textures = [j['textures'][i] for i in used_t] if used_t else []
        used_i = sorted({t['source'] for t in textures}); imap = {o: n for n, o in enumerate(used_i)}
        used_s = sorted({t['sampler'] for t in textures if 'sampler' in t}); smap = {o: n for n, o in enumerate(used_s)}
        for t in textures:
            t['source'] = imap[t['source']]
            if 'sampler' in t:
                t['sampler'] = smap[t['sampler']]
        for key, keep in (('textures', None), ('images', used_i), ('samplers', used_s)):
            if key not in j:
                continue
            j[key] = textures if key == 'textures' else [j[key][i] for i in keep]
            if not j[key]:
                del j[key]

    # ---- output -------------------------------------------------------------------------------------------------
    def compact(self):
        """Drop unreferenced accessors / buffer views / materials-unused data and rewrite the binary chunk."""
        j = self.json
        used_acc = set()
        for m in j['meshes']:
            for p in m['primitives']:
                used_acc.update(p['attributes'].values())
                if 'indices' in p:
                    used_acc.add(p['indices'])
                for t in p.get('targets', []):
                    used_acc.update(t.values())
        for s in j.get('skins', []):
            if 'inverseBindMatrices' in s:
                used_acc.add(s['inverseBindMatrices'])
        for a in j.get('animations', []):
            for s in a['samplers']:
                used_acc.update([s['input'], s['output']])
        acc_map = {old: new for new, old in enumerate(sorted(used_acc))}
        used_views = {j['accessors'][a]['bufferView'] for a in used_acc if 'bufferView' in j['accessors'][a]}
        used_views.update(im['bufferView'] for im in j.get('images', []) if 'bufferView' in im)
        new_bin = bytearray(); view_map = {}; views = []
        for old in sorted(used_views):
            v = dict(j['bufferViews'][old])
            chunk = self.bin[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
            while len(new_bin) % 4:
                new_bin.append(0)
            v['byteOffset'] = len(new_bin); new_bin.extend(chunk)
            view_map[old] = len(views); views.append(v)
        accessors = []
        for old in sorted(used_acc):
            a = dict(j['accessors'][old])
            if 'bufferView' in a:
                a['bufferView'] = view_map[a['bufferView']]
            accessors.append(a)
        for m in j['meshes']:
            for p in m['primitives']:
                p['attributes'] = {k: acc_map[v] for k, v in p['attributes'].items()}
                if 'indices' in p:
                    p['indices'] = acc_map[p['indices']]
                if 'targets' in p:
                    p['targets'] = [{k: acc_map[v] for k, v in t.items()} for t in p['targets']]
        for s in j.get('skins', []):
            if 'inverseBindMatrices' in s:
                s['inverseBindMatrices'] = acc_map[s['inverseBindMatrices']]
        for a in j.get('animations', []):
            for s in a['samplers']:
                s['input'] = acc_map[s['input']]; s['output'] = acc_map[s['output']]
        for im in j.get('images', []):
            if 'bufferView' in im:
                im['bufferView'] = view_map[im['bufferView']]
        j['accessors'] = accessors; j['bufferViews'] = views
        self.bin = new_bin
        j['buffers'] = [{'byteLength': len(new_bin)}]

    def save(self, path):
        self.compact()
        payload = json.dumps(self.json, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
        payload += b' ' * ((4 - len(payload) % 4) % 4)
        binary = bytes(self.bin) + b'\0' * ((4 - len(self.bin) % 4) % 4)
        total = 12 + 8 + len(payload) + 8 + len(binary)
        out = struct.pack('<4sII', b'glTF', 2, total) + struct.pack('<II', len(payload), 0x4E4F534A) + payload
        out += struct.pack('<II', len(binary), 0x004E4942) + binary
        Path(path).write_bytes(out)
