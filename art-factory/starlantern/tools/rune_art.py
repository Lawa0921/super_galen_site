"""rune_art.py: art step 9 (G4) rune icons (spec 2026-10-20 skill-builds section 15).

Sample (style approved by the user 2026-10-24: 「可以」):
  gen  [--n=1]                           one codex attempt at a time until the sample sheet has N raw attempts (cap a3)
  cand                                   postprocess every raw attempt into work/sheet-rune-sample/cand/a<N>/ (scratch registry)
  pick --attempt N                       postprocess the chosen attempt into the registry (qa_passed / qa_failed, batch rune-sample, no runtime)
Full set (34 subjects in six 3 x 2 sheets, batch rune-full):
  gen-full  [--only=sheet-rune-K,...]    one new codex attempt per listed sheet, each in a new empty folder raw/<sheet>/a<N>/ (cap a2)
  cand-full [--only=...]                 postprocess every attempt into work/<sheet>/cand/a<N>/ (scratch registry) + the 14px rule
  pick-full --id SHEET --attempt N [--part P]   postprocess the chosen attempt (or one part of it) into the registry
  approve-full --by TEXT                 after the user's approval: QA passed and legible -> approved (approved_by TEXT, today)
  publish-full                           runtime icon/<part>-16.png and -14.png, copy to public/, rewrite the manifest

A rune icon is a skill-style native icon (sl_art.process_skill_cell, controller ruling G3): `icon-<part>-16` for the
workshop rows (subject long edge 14) and `icon-<part>-14` for the battle menu (long edge 12), each coverage-sampled once
from the high-resolution cell. The tier is never drawn: the approved rarity frames (ui/rarity-<tier>.png) show it.
Run from the repo root.
"""
import datetime, json, subprocess, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sl_art as A  # noqa: E402
import portal as P  # noqa: E402
import gear_art as G  # noqa: E402

REPO, AF, RAW, PROMPTS, TOOLS, WORK = G.REPO, G.AF, G.RAW, G.PROMPTS, G.TOOLS, G.WORK
SAMPLE_ID = 'sheet-rune-sample'
ATTEMPT_CAP = 3            # contract: at most 3 attempts per id, then stop and report
BATCH = 'rune-sample'

# One shared stone so every rune reads as a rune (not a skill emblem) and every subject fills the box the same way.
STONE = ('Cells 1 and 2 are rune sockets, the same square size as the runes. Cells 3 to 6 are runes: each is the same chunky '
         'rounded-square slate rune stone, seen straight on, filling its cell, with a dark outline and a symbol carved into its face that glows. '
         'The stone is the same neutral blue-grey slate in every rune; only the carved symbol changes colour. '
         # Attempt a1 (2026-10-24): cracks, a wide bevel and thin strokes became noise at 16 px; these lines are for the native size.
         'Design every icon to be shown at only 16 by 16 pixels: a flat plain stone face with no cracks, no texture and no speckles; '
         'a rim only 2 art pixels wide; the symbol huge, filling about three quarters of the face, drawn with strokes at least 4 art pixels thick '
         'in one solid glow colour with one darker edge tone; no small parts, no thin lines')
RUNE_DESC = {
    'rune-slot-empty': ('an empty rune socket: a thick round bronze ring set in a square dark slate base, the hollow inside the ring flat, '
                        'dark and empty, no stone and no symbol in it, no studs on the ring'),
    'rune-slot-filled': ('the same thick round bronze ring socket on the same square dark slate base, now filled by a round slate rune stone '
                         'whose big carved four-point star glows pale cyan-white, no studs on the ring'),
    'rune-flame': 'a rune stone carved with one huge bold flame glowing orange-red with a yellow core',
    'rune-spread': ('a rune stone carved with one huge bold symbol glowing pale cyan-white: a thick short stem at the bottom splitting into '
                    'three thick arrowheads pointing up-left, up and up-right'),
    'rune-on-crit': 'a rune stone carved with one huge bold four-point burst star glowing gold, a thick curved arrow sweeping out of its right side',
    'rune-twin-cast': ('the rarest rune: the same rune stone with its rim made of plain polished gold instead of slate, no claws and no gems, '
                       'carved with two huge thick overlapping rings glowing bright orange-gold'),
}
SAMPLE_PARTS = list(RUNE_DESC)


