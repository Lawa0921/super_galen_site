"""g4_art.py: art step 9 (G4) SAMPLE (spec 2026-10-20 skill-builds §15): new skill icons, ailment icons, mechanic counters.

  gen  [--only=SHEET,...]                one new codex attempt per listed sheet, each in a new empty folder raw/<sheet>/a<N>/ (cap a2)
  cand [--only=...]                      postprocess every attempt into work/<sheet>/cand/a<N>/ (scratch registry)
  pick --id SHEET --attempt N [--part P] postprocess the chosen attempt into the registry: status `review` (QA passed) or
                                         `qa_failed`, batch g4-sample, never a runtime path (nothing is approved or published)

Survey: art-factory/starlantern/runs/2026-10-24-g4-survey.md. Same pipeline as the rune icons (rune_art.py, G3): a codex
magenta sheet, each cell coverage-sampled once per native size by sl_art.process_skill_cell (bbox normalised, never an
upsample), QA residue / semi alpha / canvas cut / spill / key tint, long edge exact and centred.

Native sizes (survey §3): a new skill icon is a skill icon (16 x 16 tab row, long edge 14; 14 x 14 tree, long edge 12).
An ailment or mechanic icon sits in front of its 12 px word in a 14 px chip line (partyBar .slx-ail / .slx-mech, the
enemy row AIL_ROW_H 14): 14 x 14 (long edge 12, like the rune battle badge) and 12 x 12 (long edge 10, like .slx-ico);
the sample makes both so the user can see which reads. Numbers stay game text, never in the image.
Run from the repo root.
"""
import json, re, subprocess, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sl_art as A  # noqa: E402
import portal as P  # noqa: E402
import gear_art as G  # noqa: E402

REPO, AF, RAW, PROMPTS, TOOLS, WORK = G.REPO, G.AF, G.RAW, G.PROMPTS, G.TOOLS, G.WORK
BATCH = 'g4-sample'
CAP = 2                    # brief: at most 2 attempts per sheet, then stop and report

SKILL_SIZES = (A.SKILL_TAB, A.SKILL_TREE)          # ((14, 16), (12, 14))
CHIP_SIZES = ((12, 14), (10, 12))                  # ailment / mechanic chip icons
# A chip icon is one solid symbol: more enclosed transparent pixels than this, in either size, is an over-erased interior
# (sample a1: 中毒's pink lilac was keyed out as magenta, 13 hole pixels at 14 px; 流血's real gaps between its two drops
# and the slash are 4). Skill icons keep the skill-cell rule (a warning).
HOLE_MAX = 6

# The chip colours (render/ailmentStyle.ts AILMENT_FILL, render/mechStyle.ts MECH_FILL = $slx-ailment / $slx-mech):
# the icon's main colour is the colour of the word it stands in front of.
AIL_COLOUR = {'ail-burn': '#fe8a57', 'ail-freeze': '#92ebfd', 'ail-chill': '#8ea8fe', 'ail-shock': '#ffe845',
              'ail-bleed': '#ff5c74', 'ail-poison': '#b889fe', 'ail-sleep': '#c1c5d6'}
MECH_TONE = {'mech-heat': 'heat', 'mech-coins': 'coins', 'mech-embers': 'embers', 'mech-beat': 'beat',
             'mech-shield': 'devices', 'mech-moon-full': 'moon'}
MECH_COLOUR = {'mech-heat': '#ff9a10', 'mech-coins': '#d3ae46', 'mech-embers': '#ff3c2a', 'mech-beat': '#3fd8c4',
               'mech-shield': '#c0a081', 'mech-moon-full': '#e6c6ff'}

