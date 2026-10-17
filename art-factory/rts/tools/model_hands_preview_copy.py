"""Iteration helper: snapshot the published GLB once (raw/publication-before) and copy hand candidates onto runtime
paths so the dev viewer shows them. Registries are only updated by the real stage step (model_polish_stage.py)."""
import shutil, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / 'art-factory/rts/runs/model-polish/2026-10-16-hands-v1'
for unit in sys.argv[1:]:
    for name in (f'{unit}.glb', f'{unit}-lod1.glb'):
        src = RUN / 'candidate/models' / name; dst = ROOT / 'public/assets/games/rts/models' / name
        snap = RUN / 'raw/publication-before/models' / name
        if not snap.exists():
            snap.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(dst, snap)
        shutil.copy2(src, dst); print('copied', name)