def sample_job():
    listing = G._listing(SAMPLE_PARTS, RUNE_DESC)
    prompt = G.ICON_SHEET.format(what='rune', shape='a rune stone that reads instantly at small size', extra=STONE + '. ',
                                 listing=listing, noun='rune stone',
                                 refs='Match the drawing style, outline, shading and palette of the attached approved equipment sheet (the style anchor). ')
    return dict(id=SAMPLE_ID, kind='icon-sheet', cols=3, rows=2, parts=list(SAMPLE_PARTS), batch=BATCH,
                images=[G.GEAR_ANCHOR, G.ICONS_OLD], prompt=prompt)


def assets_of(part):
    return [f'icon-{part}-{A.SKILL_TAB[1]}', f'icon-{part}-{A.SKILL_TREE[1]}']


def attempts():
    files = [p for p in (RAW / SAMPLE_ID).glob(f'{SAMPLE_ID}-a*.png') if not p.stem.endswith('-magenta')]
    return sorted(files, key=lambda p: int(p.stem.rsplit('-a', 1)[1]))


def gen(argv):
    """One codex call per missing attempt; refuses past the cap (stop and report, never loop)."""
    n = int(G._opt(argv, 'n', 1)); job = sample_job()
    while len(attempts()) < n:
        if len(attempts()) >= ATTEMPT_CAP:
            raise PermissionError(f'{SAMPLE_ID} is at its attempt cap a{ATTEMPT_CAP}; stop and report')
        k = max([int(p.stem.rsplit('-a', 1)[1]) for p in attempts()] + [0]) + 1
        PROMPTS.mkdir(exist_ok=True)
        (PROMPTS / f'{SAMPLE_ID}.txt').write_text(job['prompt'].strip() + ' ' + G.GEN + '\n', encoding='utf-8')
        name = f'{SAMPLE_ID}-a{k}.png'
        argv2 = [sys.executable, str(TOOLS / 'codex_still.py'), 'generate', '--workdir', str(RAW / SAMPLE_ID), '--name', name,
                 '--prompt-file', str(PROMPTS / f'{SAMPLE_ID}.txt')]
        for im in job['images']: argv2 += ['--image', str(im)]
        start = time.time()
        g = subprocess.run(argv2, cwd=REPO, capture_output=True, text=True, encoding='utf-8', errors='replace')
        print(f'[gen {SAMPLE_ID} a{k}] rc={g.returncode} {g.stdout.strip()[-300:]} {g.stderr.strip()[-300:]}', flush=True)
        import party
        fixed = party.recover(RAW / SAMPLE_ID, name, start, time.time())
        if fixed: print(f'[recovered a{k}] codex saved {fixed}', flush=True)
        if not (RAW / SAMPLE_ID / name).exists():
            print(f'[no output] a{k}; stopping (check the codex log for a usage limit)', flush=True); return


def process_sheet(reg, raw, workdir, batch=None):
    """Cut the 3 x 2 sheet on its magenta lanes and make each part's two native icons. Returns {registry id: qa}."""
    from PIL import Image
    job = sample_job(); img = Image.open(raw).convert('RGB')
    out = {}
    for cell, part in zip(P.sheet_cells(img, job['cols'], job['rows']), job['parts']):
        res = A.process_skill_cell(reg, part, cell, workdir, raw)
        for aid in res:
            if batch: reg.set(aid, batch=batch, sheet=SAMPLE_ID)
        out.update(res)
    return out


def consistency(runes, skills, short_tol=2, mass_tol=0.12):
    """Subject size against the existing skill icons of the same box: the long edge is fixed by the sampler, so the
    short side and the mass (opaque share of the bbox) carry how big a subject looks. Flags a rune outside the skill
    icons' range widened by the tolerance."""
    lo_s, hi_s = min(s['short'] for s in skills) - short_tol, max(s['short'] for s in skills) + short_tol
    lo_m, hi_m = min(s['mass'] for s in skills) - mass_tol, max(s['mass'] for s in skills) + mass_tol
    out = {}
    for aid, m in runes.items():
        flags = []
        if not lo_s <= m['short'] <= hi_s: flags.append('short side far from the skill icons')
        if not lo_m <= m['mass'] <= hi_m: flags.append('mass far from the skill icons')
        out[aid] = dict(m, flags=flags)
    return out


