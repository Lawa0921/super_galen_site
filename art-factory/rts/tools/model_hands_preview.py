"""Canonical hand preview: writes the parametric hand (all styles / poses) as OBJ and renders it with Blender.

Usage: python art-factory/rts/tools/model_hands_preview.py <out dir> [style] [pose] [grip radius]
then:  blender -b -t 2 --factory-startup --python art-factory/rts/tools/model_hands_preview_blender.py -- <out dir>
Material colours in the preview are flat per logical material (leather / steel / brass); the GLB uses the atlas.
"""
import sys
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
from model_hands_geometry import hand_parts  # noqa: E402

out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
style = sys.argv[2] if len(sys.argv) > 2 else 'plate'; pose = sys.argv[3] if len(sys.argv) > 3 else 'grip'
rg = float(sys.argv[4]) if len(sys.argv) > 4 else 0.016
for detail in (1, 0):
    parts, info = hand_parts(dict(pose=pose, grip_radius=rg, wrist_local=(0.0, -0.085, 0.0), style=style), detail)
    lines = []; base = 1; tris = 0
    groups = {}
    for p, _ in parts:
        groups.setdefault(p.material, []).append(p)
    if pose == 'grip':  # the handle for context
        from model_polish_geometry import lathe
        h = lathe('handle', [(-0.09, rg), (0.09, rg)], 16)
        h = h.transformed(np.array([[1, 0, 0, 0], [0, 0, -1, 0], [0, 1, 0, 0], [0, 0, 0, 1.0]]))
        groups.setdefault('handle', []).append(h)
    for mat, ps in groups.items():
        lines.append(f'o {mat}\nusemtl {mat}')
        for p in ps:
            for v in p.position: lines.append(f'v {v[0]:.5f} {v[1]:.5f} {v[2]:.5f}')
            for n in p.normal: lines.append(f'vn {n[0]:.4f} {n[1]:.4f} {n[2]:.4f}')
            for t in p.indices.reshape(-1, 3):
                a, b, c = (int(x) + base for x in t); lines.append(f'f {a}//{a} {b}//{b} {c}//{c}')
            base += len(p.position); tris += len(p.indices) // 3 if mat != 'handle' else 0
    (out / f'hand-lod{1 - detail}.obj').write_text('\n'.join(lines) + '\n')
    print('lod', 1 - detail, 'tris', tris, 'parts', len(parts))
