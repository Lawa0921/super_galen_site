"""Contact sheets of the hand close-ups written by model_hands_capture.mjs (one sheet per unit).

Usage: python art-factory/rts/tools/model_hands_sheet.py <capture dir> <out dir> [cell px]
Row = clip/phase/light, columns = right then left hand x (front, 3/4, back) views (game light rows: 3/4 only).
"""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw

src, dst = Path(sys.argv[1]), Path(sys.argv[2]); cell = int(sys.argv[3]) if len(sys.argv) > 3 else 240
dst.mkdir(parents=True, exist_ok=True)
shots = json.loads((src / 'shots.json').read_text(encoding='utf-8'))['shots']
for unit in dict.fromkeys(s['id'] for s in shots):
    rows = {}
    for s in shots:
        if s['id'] == unit:
            rows.setdefault((s['clip'], s['fraction'], s['light']), {})[(s['side'], s['view'])] = s['name']
    views = [v for v in ('front', '3q', 'back') if any(s['view'] == v for s in shots if s['id'] == unit)]
    cols = [(side, v) for side in ('R', 'L') for v in views]
    label = 150
    sheet = Image.new('RGB', (label + cell * len(cols), cell * len(rows)), (24, 26, 30))
    d = ImageDraw.Draw(sheet)
    for r, ((clip, frac, light), names) in enumerate(rows.items()):
        d.text((8, r * cell + 8), f'{clip}\n{round(frac * 100)}%\n{light}', fill=(230, 230, 230))
        for c, key in enumerate(cols):
            if key in names:
                im = Image.open(src / f'{names[key]}.jpg').convert('RGB').resize((cell, cell), Image.LANCZOS)
                sheet.paste(im, (label + c * cell, r * cell))
        for c, key in enumerate(cols):
            d.text((label + c * cell + 4, r * cell + 4), f'{key[0]} {key[1]}', fill=(255, 220, 90))
    sheet.save(dst / f'{unit}-hands.jpg', quality=84)
    print(unit, sheet.size)
