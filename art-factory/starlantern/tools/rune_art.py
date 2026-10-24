"""rune_art.py: art step 9 (G4) rune icons, sample batch only (spec 2026-10-20 skill-builds section 15).

  gen  [--n=1]                           one codex attempt at a time until the sample sheet has N raw attempts (cap a3)
  cand                                   postprocess every raw attempt into work/sheet-rune-sample/cand/a<N>/ (scratch registry)
  pick --attempt N                       postprocess the chosen attempt into the registry (qa_passed / qa_failed, batch rune-sample, no runtime)

A rune icon is a skill-style native icon (sl_art.process_skill_cell, controller ruling G3): `icon-<part>-16` for the
workshop rows (subject long edge 14) and `icon-<part>-14` for the battle menu (long edge 12), each coverage-sampled once
from the high-resolution cell. The tier is never drawn: the approved rarity frames (ui/rarity-<tier>.png) show it.
Nothing here approves, publishes or touches the game. Run from the repo root.
"""
import json, subprocess, sys, time
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


if __name__ == '__main__':
    cmd, rest = sys.argv[1], sys.argv[2:]
    {'gen': gen, 'cand': cand, 'pick': pick}[cmd](rest)