def cand(argv):
    for raw in attempts():
        k = raw.stem.rsplit('-a', 1)[1]; wd = WORK / SAMPLE_ID / 'cand' / f'a{k}'
        reg = A.Registry(wd / 'cand-registry.json')
        try:
            res = process_sheet(reg, raw, wd)
        except ValueError as e:
            print(f'[cand a{k}] FAILED: {e}', flush=True); continue
        for aid, q in res.items():
            print(f'[cand a{k}] {aid}: {"pass" if q["pass"] else q["reasons"]} {q.get("warnings") or ""} {q.get("subject")}', flush=True)


def pick(argv):
    k = int(G._arg(argv, '--attempt'))
    raw = RAW / SAMPLE_ID / f'{SAMPLE_ID}-a{k}.png'
    reg = G._registry()
    res = process_sheet(reg, raw, WORK / SAMPLE_ID, batch=BATCH)
    reg.set(SAMPLE_ID, chosen_attempt=f'a{k}', batch=BATCH, prompt=f'art-factory/starlantern/prompts/{SAMPLE_ID}.txt')
    print(json.dumps({a: q['pass'] for a, q in res.items()}, indent=1))


# --- the full set ---------------------------------------------------------------------------------------------------------
# The user approved the sample's style on 2026-10-24 (「可以」): the a2 prompt (STONE) stays, the approved a2 raw is the
# first reference. FULL_RULES and the redrawn parts carry what the sample showed at 14 px.
FULL_BATCH = 'rune-full'
FULL_CAP = 2
SAMPLE_RAW = RAW / SAMPLE_ID / f'{SAMPLE_ID}-a2.png'
FULL_RULES = ('Match the stone, rim, outline, palette and pixel scale of the attached approved rune sheet (the first image) exactly; '
              'this sheet continues the same set. Every symbol must still read when the icon is shown at only 14 by 14 pixels: '
              'one or two big solid shapes, strokes at least 5 art pixels thick, open gaps inside a symbol at least 4 art pixels wide, '
              'no thin lines, no small sparks, no outlines inside the symbol; the symbol never runs along the stone rim')
