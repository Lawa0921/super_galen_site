"""Preserve generated plant pixels; extract gutters, key magenta, pack an atlas."""
from pathlib import Path
import hashlib
import json
import shutil
import sys
import numpy as np
from PIL import Image

source, run = map(Path, sys.argv[1:3])
landmarks = '--landmarks' in sys.argv
stem = 'kingdom-ruins' if landmarks else 'valley-undergrowth'
for folder in ('raw', 'candidate', 'qa'):
    (run / folder).mkdir(parents=True, exist_ok=True)
raw = run / ('raw/ruins.png' if landmarks else 'raw/undergrowth.png')
shutil.copy2(source, raw)
rgb = np.array(Image.open(raw).convert('RGB')).astype(np.int16)
h, w = rgb.shape[:2]
r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
key = (r-g > 35) & (b-g > 35) & (r > 95) & (b > 85)
alpha = np.where(key, 0, 255).astype(np.uint8)
# Despill only source-edge chroma; no replacement art is painted.
spill = (r-g > 12) & (b-g > 12)
rgb[:, :, 0][spill] = np.minimum(r[spill], g[spill]+10)
rgb[:, :, 2][spill] = np.minimum(b[spill], g[spill]+10)
rgb[key] = 0
rgba = Image.fromarray(np.dstack([rgb.clip(0, 255).astype(np.uint8), alpha]))
atlas = Image.new('RGBA', (1024, 1024))
cells = []
for row in range(2):
    top, bottom = row*h//2, (row+1)*h//2
    occupancy = (alpha[top:bottom] > 0).sum(axis=0)
    gap = [x for x in range(int(w*.46), int(w*.56)) if not occupancy[x-3:x+4].any()]
    assert gap, 'No empty gutter; regenerate instead of clipping leaves'
    split = min(gap, key=lambda x: abs(x-w/2))
    for col, (left, right) in enumerate(((0, split), (split, w))):
        crop = rgba.crop((left, top, right, bottom))
        box = crop.getbbox()
        assert box and box[0] > 0 and box[1] > 0 and box[2] < crop.width and box[3] < crop.height
        plant = crop.crop(box)
        factor = min(464/plant.width, 464/plant.height)
        # Bilinear filtering avoids ringing that reintroduces purple edge pixels.
        plant = plant.resize((round(plant.width*factor), round(plant.height*factor)), Image.Resampling.BILINEAR)
        cell = Image.new('RGBA', (512, 512))
        cell.paste(plant, ((512-plant.width)//2, 488-plant.height))
        atlas.paste(cell, (col*512, row*512))
        cells.append({'id': (['arch', 'ruin', 'stones', 'cart'] if landmarks else ['grass', 'flowers', 'fern', 'reed'])[row*2+col], 'source_crop': [left, top, right, bottom], 'bounds': list(cell.getbbox())})
target = run / f'candidate/{stem}.webp'
atlas.save(target, 'WEBP', lossless=True, method=6)
decoded = np.array(Image.open(target).convert('RGBA'))
assert decoded.shape == (1024, 1024, 4)
visible = decoded[:, :, 3] > 128
values = decoded.astype(np.int16)
magenta = visible & (values[:, :, 0]-values[:, :, 1] > 30) & (values[:, :, 2]-values[:, :, 1] > 30)
assert not magenta.any()
for row in range(2):
    for col in range(2):
        a = decoded[row*512:(row+1)*512, col*512:(col+1)*512, 3]
        assert not a[:20].any() and not a[-20:].any() and not a[:, :20].any() and not a[:, -20:].any()
        assert .08 < (a > 128).mean() < .65
for name, color in [('dark', '#18231b'), ('light', '#ddd6c5')]:
    sheet = Image.new('RGBA', atlas.size, color);sheet.alpha_composite(atlas)
    sheet.convert('RGB').save(run / f'qa/{name}.png')
report = {'status': 'candidate', 'runtime_publish_allowed': False, 'mechanical': 'passed', 'source': str(raw), 'source_sha256': hashlib.sha256(raw.read_bytes()).hexdigest(), 'candidate': str(target), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'bytes': target.stat().st_size, 'cells': cells, 'magenta_pixels': int(magenta.sum()), 'raw_layout_exception': None if landmarks else 'Fern crosses the nominal midpoint; each row is split only at a fully transparent measured gutter, then uniformly fitted into an equal runtime cell.'}
(run/'qa/atlas.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf8')
print(json.dumps(report))
