"""Fit original finger skin to the actual shaft, with whole-triangle clearance."""
import json, math
from pathlib import Path
import numpy as np
from scipy.spatial import ConvexHull
from scipy.spatial.transform import Rotation
from scipy.optimize import minimize, least_squares
from original_glove_grip_clearance import triangle_clearance

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT/'art-factory/rts/runs/original-crossbow-complete/2026-10-07-v3'

class SurfaceRig:
    def __init__(self, data):
        self.data = data
        self.source = data['source_bones']
        self.base = {n: np.array(m) for n, m in data['baseline_matrices'].items()}
        self.bind = {}
        for i, bindings in enumerate(data['bindings']):
            for binding in bindings:
                name = binding['bone']
                if name not in self.bind:
                    self.bind[name] = np.zeros((len(data['bindings']), 4))
                self.bind[name][i] += np.r_[binding['point'], 1.]*binding['weight']

    def matrices(self, fingers):
        matrices = dict(self.base)
        for name, params in fingers.items():
            head = np.array(self.source[name+'1_L']['matrix'])[:3, 3].copy()
            turn = Rotation.from_rotvec([0, 0, math.radians(params['swing_z_degrees'])])
            for i, angle in enumerate(params['angles_degrees'], 1):
                bone = self.source[f'{name}{i}_L']
                turn = turn*Rotation.from_rotvec(np.array(bone['axis'])*math.radians(angle))
                q = turn*Rotation.from_matrix(np.array(bone['matrix'])[:3, :3])
                matrix = np.eye(4); matrix[:3, :3] = q.as_matrix(); matrix[:3, 3] = head
                matrices[f'{name}{i}_L'] = matrix
                head = head+q.apply([0, bone['length'], 0])
        return matrices

    def deform(self, fingers):
        matrices = self.matrices(fingers)
        return sum((binding @ matrices[name].T)[:, :3] for name, binding in self.bind.items())

def main():
    data = json.loads((RUN/'raw/pinch-surfaces.json').read_text())
    old = json.loads((RUN.parent/'2026-10-07-v2/raw/pinch-layout.json').read_text())
    rig = SurfaceRig(data)
    parity = float(np.linalg.norm(rig.deform(old['fingers'])-np.array(data['baseline_positions']), axis=1).max())
    assert parity < 2e-6, f'Authoring skin does not match Blender: {parity}'
    faces = np.array(data['triangles'])
    bolt = data['bolt']; points = np.array(bolt['positions']); bf = np.array(bolt['triangles']); mats = np.array(bolt['triangle_materials'])
    solids = [ConvexHull(points[np.unique(bf[mats == i])]).equations for i in range(len(bolt['materials']))]
    shaft = solids[bolt['materials'].index('HewnOak')]
    orientation = np.array(bolt['baseline_matrix'])[:3, :3]
    oldpads = json.loads((ROOT/'art-factory/rts/runs/original-glove-weapon-fit/2026-10-07-v1/raw/grip-target.json').read_text())['contact_vertex_ids']
    pads = {n: [i for i in oldpads[n] if sum(b['weight'] for b in data['bindings'][i] if b['bone'] == n+'3_L') > .55] for n in ('Index', 'Thumb')}
    assert all(len(v) >= 3 for v in pads.values()), pads
    names = ('Index', 'Thumb')
    grip_y = -.10  # Actual bare shaft; feather ends at -0.15333 m.
    initial = np.r_[*[old['fingers'][n]['angles_degrees']+[old['fingers'][n]['swing_z_degrees']] for n in names], old['contact_source']]
    scale = np.r_[np.full(8, 40.), np.full(3, .03)]

    def state(x):
        p = x*scale
        fingers = {n: {'angles_degrees': p[i*4:i*4+3].tolist(), 'swing_z_degrees': float(p[i*4+3])} for i, n in enumerate(names)}
        posed = rig.deform(fingers)
        local = (posed-p[8:11]) @ orientation+np.array([0, grip_y, 0])
        return fingers, posed, local

    def margins(x):
        local = state(x)[2]
        return np.concatenate([triangle_clearance(local, faces, solid) for solid in solids])

    def objective(x):
        local = state(x)[2]
        sdf = (local @ shaft[:, :3].T+shaft[:, 3]).max(axis=1)
        contact = np.r_[*[np.sort(sdf[ids])[:3] for ids in pads.values()]]
        return float(np.mean(((contact-.0008)*1000)**2)+.006*np.sum((x-initial/scale)**2))

    bounds = list(zip(np.r_[0, 0, 0, -35, 0, 0, 0, -35, .025, -.065, .08]/scale,
                      np.r_[70, 95, 65, 35, 65, 65, 55, 45, .09, .015, .145]/scale))
    # The old pose starts deeply inside the shaft. Restore surface feasibility
    # with a penetration penalty before using hard separating-plane constraints.
    def restore_error(x):
        local = state(x)[2]
        sdf = (local @ shaft[:, :3].T+shaft[:, 3]).max(axis=1)
        contacts = np.r_[*[np.sort(sdf[ids])[:3] for ids in pads.values()]]
        return np.r_[np.minimum(margins(x)-.0006, 0)*3000, (contacts-.0008)*1000, (x-initial/scale)*.04]
    restored = least_squares(restore_error, initial/scale, bounds=np.array(bounds).T,
                             max_nfev=160, ftol=1e-9, xtol=1e-9, gtol=1e-8)
    print('SURFACE_RESTORE', json.dumps({'evaluations': restored.nfev, 'margin_m': float(margins(restored.x).min()), 'cost': objective(restored.x)}), flush=True)
    result = minimize(objective, restored.x, method='SLSQP', bounds=bounds,
                      constraints=[{'type': 'ineq', 'fun': lambda x: (margins(x)-.0004)*1000}],
                      options={'maxiter': 160, 'ftol': 1e-8, 'eps': 1e-6})
    fingers, posed, local = state(result.x)
    sdf = (local @ shaft[:, :3].T+shaft[:, 3]).max(axis=1)
    margin = float(margins(result.x).min())
    report = {'status': 'candidate' if margin >= .00039 else 'qa_failed', 'fingers': fingers,
              'contact_source': (result.x*scale)[8:11].tolist(), 'bolt_contact_y': grip_y, 'quiver_bolt_raise_m': .095,
              'contact_vertex_ids': pads, 'minimum_triangle_margin_m': margin,
              'pad_nearest3_m': {n: np.sort(sdf[ids])[:3].tolist() for n, ids in pads.items()},
              'baseline_skin_parity_m': parity, 'source_sha256': data['source_sha256'],
              'solver': {'success': bool(result.success), 'message': result.message, 'iterations': result.nit, 'cost': float(result.fun)},
              'surface_contact_approved': False, 'runtime_publish_allowed': False,
              'scope': 'Original authored finger FK and exact source skin binds; conservative separation from actual shaft/head/feather convex surfaces. Actual Blender normals, self collision and full motion are separate gates.'}
    (RUN/'raw/pinch-layout.json').write_text(json.dumps(report, indent=2)+'\n', newline='\n')
    print('SURFACE_FIT', json.dumps({k: v for k, v in report.items() if k != 'contact_vertex_ids'}), flush=True)
    assert margin >= .00039, 'Actual arrow surfaces are not separated from the hand triangles'

if __name__ == '__main__':
    main()