_S = 'a rune stone carved with one huge bold '
RUNE_FULL = {
    'rune-slot-empty': RUNE_DESC['rune-slot-empty'],
    # a2 (2026-10-24): a1's star stayed as small as the sample's at 14px.
    'rune-slot-filled': ('the same thick round bronze ring socket on the same square dark slate base, filled by one huge four-point star '
                         'glowing pale cyan-white that fills the whole inside of the ring, its four points touching the bronze ring on all '
                         'four sides, no stone visible around the star, no studs on the ring'),
    # shape: pale cyan-white
    'rune-spread': (_S + 'symbol glowing pale cyan-white: three very thick short arrows fanning up-left, up and up-right from one solid '
                    'point at the bottom, wide gaps between the arrows'),
    'rune-focus': _S + 'symbol glowing pale cyan-white: a very thick ring around one big solid round dot, a wide gap between ring and dot',
    'rune-bounce': (_S + 'symbol glowing pale cyan-white: one very thick arrow in a V path, going down to the right then up to the right, '
                    'ending in a big arrowhead'),
    # hits: steel white
    'rune-multistrike': _S + 'symbol glowing steel-white: two very thick parallel diagonal slash marks with a wide gap between them',
    'rune-heavy': _S + 'symbol glowing steel-white: one huge solid downward arrow landing on a very thick flat bar',
    # element
    'rune-flame': RUNE_DESC['rune-flame'],
    'rune-rime': _S + 'snowflake glowing pale icy blue: three very thick crossing bars, no small branches',
    'rune-thunderclap': _S + 'zigzag lightning bolt glowing bright yellow, very thick',
    # ailment: the colours of the game's ailment labels
    'rune-ignite': _S + 'symbol glowing orange: a round burning ember with two thick flame tongues rising from its top',
    'rune-jolt': _S + 'symbol glowing bright yellow: a solid round spark ball with four very thick short zigzag rays',
    'rune-tear': _S + 'symbol glowing crimson red: three very thick parallel claw tears slanting down to the left',
    'rune-frostbite': _S + 'symbol glowing pale cyan: one solid ice cube seen at an angle with one bright highlight edge',
    # Sheet 3 a1's dark violet drop sank into the slate at 14px; a2's pink was keyed out like magenta. Sheet 5: blue-violet.
    'rune-venom': (_S + 'symbol: one big fat poison droplet filling most of the face, glowing bright blue-violet (the colour of a violet '
                   'flower, never pink, never magenta) with a white core and a dark indigo outline, no bubble'),
    # a2: a1's ring wave ran along the rim like a frame.
    'rune-aftermath': (_S + 'symbol glowing rose red: one big solid six-point impact burst in the middle of the face with two short thick '
                       'curved wave arcs at its left and right, the arcs well inside the rim, no ring around it'),
    # trigger: gold, each with the same thick curved arrow at its top right
    'rune-on-crit': (_S + 'symbol glowing gold: one huge solid four-point star filling most of the face, and one very thick short curved '
                     'arrow at its top-right corner; no other details'),
    'rune-on-kill': (_S + 'symbol glowing gold: a very thick X mark of two crossed strokes, and one very thick short curved arrow at its '
                     'top-right corner'),
    'rune-on-struck': _S + 'symbol glowing gold: a solid round-bottomed shield, and one very thick short curved arrow at its top-right corner',
    # economy: green
    'rune-regain': _S + 'symbol glowing bright green: two very thick curved arrows chasing each other around a circle',
    'rune-thrift': _S + 'symbol glowing bright green: one fat droplet with one very thick down-pointing chevron below it',
    'rune-charge': _S + 'symbol glowing bright green: three very thick upward chevrons stacked one above another',
    'rune-drain': _S + 'symbol glowing crimson: one fat heart with one very thick curved arrow curling into its top',
    # support: teal and lime
    'rune-extend': _S + 'symbol glowing teal: a round clock face with one very thick hand and a very thick arrow around its rim',
    'rune-share': _S + 'symbol glowing teal: three big solid round dots in a triangle joined by very thick bars',
    'rune-lasting': _S + 'infinity loop glowing teal, very thick strokes, two clearly open loops',
    'rune-dispel': _S + 'symbol glowing lime green: one big solid four-point sparkle star with one small solid four-point star beside it',
    'rune-armor-break': _S + 'symbol glowing steel-white: a solid shield split down its middle by a wide jagged crack glowing orange',
    # legendary: the same slate stone and rim (the tier frame shows the tier), the symbol in orange-gold
    # a2: a1's rings had spirals inside them and blurred at 14px.
    'rune-twin-cast': (_S + 'symbol glowing bright orange-gold: two plain flat rings side by side overlapping a little, each ring one simple '
                       'thick band 5 art pixels wide around a large empty slate-coloured hole, no inner lines, no spiral, no highlight '
                       'lines inside the rings; the stone keeps its plain slate rim, no gold edge, no frame, no mount'),
    'rune-starwheel': _S + 'symbol: three very thick curved arrows chasing each other in a circle, one orange-red, one ice blue, one yellow',
    'rune-blood-price': _S + 'symbol: one big fat crimson blood drop with one solid gold four-point star in its middle',
    'rune-sync': _S + 'symbol glowing orange-gold: two very thick arrows side by side, both pointing up to the right',
    'rune-spill-shield': _S + 'symbol glowing orange-gold: one solid round shield with a very thick bright green plus cross in its middle',
    # a2: a1's two arcs and arrow ran together at 14px.
    'rune-reprise': _S + 'symbol glowing orange-gold: one big solid triangle arrowhead pointing right, and behind it one single very thick curved arc; nothing else',
}
FULL_SHEETS = {
    'sheet-rune-1': ['rune-slot-empty', 'rune-slot-filled', 'rune-spread', 'rune-focus', 'rune-bounce', 'rune-multistrike'],
    'sheet-rune-2': ['rune-heavy', 'rune-flame', 'rune-rime', 'rune-thunderclap', 'rune-ignite', 'rune-jolt'],
    # Cell 3 was 淬毒 in both of this sheet's attempts (prompts in raw/sheet-rune-3/a1, a2): a1's dark violet sank into the slate
    # and a2's pink was taken for the magenta key and despilled to grey; 淬毒 moved to sheet 5's spare cell, in a blue-violet.
    'sheet-rune-3': ['rune-tear', 'rune-frostbite', None, 'rune-aftermath', 'rune-on-crit', 'rune-on-kill'],
    'sheet-rune-4': ['rune-on-struck', 'rune-regain', 'rune-thrift', 'rune-charge', 'rune-drain', 'rune-extend'],
    'sheet-rune-5': ['rune-share', 'rune-lasting', 'rune-dispel', 'rune-armor-break', 'rune-venom', None],
    'sheet-rune-6': ['rune-twin-cast', 'rune-starwheel', 'rune-blood-price', 'rune-sync', 'rune-spill-shield', 'rune-reprise'],
}
SLOT_SENTENCE = 'Cells 1 and 2 are rune sockets, the same square size as the runes. Cells 3 to 6 are runes: each is'


