"""Download budget (model polish round 3): the command-panel frame ships as WebP instead of a 2.1 MB PNG.

Usage: python art-factory/rts/tools/model_polish_r3_ui.py
Deterministic re-encode of the published, approved command-panel.png (builtin-imagegen source, prepare_ui.py output):
WebP quality 92, lossless alpha, method 6. Checks the alpha channel is bit-identical and the colour error is small,
writes public/assets/games/rts/ui/command-panel.webp, updates ui-registry / commercial-readiness and removes the PNG
from the runtime path (git history keeps it). Records qa/ui-webp.json under the round-3 run.
"""
from pathlib import Path
import hashlib, io, json
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / 'art-factory/rts/runs/model-polish/2026-10-17-v1'
UI = ROOT / 'public/assets/games/rts/ui'


def sha(b):
    return hashlib.sha256(b).hexdigest()


def main():
    png = UI / 'command-panel.png'; webp = UI / 'command-panel.webp'
    src_bytes = png.read_bytes() if png.exists() else (RUN / 'raw/publication-before/ui/command-panel.png').read_bytes()
    snap = RUN / 'raw/publication-before/ui/command-panel.png'
    if not snap.exists():
        snap.parent.mkdir(parents=True, exist_ok=True); snap.write_bytes(src_bytes)
    im = Image.open(io.BytesIO(src_bytes)).convert('RGBA')
    buf = io.BytesIO(); im.save(buf, 'WEBP', quality=92, alpha_quality=100, method=6); out = buf.getvalue()
    a, b = np.asarray(im, dtype=int), np.asarray(Image.open(io.BytesIO(out)).convert('RGBA'), dtype=int)
    alpha_identical = bool((a[..., 3] == b[..., 3]).all())
    vis = a[..., 3] > 0
    mae = float(np.abs(a[..., :3] - b[..., :3])[vis].mean())
    assert alpha_identical and mae < 2.5, (alpha_identical, mae)
    webp.write_bytes(out)
    if png.exists():
        png.unlink()
    for rel, fix in (('art-factory/rts/manifests/ui-registry.json', 'ui'), ('art-factory/rts/manifests/commercial-readiness.json', 'cr')):
        path = ROOT / rel; text = path.read_bytes().decode('utf-8'); data = json.loads(text)
        if fix == 'ui':
            row = next(r for r in data['assets'] if r['id'] == 'command-panel')
            if row.get('runtime', '').endswith('.png'):
                row.setdefault('previous_versions', []).append({k: row[k] for k in ('runtime', 'sha256', 'bytes')})
            row.update(runtime='/assets/games/rts/ui/command-panel.webp', sha256=sha(out), bytes=len(out),
                       runtime_encoding={'tool': 'art-factory/rts/tools/model_polish_r3_ui.py', 'from_sha256': sha(src_bytes), 'webp_quality': 92,
                                         'alpha': 'lossless, bit-identical', 'visible_rgb_mae': round(mae, 3)})
        else:
            h = data['asset_hashes']; h.pop('assets/games/rts/ui/command-panel.png', None); h['assets/games/rts/ui/command-panel.webp'] = sha(out)
        out_text = json.dumps(data, indent=2, ensure_ascii=False) + '\n'
        path.write_bytes((out_text.replace('\n', '\r\n') if '\r\n' in text else out_text).encode('utf-8'))
    rec = {'asset': 'command-panel', 'from': {'sha256': sha(src_bytes), 'bytes': len(src_bytes)}, 'to': {'url': '/assets/games/rts/ui/command-panel.webp', 'sha256': sha(out), 'bytes': len(out)},
           'alpha_identical': alpha_identical, 'visible_rgb_mae': round(mae, 3)}
    (RUN / 'qa').mkdir(parents=True, exist_ok=True); (RUN / 'qa/ui-webp.json').write_text(json.dumps(rec, indent=2) + '\n', encoding='utf-8')
    print(rec)


if __name__ == '__main__':
    main()
