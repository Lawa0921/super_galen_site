"""review_party.py: contact sheets for the hero / rin batch (party.py).

  python review_party.py                    one PNG per character (hero, rin, rin-oath) in tmp/starlantern/art-hero-rin/:
                                            every chosen image (registry `final`) beside approved scarlet / liz art for scale
  python review_party.py cands OUT PREFIX   every postprocessed candidate (work/<id>/cand/a<N>/) of ids starting with PREFIX
"""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parents[3]
AF = REPO / 'art-factory/starlantern'
PUB = REPO / 'public/assets/games/starlantern/char'
OUT = REPO / 'tmp/starlantern/art-hero-rin'
BG = (34, 36, 56, 255)
MOODS = ['', '-attack', '-hit', '-dying', '-down', '-ultimate', '-smile', '-sad']
SCALE = 2


def _grid(cells, cols, cell_w, cell_h, labels):
    rows = (len(cells) + cols - 1) // cols
    can = Image.new('RGBA', (cols * cell_w, rows * (cell_h + 12)), BG)
    d = ImageDraw.Draw(can)
    for k, (im, lab) in enumerate(zip(cells, labels)):
        x, y = (k % cols) * cell_w, (k // cols) * (cell_h + 12)
        if im is not None: can.alpha_composite(im, (x + (cell_w - im.width) // 2, y + cell_h - im.height))
        d.text((x + 3, y + cell_h), lab, fill=(220, 220, 230, 255))
    return can.resize((can.width * SCALE, can.height * SCALE), Image.NEAREST)


def sheet(cid, reg):
    def final(aid):
        e = reg['assets'].get(aid, {})
        return Image.open(REPO / e['final']).convert('RGBA') if e.get('final') and e.get('chosen_attempt') else None
    ref = 'scarlet'
    standees = [final(f'char-{cid}-standee'), Image.open(PUB / f'{ref}-standee.png').convert('RGBA'), Image.open(PUB / 'liz-standee.png').convert('RGBA')]
    top = _grid(standees, 3, 210, 295, [f'{cid} standee', f'{ref} (published)', 'liz (published)'])
    ports = [final(f'char-{cid}-portrait{m}') for m in MOODS] + [Image.open(PUB / f'{ref}-portrait.png').convert('RGBA'), Image.open(PUB / f'{ref}-portrait-ultimate.png').convert('RGBA')]
    bot = _grid(ports, 5, 130, 125, [f'{cid} {m.strip("-") or "normal"}' for m in MOODS] + [f'{ref} normal (pub)', f'{ref} ultimate (pub)'])
    can = Image.new('RGBA', (max(top.width, bot.width), top.height + bot.height), BG)
    can.alpha_composite(top, (0, 0)); can.alpha_composite(bot, (0, top.height))
    OUT.mkdir(parents=True, exist_ok=True)
    can.save(OUT / f'{cid}.png'); return OUT / f'{cid}.png'


def cands(out, prefix):
    ids = sorted(p.name for p in (AF / 'work').iterdir() if p.name.startswith(prefix) and (p / 'cand').exists())
    cells, labels = [], []
    for aid in ids:
        for a in sorted((AF / 'work' / aid / 'cand').iterdir(), key=lambda p: int(p.name[1:])):
            f = a / f'{aid}.png'
            if f.exists():
                cells.append(Image.open(f).convert('RGBA')); labels.append(f'{aid[5:]} {a.name}')
    if not cells: print('no candidates'); return
    cw, ch = max(c.width for c in cells) + 8, max(c.height for c in cells) + 4
    cols = max(1, min(len(cells), 1800 // (cw * SCALE)))
    _grid(cells, cols, cw, ch, labels).save(out); print(out)


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'cands':
        cands(sys.argv[2], sys.argv[3])
    else:
        reg = json.loads((AF / 'registry.json').read_text(encoding='utf-8'))
        for cid in ('hero', 'rin', 'rin-oath'): print(sheet(cid, reg))