def full_jobs():
    out = []
    for sid, parts in FULL_SHEETS.items():
        desc = {p: RUNE_FULL[p] for p in parts if p}
        prompt = G.ICON_SHEET.format(what='rune', shape='a rune stone that reads instantly at small size', extra=f'{STONE}. {FULL_RULES}. ',
                                     listing=G._listing(parts, desc), noun='rune stone',
                                     refs='Match the drawing style, outline, shading and palette of the attached approved equipment sheet (the second image). ')
        if not any(p and p.startswith('rune-slot') for p in parts):
            prompt = prompt.replace(SLOT_SENTENCE, 'Every cell is a rune: each is')
        out.append(dict(id=sid, kind='icon-sheet', cols=3, rows=2, parts=list(parts), batch=FULL_BATCH,
                        images=[SAMPLE_RAW, G.GEAR_ANCHOR], prompt=prompt))
    return out


def full_attempts(sid):
    d = RAW / sid
    files = [p for p in d.glob(f'a*/{sid}-a*.png') if not p.stem.endswith('-magenta')] if d.exists() else []
    return sorted(files, key=lambda p: int(p.stem.rsplit('-a', 1)[1]))


def _full_selected(argv):
    only = G._opt(argv, 'only')
    return [j for j in full_jobs() if not only or j['id'] in only.split(',')]


def gen_full(argv):
    """One new attempt per selected sheet, one codex call at a time, each in a new empty folder; refuses past a2."""
    import party
    for job in _full_selected(argv):
        sid = job['id']; done = full_attempts(sid)
        k = max([int(p.stem.rsplit('-a', 1)[1]) for p in done] + [0]) + 1
        if k > FULL_CAP: raise PermissionError(f'{sid} is at its attempt cap a{FULL_CAP}; stop and report')
        wd = RAW / sid / f'a{k}'
        if wd.exists() and any(wd.iterdir()): raise FileExistsError(f'{wd} is not empty; a new attempt needs a new empty folder')
        PROMPTS.mkdir(parents=True, exist_ok=True)
        (PROMPTS / f'{sid}.txt').write_text(job['prompt'].strip() + ' ' + G.GEN + '\n', encoding='utf-8')
        name = f'{sid}-a{k}.png'
        argv2 = [sys.executable, str(TOOLS / 'codex_still.py'), 'generate', '--workdir', str(wd), '--name', name,
                 '--prompt-file', str(PROMPTS / f'{sid}.txt')]
        for im in job['images']: argv2 += ['--image', str(im)]
        start = time.time()
        g = subprocess.run(argv2, cwd=REPO, capture_output=True, text=True, encoding='utf-8', errors='replace')
        print(f'[gen {sid} a{k}] rc={g.returncode} {g.stdout.strip()[-300:]} {g.stderr.strip()[-300:]}', flush=True)
        if (wd / name).exists() and (wd / f'{Path(name).stem}.gen.json').exists():
            fixed = party.recover(wd, name, start, time.time())
            if fixed: print(f'[recovered {sid} a{k}] codex saved {fixed}', flush=True)
        if not (wd / name).exists():
            print(f'[no output] {sid} a{k}; stopping (check the codex log in {wd} for a usage limit)', flush=True); return False
    return True


# The 14px rule (sample 2026-10-24; revised on the full set's first sheets): a rune's symbol must read at 14 x 14. Measured
# on the final -14 PNG. Symbol pixels are the opaque ones that are neither the blue-grey slate (hue 0.52-0.70 and value
# <= 0.6) nor the dark outline (value < 0.2). A symbol may be several deliberate parts (a ring and its dot, two slashes);
# what fails is a small symbol, one that crumbles into specks, or one that runs along the rim like a frame. The rule is a
# floor: every icon is also looked at in the review page at 1x, 2x and 4x.
LEG_MIN_AREA = 26        # symbol pixels inside the rim (the 8 x 8 face of a 14px icon)
LEG_MIN_BOX = 6          # the parts of 4 px or more span at least this many of the face's 8 pixels both ways
LEG_SPECK = 3            # a piece of at most this many pixels is a speck
LEG_SPECK_MAX = 0.15     # share of the symbol in specks
LEG_STAR_MIN = 18        # the filled slot's star inside the rim: larger than the approved sample's 17 (asked for at 14px)
LEG_EDGE_MAX = 0.35      # share of the subject's outer 2px ring that is symbol (a frame-like edge: the sample's 雙重詠唱)