DESC = {
    # new skills (spec §8 「換」); the owner's colour scheme is in each cell, since one sheet holds four characters
    'purify-ward': ('a red and white paper shrine charm hanging inside a thick ring of pale green cleansing light '
                    '(Chizuru: red and white with sky-blue cords)'),
    'pickpocket': ('a brown leather glove snatching two big gold coins out of a small open brown pouch, short orange motion lines '
                   '(Liz: orange, brass and brown)'),
    'cover': ('a black and gold kite shield stepping in front of a small white heart, one thick crimson guard arc over both '
              '(Scarlet: crimson, black and gold)'),
    'repair-drone': ('a small round brass drone with two stubby propellers on top, carrying a big green healing cross below it '
                     '(Bobby: yellow, brass and steel)'),
    # ailments: one bold symbol each in the colour of the game's ailment word
    'ail-burn': 'one fat flame tongue in bright orange #FE8A57 with a yellow core, rising from a small dark charred spot',
    'ail-freeze': 'one chunky six-sided ice crystal block in pale cyan #92EBFD with one bright white highlight edge',
    'ail-chill': ('the same ice crystal block as icon 2 but a little smaller and in periwinkle blue #8EA8FE, '
                  'with one thick downward chevron under it'),
    'ail-shock': 'one very thick zigzag lightning bolt in bright yellow #FFE845 with two short spark ticks beside it',
    'ail-bleed': 'two fat blood drops in rose red #FF5C74, one big and one small, with one short thick slash mark above them',
    # a2: a1's pink lilac was keyed out as magenta (the drop came out hollow); the rune 淬毒 fix: blue-violet, white core.
    'ail-poison': ('one big fat poison drop filling most of the icon, glowing bright blue-violet (the colour of a violet flower, '
                   'never pink, never magenta) with a white core and a dark indigo outline, one small dark indigo bubble in it'),
    # mechanic counters (the number is game text beside the icon, never drawn)
    'mech-heat': 'a round glowing furnace heart: a bright amber #FF9A10 ball with three short thick flame tips on its top',
    'mech-coins': 'a short stack of three thick gold coins #D3AE46 seen slightly from above, one coin leaning on the stack',
    'mech-embers': 'three glowing coals in deep red-orange #FF3C2A clustered together, the biggest in front, dark cracks between',
    'mech-beat': 'one bold musical eighth note in teal #3FD8C4 with a thick stem and a thick flag',
    'mech-shield': 'a round bubble shield of pale steel-blue light with a thick bright rim and one white glint',
    'mech-moon-full': 'a round full moon disc in pale lilac-white #E6C6FF with two soft darker craters',
}
SAMPLE_SHEETS = {
    'sheet-g4-skill-sample': (2, 2, ['purify-ward', 'pickpocket', 'cover', 'repair-drone']),
    'sheet-g4-ailment-sample': (3, 2, ['ail-burn', 'ail-freeze', 'ail-chill', 'ail-shock', 'ail-bleed', 'ail-poison']),
    'sheet-g4-mech-sample': (3, 2, ['mech-heat', 'mech-coins', 'mech-embers', 'mech-beat', 'mech-shield', 'mech-moon-full']),
}
AILMENTS = [p for p in DESC if p.startswith('ail-')]
REFS = 'The attached approved equipment sheet (the first image) is the style anchor: match its drawing style, outline, shading and palette. '
CHIP_RULES = ('These are tiny status icons shown in front of a 12-pixel word in a battle status row: design each to be read at '
              'only 12 by 12 pixels. One single bold silhouette per icon, no plate, no stone, no frame behind it; '
              'strokes at least 5 art pixels thick, no thin lines, no small sparkles, no detail smaller than 4 art pixels; '
              'the main colour is the given hex colour with one darker and one lighter tone of it. ')
SKILL_RULES = ('Each skill icon is one bold emblem designed to read at only 16 by 16 pixels, like the attached existing skill icons: '
               'big simple shapes, no detail smaller than 3 art pixels. ')


def kind_of(part):
    return 'ailment' if part.startswith('ail-') else 'mech' if part.startswith('mech-') else 'skill'


def sizes_of(part):
    return SKILL_SIZES if kind_of(part) == 'skill' else CHIP_SIZES


def assets_of(part):
    return [f'icon-{part}-{size}' for _, size in sizes_of(part)]


def _prompt(sid, cols, rows, parts):
    kind = kind_of(parts[0])
    extra = SKILL_RULES if kind == 'skill' else CHIP_RULES
    what = {'skill': 'skill', 'ailment': 'status ailment', 'mech': 'battle counter'}[kind]
    shape = 'one bold emblem that reads instantly at small size' if kind == 'skill' else 'one bold symbol that reads instantly at tiny size'
    p = G.ICON_SHEET.format(what=what, shape=shape, extra=extra, listing=G._listing(parts, DESC),
                            noun='emblem' if kind == 'skill' else 'symbol', refs=REFS)
    if (cols, rows) == (2, 2):
        p = p.replace('A 3 by 2 grid of six', 'A 2 by 2 grid of four')
    return p


def sample_jobs():
    return [dict(id=sid, kind='icon-sheet', cols=c, rows=r, parts=list(parts), batch=BATCH,
                 images=[G.GEAR_ANCHOR, G.ICONS_OLD], prompt=_prompt(sid, c, r, parts))
            for sid, (c, r, parts) in SAMPLE_SHEETS.items()]


def attempts(sid):
    d = RAW / sid
    files = [p for p in d.glob(f'a*/{sid}-a*.png') if not p.stem.endswith('-magenta')] if d.exists() else []
    return sorted(files, key=lambda p: int(p.stem.rsplit('-a', 1)[1]))


def _selected(argv):
    only = G._opt(argv, 'only')
    return [j for j in sample_jobs() if not only or j['id'] in only.split(',')]


