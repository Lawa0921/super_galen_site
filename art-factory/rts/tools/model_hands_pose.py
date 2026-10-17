"""Pose evaluation for the hand polish pass (2026-10-16): glTF node TRS + animation sampling + skinning matrices.

Everything is plain numpy over model_polish_glb.Glb so the hand builder can measure the published meshes in a real
animation pose (bind space of these assemblies is not anatomically consistent between Hand- and Forearm-bound parts:
the 2026-10-14 builders authored in a reference pose and mapped each vertex back with its own blended matrix).
"""
import numpy as np


def quat_to_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def trs_matrix(t, r, s):
    m = np.eye(4); m[:3, :3] = quat_to_mat(r) * np.asarray(s)[None, :]; m[:3, 3] = t
    return m


def node_trs(node):
    if 'matrix' in node:
        m = np.asarray(node['matrix'], np.float64).reshape(4, 4).T
        return m, None
    return (np.asarray(node.get('translation', [0, 0, 0]), np.float64), np.asarray(node.get('rotation', [0, 0, 0, 1]), np.float64),
            np.asarray(node.get('scale', [1, 1, 1]), np.float64))


def sample(g, animation, t):
    """{node index: {path: value}} for one animation at time t (linear / step; cubic uses the keyed values)."""
    out = {}
    for ch in animation['channels']:
        s = animation['samplers'][ch['sampler']]
        times = g.accessor(s['input']).reshape(-1).astype(np.float64)
        vals = g.accessor(s['output']).astype(np.float64)
        interp = s.get('interpolation', 'LINEAR')
        if interp == 'CUBICSPLINE':
            vals = vals.reshape(len(times), 3, -1)[:, 1]
        t = float(np.clip(t, times[0], times[-1]))
        k = int(np.searchsorted(times, t, side='right') - 1); k = min(max(k, 0), len(times) - 1)
        if k == len(times) - 1 or interp == 'STEP':
            v = vals[k]
        else:
            u = (t - times[k]) / max(1e-9, times[k + 1] - times[k]); a, b = vals[k], vals[k + 1]
            if ch['target']['path'] == 'rotation':
                if np.dot(a, b) < 0:
                    b = -b
                v = a * (1 - u) + b * u; v = v / np.linalg.norm(v)
            else:
                v = a * (1 - u) + b * u
        out.setdefault(ch['target']['node'], {})[ch['target']['path']] = v
    return out


def world_matrices(g, animation_name=None, t=0.0):
    j = g.json; nodes = j['nodes']
    anim = next((a for a in j.get('animations', []) if a['name'] == animation_name), None) if animation_name else None
    override = sample(g, anim, t) if anim else {}
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get('children', []):
            parent[c] = i
    local = []
    for i, n in enumerate(nodes):
        trs = node_trs(n)
        if trs[1] is None:
            local.append(trs[0]); continue
        tt, rr, ss = trs; o = override.get(i, {})
        local.append(trs_matrix(o.get('translation', tt), o.get('rotation', rr), o.get('scale', ss)))
    world = [None] * len(nodes)

    def get(i):
        if world[i] is None:
            world[i] = local[i] if i not in parent else get(parent[i]) @ local[i]
        return world[i]
    return [get(i) for i in range(len(nodes))]


def skin_matrices(g, skin_index=0, animation_name=None, t=0.0):
    """(joint count, 4, 4) world-from-bind skinning matrices in the given pose."""
    skin = g.json['skins'][skin_index]
    world = world_matrices(g, animation_name, t)
    ibm = g.accessor(skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1).astype(np.float64)
    return np.stack([world[n] @ ibm[k] for k, n in enumerate(skin['joints'])]), world


def joint_names(g, skin_index=0):
    return [g.json['nodes'][n]['name'] for n in g.json['skins'][skin_index]['joints']]


def skin_points(positions, joints, weights, mats):
    """Linear-blend skinning of (n,3) bind positions."""
    p = np.concatenate([positions, np.ones((len(positions), 1))], axis=1)
    blended = np.einsum('nk,nkij->nij', weights, mats[joints.astype(int)])
    return np.einsum('nij,nj->ni', blended, p)[:, :3]


def unskin_points(positions, joints, weights, mats):
    """Inverse of skin_points per vertex: bind = (sum w M)^-1 posed."""
    blended = np.einsum('nk,nkij->nij', weights, mats[joints.astype(int)])
    p = np.concatenate([positions, np.ones((len(positions), 1))], axis=1)
    return np.einsum('nij,nj->ni', np.linalg.inv(blended), p)[:, :3]


def unskin_normals(normals, joints, weights, mats):
    blended = np.einsum('nk,nkij->nij', weights, mats[joints.astype(int)])[:, :3, :3]
    # normals transform by the inverse transpose; going posed -> bind applies the transpose of the blended matrix.
    n = np.einsum('nji,nj->ni', blended, normals)
    return n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-12)