def _symbol_mask(img):
    import colorsys
    import numpy as np
    a = np.asarray(img.convert('RGBA')).astype(float) / 255
    op = a[..., 3] >= 1.0; sym = np.zeros(op.shape, bool)
    for y, x in zip(*np.nonzero(op)):
        h, s, v = colorsys.rgb_to_hsv(*a[y, x, :3])
        sym[y, x] = not ((0.52 <= h <= 0.70 and v <= 0.6) or v < 0.2)
    return op, sym


def _pieces(mask):
    import numpy as np
    lab = np.zeros(mask.shape, int); k = 0
    for y, x in zip(*np.nonzero(mask)):
        if lab[y, x]: continue
        k += 1; stack = [(y, x)]; lab[y, x] = k
        while stack:
            cy, cx = stack.pop()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < mask.shape[0] and 0 <= nx < mask.shape[1] and mask[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = k; stack.append((ny, nx))
    return lab, k


def legibility(img, part):
    """The 14px rule on one -14 icon: {'reasons': [...], metrics}. The empty slot's subject is its dark hollow, so it only
    needs that hollow (at least 16 non-symbol pixels inside the ring); the slot icons may run along their edge (the ring)."""
    import colorsys
    import numpy as np
    op, sym = _symbol_mask(img)
    a = np.asarray(img.convert('RGBA')).astype(float) / 255
    ys, xs = np.nonzero(op)
    if not len(ys): return {'reasons': ['no subject']}
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    ring = np.zeros(op.shape, bool); ring[y0:y1, x0:x1] = True; ring[y0 + 2:y1 - 2, x0 + 2:x1 - 2] = False
    edge = round(float((sym & ring).sum()) / max(int((op & ring).sum()), 1), 2)
    sym = sym & ~ring   # the rim's own highlight (light from the upper left) is not the symbol; its edge share is `edge`
    lab, n = _pieces(sym)
    sizes = [int((lab == i).sum()) for i in range(1, n + 1)]
    area = int(sym.sum()); m = {'area': area, 'pieces': n}
    reasons = []
    if part == 'rune-slot-empty':
        inner = op[y0 + 3:y1 - 3, x0 + 3:x1 - 3] & ~sym[y0 + 3:y1 - 3, x0 + 3:x1 - 3]   # sym is already without the rim
        m['hollow'] = int(inner.sum())
        if inner.sum() < 16: reasons.append('slot hollow too small at 14px')
        return dict(m, reasons=reasons)
    if part == 'rune-slot-filled':
        # The filled slot's symbol is its star (pale cyan-white); the bronze ring around it is cut by the face window.
        star = np.zeros(sym.shape, bool)
        for y, x in zip(*np.nonzero(sym)):
            h, sat, v = colorsys.rgb_to_hsv(*a[y, x, :3])
            star[y, x] = v >= 0.75 and (0.45 <= h <= 0.62 or sat < 0.25)
        m['star'] = int(star.sum())
        if star.any():
            sy, sx = np.nonzero(star); m['box'] = [int(np.ptp(sx)) + 1, int(np.ptp(sy)) + 1]
        if m['star'] < LEG_STAR_MIN or min(m.get('box', [0])) < LEG_MIN_BOX: reasons.append('slot star too small at 14px')
        return dict(m, reasons=reasons)
    big = [i + 1 for i, z in enumerate(sizes) if z > LEG_SPECK]
    if big:
        py, px = np.nonzero(np.isin(lab, big)); m['box'] = [int(np.ptp(px)) + 1, int(np.ptp(py)) + 1]
    m['specks'] = round(sum(z for z in sizes if z <= LEG_SPECK) / max(area, 1), 2)
    m['edge'] = edge
    if area < LEG_MIN_AREA or not big or min(m['box']) < LEG_MIN_BOX: reasons.append('symbol too small at 14px')
    elif m['specks'] > LEG_SPECK_MAX: reasons.append('symbol broken into bits at 14px')
    if not part.startswith('rune-slot') and m['edge'] > LEG_EDGE_MAX: reasons.append('symbol runs along the edge like a frame')
    return dict(m, reasons=reasons)


def process_full(reg, job, raw, workdir, parts=None, batch=None):
    from PIL import Image
    img = Image.open(raw).convert('RGB'); out = {}
    for cell, part in zip(P.sheet_cells(img, job['cols'], job['rows']), job['parts']):
        if part is None or (parts and part not in parts): continue
        if batch:   # the sample's record of the same id (rune-sample, approved style) stays as history
            for aid in assets_of(part):
                old = reg.data['assets'].get(aid)
                if old and old.get('batch') == BATCH:
                    reg.data['assets'][aid] = {'history': [*old.get('history', []), {k: v for k, v in old.items() if k != 'history'}]}
        res = A.process_skill_cell(reg, part, cell, workdir, raw)
        leg = legibility(Image.open(Path(workdir) / f'icon-{part}-14.png'), part)
        for aid in res:
            reg.set(aid, legible=leg, sheet=job['id'], **({'batch': batch, 'chosen_attempt': Path(raw).stem.rsplit('-', 1)[1]} if batch else {}))
            res[aid] = dict(res[aid], legible=leg['reasons'])
        out.update(res)
    return out


def cand_full(argv):
    for job in _full_selected(argv):
        for raw in full_attempts(job['id']):
            k = raw.stem.rsplit('-a', 1)[1]; wd = WORK / job['id'] / 'cand' / f'a{k}'
            reg = A.Registry(wd / 'cand-registry.json')
            try:
                res = process_full(reg, job, raw, wd)
            except ValueError as e:
                print(f'[cand {job["id"]} a{k}] FAILED: {e}', flush=True); continue
            for aid, q in res.items():
                print(f'[cand {job["id"]} a{k}] {aid}: {"pass" if q["pass"] else q["reasons"]} legible={q["legible"] or "ok"} '
                      f'{reg.get(aid)["legible"]}', flush=True)


def pick_full(argv):
    sid = G._arg(argv, '--id'); k = int(G._arg(argv, '--attempt')); part = G._arg(argv, '--part')
    job = next(j for j in full_jobs() if j['id'] == sid)
    raw = RAW / sid / f'a{k}' / f'{sid}-a{k}.png'
    res = process_full(G._registry(), job, raw, WORK / sid, parts=[part] if part else None, batch=FULL_BATCH)
    print(json.dumps({a: [q['pass'], q['legible']] for a, q in res.items()}, ensure_ascii=False))


def full_assets(reg):
    return sorted(a for a, e in reg.data['assets'].items() if e.get('batch') == FULL_BATCH and a.startswith('icon-rune-'))


def do_approve(reg, by):
    aids = full_assets(reg)
    bad = [a for a in aids if not reg.get(a).get('qa', {}).get('pass') or reg.get(a).get('legible', {}).get('reasons')]
    if bad: raise PermissionError(f'not approvable (QA or the 14px rule failed): {bad}')
    for a in aids:
        reg.set(a, status='approved', approved_by=by, approved_on=datetime.date.today().isoformat())
    return aids


def runtime(aid):
    return f'{A.BASE}icon/{aid[len("icon-"):]}.png'


def do_publish(reg, public):
    aids = full_assets(reg)
    if not aids or any(reg.get(a).get('status') not in ('approved', 'published') for a in aids):
        raise PermissionError('approve the full set first (approve-full --by ...)')
    for a in aids:
        reg.set(a, runtime=runtime(a)); reg.publish(a, public)
    reg.write_manifest(public)
    return aids


def approve_full(argv):
    print(len(do_approve(G._registry(), G._arg(argv, '--by'))), 'approved')


def publish_full(argv):
    print(len(do_publish(G._registry(), G.PUBLIC)), 'published')


if __name__ == '__main__':
    cmd, rest = sys.argv[1], sys.argv[2:]
    {'gen': gen, 'cand': cand, 'pick': pick, 'gen-full': gen_full, 'cand-full': cand_full, 'pick-full': pick_full,
     'approve-full': approve_full, 'publish-full': publish_full}[cmd](rest)
