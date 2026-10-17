"""Slice original generated ground atlas; crossfade only existing source pixels.

Candidate-only, no runtime publication. Usage: python <this> RAW_PNG RUN_DIR
"""
import hashlib
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
import terrain_detail_process as terrain

source, run = map(Path, sys.argv[1:])
for folder in ('raw', 'candidate', 'qa'):
    (run / folder).mkdir(parents=True, exist_ok=True)
raw = run / 'raw/terrain-atlas.png'
if source.resolve() != raw.resolve():
    shutil.copyfile(source, raw)
atlas = Image.open(raw).convert('RGB')
width, height = atlas.size
assert width == height and width >= 1024
terrain.SIZE = 512
terrain.EDGE_BLEND_PX = 32
assets = []
contact = Image.new('RGB', (1024, 1024))
for index, name in enumerate(('lush-grass', 'forest-floor', 'river-shingle', 'highland-scree')):
    x, y = index % 2, index // 2
    # Exact generated quadrant boundary; no padding, palette replacement or paint.
    crop = atlas.crop((x * width // 2, y * height // 2, (x + 1) * width // 2, (y + 1) * height // 2))
    resized = crop.resize((512, 512), Image.Resampling.LANCZOS)
    repaired = Image.fromarray(terrain.repair_one_pass(np.array(resized)))
    target = run / f'candidate/{name}.webp'
    repaired.save(target, format='WEBP', quality=88, method=6)
    decoded = Image.open(target).convert('RGB')
    metrics = terrain.seam_metrics(np.array(decoded))
    assert decoded.size == (512, 512) and target.stat().st_size <= 180000
    assert max(metrics['left_right_mean_rgb_abs'], metrics['top_bottom_mean_rgb_abs']) <= 8
    terrain.tile_preview(decoded, run / f'qa/{name}-repeat.png')
    contact.paste(decoded, (x * 512, y * 512))
    assets.append({'id': name, 'dimensions': [512, 512], 'mode': decoded.mode,
                   'bytes': target.stat().st_size, 'sha256': terrain.sha256(target),
                   'crop': [x * width // 2, y * height // 2, (x + 1) * width // 2, (y + 1) * height // 2],
                   'seams': metrics, 'status': 'candidate', 'runtime_publish_allowed': False})
contact.save(run / 'qa/material-contact.png')
report = {'source': str(source), 'source_sha256': terrain.sha256(raw),
          'source_dimensions': [width, height], 'generator': 'builtin-imagegen',
          'postprocess': 'crop, Lanczos resize, 32px opposite-edge source crossfade, WebP quality88',
          'assets': assets, 'mechanical': 'passed', 'visual_review': 'pending'}
(run / 'qa/materials.json').write_bytes((json.dumps(report, indent=2) + '\n').encode('utf-8'))
print(json.dumps({'mechanical': report['mechanical'], 'assets': [{k: a[k] for k in ('id', 'bytes', 'seams')} for a in assets]}))