def gen(argv):
    """One new attempt per selected sheet, one codex call at a time, each in a new empty folder; refuses past a2.
    Returns False (and stops) when codex gives no image (a usage limit or a failed call)."""
    for job in _selected(argv):
        sid = job['id']
        k = max([int(p.stem.rsplit('-a', 1)[1]) for p in attempts(sid)] + [0]) + 1
        if k > CAP: raise PermissionError(f'{sid} is at its attempt cap a{CAP}; stop and report')
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
            import party
            fixed = party.recover(wd, name, start, time.time())
            if fixed: print(f'[recovered {sid} a{k}] codex saved {fixed}', flush=True)
        if not (wd / name).exists():
            print(f'[no output] {sid} a{k}; stopping (check the codex log in {wd} for a usage limit)', flush=True); return False
    return True


def interior_holes(path):
    """Transparent pixels enclosed by the subject on a final PNG (the raw alpha, with no background hint: the
    skill-cell QA discounts a pocket whose source pixels were the key, which is exactly what an over-erased fill is)."""
    import numpy as np
    from PIL import Image
    a = np.asarray(Image.open(path).convert('RGBA'))[..., 3]
    return int(A._enclosed_transparent(a, small=a.size).sum())   # every pocket: a chip symbol is solid


def process_job(reg, job, raw, workdir, record=False, parts=None):
    """Cut the sheet on its magenta lanes; each part's native icons from its cell. record=True marks them for the
    sample review (status `review` when QA passed, else `qa_failed`; batch, sheet, attempt; never a runtime path)."""
    from PIL import Image
    img = Image.open(raw).convert('RGB'); out = {}
    m = re.search(r'-(a\d+)$', Path(raw).stem); attempt = m.group(1) if m else None
    for cell, part in zip(P.sheet_cells(img, job['cols'], job['rows']), job['parts']):
        if parts and part not in parts: continue
        tab, tree = sizes_of(part)
        res = A.process_skill_cell(reg, part, cell, workdir, raw, tab=tab, tree=tree)
        if kind_of(part) != 'skill':   # both sizes come from the same cell: an erased fill in either fails the part
            pockets = {aid: interior_holes(Path(workdir) / f'{aid}.png') for aid in res}
            erased = any(n > HOLE_MAX for n in pockets.values())
            for aid, q in res.items():
                q['interior_holes'] = pockets[aid]
                if erased and 'interior erased' not in q['reasons']:
                    q['reasons'].append('interior erased'); q['pass'] = False
                Path(workdir, f'{aid}.qa.json').write_text(json.dumps(q, indent=2), encoding='utf-8')
                reg.set(aid, qa=q, status='qa_passed' if q['pass'] else 'qa_failed')
        for aid, q in res.items():
            if record:
                reg.set(aid, status='review' if q['pass'] else 'qa_failed', batch=BATCH, sheet=job['id'], g4_kind=kind_of(part),
                        chosen_attempt=attempt)
        out.update(res)
    return out


def cand(argv):
    for job in _selected(argv):
        for raw in attempts(job['id']):
            k = raw.stem.rsplit('-a', 1)[1]; wd = WORK / job['id'] / 'cand' / f'a{k}'
            reg = A.Registry(wd / 'cand-registry.json')
            try:
                res = process_job(reg, job, raw, wd)
            except ValueError as e:
                print(f'[cand {job["id"]} a{k}] FAILED: {e}', flush=True); continue
            for aid, q in res.items():
                print(f'[cand {job["id"]} a{k}] {aid}: {"pass" if q["pass"] else q["reasons"]} {q.get("subject")}', flush=True)


def pick(argv):
    sid = G._arg(argv, '--id'); k = int(G._arg(argv, '--attempt')); part = G._arg(argv, '--part')
    job = next(j for j in sample_jobs() if j['id'] == sid)
    raw = RAW / sid / f'a{k}' / f'{sid}-a{k}.png'
    reg = G._registry()
    res = process_job(reg, job, raw, WORK / sid, record=True, parts=[part] if part else None)
    e = reg.data['assets'].get(sid, {})
    picks = dict(e.get('picks', {}), **{p: f'a{k}' for p in ([part] if part else job['parts'])})
    reg.set(sid, chosen_attempt=f'a{k}' if not part else e.get('chosen_attempt', f'a{k}'), picks=picks, batch=BATCH, kind='icon-sheet',
            parts=list(job['parts']), prompt=f'art-factory/starlantern/prompts/{sid}.txt', status='review',
            raws={**e.get('raws', {}), f'a{k}': str(raw)})
    print(json.dumps({a: q['pass'] for a, q in res.items()}))


if __name__ == '__main__':
    cmd, rest = sys.argv[1], sys.argv[2:]
    {'gen': gen, 'cand': cand, 'pick': pick}[cmd](rest)
