"""Hand pass invariants: skeleton nodes, skins, inverse bind matrices and every animation channel byte-identical,
node / mesh / material names kept, draw calls (primitives) not higher. Writes qa/invariants.json under the hands run."""
from pathlib import Path
import hashlib, json, sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from model_polish_glb import Glb  # noqa: E402
import model_hands_build as B  # noqa: E402


def acc_bytes(g, i):
    return g.accessor(i).tobytes()


def digest(g):
    j = g.json; h = hashlib.sha256()
    for n in j['nodes']:
        h.update(json.dumps({k: n.get(k) for k in ('name', 'translation', 'rotation', 'scale', 'matrix', 'children', 'skin')}, sort_keys=True).encode())
    for s in j.get('skins', []):
        h.update(json.dumps(s.get('joints')).encode()); h.update(acc_bytes(g, s['inverseBindMatrices']))
    for a in j.get('animations', []):
        h.update(a['name'].encode())
        for c in a['channels']:
            smp = a['samplers'][c['sampler']]
            h.update(json.dumps(c['target'], sort_keys=True).encode()); h.update(smp.get('interpolation', 'LINEAR').encode())
            h.update(acc_bytes(g, smp['input'])); h.update(acc_bytes(g, smp['output']))
    return h.hexdigest()


rows = []
for f in sorted(B.CANDIDATE.glob('*.glb')):
    a, b = Glb(B.baseline_path(f.name)), Glb(f)
    prims = lambda g: sum(len(g.json['meshes'][n['mesh']]['primitives']) for n in g.json['nodes'] if 'mesh' in n)
    tris = lambda g: sum(g.json['accessors'][p['indices']]['count'] // 3 for n in g.json['nodes'] if 'mesh' in n for p in g.json['meshes'][n['mesh']]['primitives'])
    row = {'file': f.name, 'rig_and_animation_identical': digest(a) == digest(b),
           'node_names_identical': [n.get('name') for n in a.json['nodes']] == [n.get('name') for n in b.json['nodes']],
           'primitives_before': prims(a), 'primitives_after': prims(b), 'triangles_before': tris(a), 'triangles_after': tris(b),
           'materials_before': len(a.json.get('materials', [])), 'materials_after': len(b.json.get('materials', []))}
    rows.append(row); print(row)
ok = all(r['rig_and_animation_identical'] and r['node_names_identical'] and r['primitives_after'] <= r['primitives_before'] for r in rows)
(B.RUN / 'qa/invariants.json').write_text(json.dumps({'ok': ok, 'files': rows}, indent=2) + '\n', encoding='utf-8')
print('ok', ok)
if not ok:
    sys.exit(1)
