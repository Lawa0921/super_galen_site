"""Resize and seam-blend generated meadow pixels; no invented artwork."""
from pathlib import Path
import hashlib, json, shutil
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / 'art-factory/rts/runs/meadow-surface/v1'
SOURCE = Path(r'C:\Users\bag57\.codex\generated_images\01a105df-d576-7703-84fa-155fdc78b299\exec-9e384754-d846-43a3-a976-249206b71ce0.png')
for folder in ('raw', 'candidate', 'qa', 'prompts'):
    (RUN / folder).mkdir(parents=True, exist_ok=True)
shutil.copyfile(SOURCE, RUN / 'raw/meadow.png')
pixels = np.array(Image.open(SOURCE).convert('RGB').resize((1024, 1024), Image.Resampling.LANCZOS), dtype=np.float32)
for axis in (0, 1):
    pixels = np.moveaxis(pixels, axis, 0)
    for offset in range(48):
        first, last = pixels[offset].copy(), pixels[-offset-1].copy()
        average = (first + last) / 2
        weight = (1 - offset / 48) ** 2
        pixels[offset] = first * (1-weight) + average * weight
        pixels[-offset-1] = last * (1-weight) + average * weight
    pixels = np.moveaxis(pixels, 0, axis)
candidate = RUN / 'candidate/meadow.webp'
Image.fromarray(np.uint8(np.clip(pixels, 0, 255))).save(candidate, 'WEBP', quality=88, method=6)
decoded = Image.open(candidate).convert('RGB')
array = np.array(decoded, dtype=np.float32)
edge_mae = [float(np.abs(array[0]-array[-1]).mean()), float(np.abs(array[:,0]-array[:,-1]).mean())]
assert max(edge_mae) < 8, edge_mae
tile = decoded.resize((256,256), Image.Resampling.LANCZOS)
preview = Image.new('RGB', (1024,1024))
for y in range(4):
    for x in range(4):
        preview.paste(tile, (x*256,y*256))
preview.save(RUN / 'qa/tile-4x4.png')
target = ROOT / 'public/assets/games/rts/terrain/meadow.webp'
target.parent.mkdir(parents=True, exist_ok=True)
shutil.copyfile(candidate, target)
report = {'mechanical':'passed', 'dimensions':[1024,1024], 'opposite_edge_mae_rgb':edge_mae, 'seam_threshold':8,
          'bytes':candidate.stat().st_size, 'sha256':hashlib.sha256(candidate.read_bytes()).hexdigest(),
          'raw_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(), 'alpha':'opaque',
          'assembly_review':'pending-scene', 'source':'builtin-imagegen', 'original_source':str(SOURCE),
          'runtime':'/assets/games/rts/terrain/meadow.webp', 'postprocess':'art-factory/rts/tools/prepare_terrain.py'}
assert hashlib.sha256(target.read_bytes()).hexdigest() == report['sha256']
(RUN / 'qa/report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
contract = ROOT / 'art-factory/rts/contracts/meadow-surface.json'
data = json.loads(contract.read_text(encoding='utf-8'))
data.update({'status':'published','runtime_publish_allowed':True,'qa':str((RUN/'qa/report.json').relative_to(ROOT)).replace('\\','/')})
contract.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8',newline='\n')
registry=ROOT/'art-factory/rts/manifests/terrain-registry.json'
registry.write_text(json.dumps({'assets':[{'id':'meadow-surface','status':'published',**report}]},indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps(report))
