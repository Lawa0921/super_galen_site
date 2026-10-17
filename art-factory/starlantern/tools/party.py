"""party.py: art candidates for the hero (洛恩, `hero`) and the starting companion (凜, `rin`, and her post-choice set `rin-oath`).

Spec: docs/superpowers/specs/2026-10-17-starlantern-story-world-design.md sections 4, 5, 5.3 and 14.

  gen  [--only=prefix,...] [--n=N] [--extra=TEXT]   generate codex attempts (one at a time) until each id has N raw attempts
  cand [--only=prefix,...]                           postprocess every raw attempt into work/<id>/cand/a<N>/ (scratch registry)
  pick --id ID --attempt N                           postprocess the chosen attempt into the real registry (qa_passed/failed)
  note --id ID --attempt N --reason R                record why an attempt was not chosen (registry `rejected_attempts`)

Identity chain (the same person in every image): standee <- approved style anchor; portrait <- chosen standee;
mood portraits <- chosen portrait + chosen standee; rin-oath-* <- the chosen rin-* image of the same mood, edited so only
the collar bell changes. A job whose dependency has no chosen attempt is skipped. Nothing here approves or publishes.
"""
import json, re, shutil, subprocess, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sl_art as A  # noqa: E402

REPO = Path(__file__).resolve().parents[3]
AF = REPO / 'art-factory/starlantern'
RAW = Path('C:/Users/bag57/art-refs/starlantern/raw')
PROMPTS = AF / 'prompts'
TOOLS = AF / 'tools'
GEN = 'Generate the image once with the image tool; do not post-process, resize, quantize or regenerate it.'
PIX = 'strict square pixel grid, crisp 1px dark outline, limited palette, light from upper left, no anti-aliasing, no blur, no gradients'
ORIGINAL = 'The design must be original and not resemble any existing anime or game character.'
HEIGHT = {'standee': 280, 'portrait': 115}   # same targets as the approved eight (batch.py HEIGHT)
BATCH = 'hero-rin'

# Approved art of other characters, used only as style / framing anchors (never for identity).
STYLE_STANDEE = [RAW / 'char-scarlet-standee/char-scarlet-standee-a1.png', RAW / 'char-chizuru-standee/char-chizuru-standee-a1.png']
STYLE_PORTRAIT = RAW / 'char-scarlet-portrait/char-scarlet-portrait-a1.png'

HERO = ('an original young male swordsman of about eighteen, the only boy in a party of heroines, drawn in the same gentle anime JRPG style as the girls (slim, youthful, soft handsome face, not bulky): '
        'tousled dark brown hair with a longer fringe falling between the eyes and a few strands sticking up at the back, calm steel-blue eyes, '
        'a worn midnight-blue travel coat with a high collar and frayed hem over a dark leather vest and a cream shirt, a tattered pale grey half cape over his left shoulder, '
        'brown leather gloves, belt with a small pouch, dark trousers and brown boots, '
        'and a straight longsword with a dark steel blade engraved along its whole length with faintly glowing pale-gold unreadable runes and a small lantern-shaped pommel')
RIN = ('an original quiet assassin girl of about sixteen: short black hair with a single silver-white lock on the left side of her face, cool grey-violet eyes, '
       'a dark charcoal hooded short cloak (hood down) fastened at the collar by a small bronze bell with a visible crack in it, a dark fitted tunic and shorts with dark tights, '
       'a strap of thin throwing needles bound around her right thigh, a pale old scar across her left wrist, soft dark boots, and a short dagger in each hand')
OATH_BELL = ('the small bronze bell at her collar no longer has a crack: it has been hammered flat by her own hand into a smooth, slightly dented bronze disc that can never ring again, '
             'with a faint warm shine, still fastening the cloak at the same place')
CHARS = {
    'hero': dict(desc=HERO, who='young man', pron='him', poss='his', calm='calm, quietly determined expression with a faint kind smile',
                 aura='a burst of pale gold lantern light and glowing rune sparks behind him, the rune blade raised and shining'),
    'rin': dict(desc=RIN, who='girl', pron='her', poss='her', calm='cool, reserved expression, a little guarded',
                aura='a burst of cold silver and pale violet light behind her, a dagger raised in a reverse grip, a few throwing needles glinting'),
}
FACES = {
    'hit': 'wincing in pain at the moment of being hit, one eye squeezed shut, a small scratch on the cheek, hair slightly messy',
    'attack': 'shouting a fierce battle cry, mouth open, sharp determined eyes, leaning forward into an attack',
    'dying': 'badly hurt and exhausted, bruised and dirty face, torn collar, sweat, half-closed eyes, breathing heavily',
    'down': 'knocked out and collapsed, eyes closed, head tilted down, battered and dusty, hair dishevelled',
    'ultimate': 'unleashing {poss} ultimate technique: intense heroic expression, glowing eyes, wind-swept hair, {aura}',
    'smile': 'a soft, warm, genuine smile, eyes gently narrowed, relaxed brows, a calm happy moment',
    'sad': 'quietly sad and downcast, eyebrows drawn up, eyes lowered and glistening, mouth a small frown, a heavy moment',
}
MOODS = list(FACES)

# Revisions appended from attempt 3 on, after looking at the first two (filled in during review).
NOTES = {
    # a1/a2: the raised rune sword and the light burst ran off the left edge along most of its height.
    'char-hero-portrait-ultimate': (' Revision: keep the head the same size and position as in the attached portrait; hold the rune sword upright close beside his face '
                                    'so the whole blade, hilt and every ray of the gold light burst stay well inside the canvas with an empty magenta margin at the top, left and right; '
                                    'only the shoulders may reach the bottom edge.'),
}


def runtime(aid):
    return f'{A.BASE}char/{aid[5:]}.png'


def chosen_raw(aid):
    e = json.loads((AF / 'registry.json').read_text(encoding='utf-8'))['assets'].get(aid, {})
    return Path(e['raw']) if e.get('chosen_attempt') and e.get('status') in ('qa_passed', 'approved', 'published') else None


def jobs():
    out = []
    for c, d in CHARS.items():
        sid, pid = f'char-{c}-standee', f'char-{c}-portrait'
        out.append(dict(id=sid, kind='standee', images=list(STYLE_STANDEE), deps=[], prompt=(
            f'Full-body pixel art character sprite of {d["desc"]}. '
            'Match the art style, proportions, pixel density, outline and colouring of the attached images, which show approved sprites of two different characters from the same game; do not copy their faces, hair, outfits or weapons. '
            f'Standing three-quarter view facing the viewer and slightly left, relaxed idle pose, {d["calm"]}, about 5 heads tall, the whole figure and weapon fully inside the canvas. '
            f'16-bit JRPG style, {PIX}. Centred on a perfectly flat solid pure magenta #FF00FF background with generous empty space around {d["pron"]}. No text, no labels, no ground shadow, no particles. {ORIGINAL}')))
        out.append(dict(id=pid, kind='portrait', images=[STYLE_PORTRAIT], deps=[sid], prompt=(
            f'Square bust portrait in pixel art of exactly the same {d["who"]} as the first attached full-body sprite ({d["desc"]}): same face, hair, eye colour and outfit. '
            f'Head and shoulders only, {d["calm"]}, facing slightly left; the body is cut off by the bottom edge of the picture. '
            'Match the framing, head size, pixel density, outline and colouring of the second attached image, an approved dialogue portrait of a different character from the same game; do not copy her face, hair or outfit. '
            f'16-bit JRPG dialogue portrait style, {PIX}. Perfectly flat solid pure magenta #FF00FF background around {d["pron"]} with empty margin at the top and sides, no frame, no text.')))
        for m, face in FACES.items():
            out.append(dict(id=f'{pid}-{m}', kind='portrait', images=[], deps=[pid, sid], prompt=(
                f'Square bust portrait in pixel art of exactly the same {d["who"]} as the first attached portrait, same framing, head size, palette, hair and outfit '
                f'(the second attached image is the same character in full body, for reference only), but {face.format(**d)}. '
                f'Keep the face recognisably the same person. 16-bit JRPG dialogue portrait style, {PIX}. '
                f'Perfectly flat solid pure magenta #FF00FF background around {d["pron"]} with empty margin at the top and sides; the body is cut off by the bottom edge. No frame, no text.')))
    # Rin after her choice (spec 5.3): the same images with only the collar bell changed.
    for suffix in ['standee', 'portrait'] + [f'portrait-{m}' for m in MOODS]:
        src = f'char-rin-{suffix}'
        out.append(dict(id=f'char-rin-oath-{suffix}', kind='standee' if suffix == 'standee' else 'portrait', images=[], deps=[src], prompt=(
            'Redraw the attached pixel art image exactly: identical pose, face, expression, hair, outfit, weapons, framing, size, pixel density and palette. '
            f'Change only one detail: {OATH_BELL}. Make the flattened bell disc clearly visible at the collar. '
            f'16-bit JRPG pixel art, {PIX}. Perfectly flat solid pure magenta #FF00FF background, no frame, no text.')))
    return out


def attempts(aid):
    files = [p for p in (RAW / aid).glob(f'{aid}-a*.png') if not p.stem.endswith('-magenta')]
    return sorted(files, key=lambda p: int(p.stem.rsplit('-a', 1)[1]))


def write_prompt(job, extra=''):
    PROMPTS.mkdir(exist_ok=True)
    (PROMPTS / f'{job["id"]}.txt').write_text(job['prompt'].strip() + extra + ' ' + GEN + '\n', encoding='utf-8')


def selected(argv):
    only = next((a.split('=', 1)[1].split(',') for a in argv if a.startswith('--only=')), None)
    exact = '--exact' in argv
    return [j for j in jobs() if not only or any((j['id'] == o) if exact else j['id'].startswith(o) for o in only)]


def gen(argv):
    n = int(next((a.split('=', 1)[1] for a in argv if a.startswith('--n=')), 2))
    extra = next((a.split('=', 1)[1] for a in argv if a.startswith('--extra=')), '')
    for job in selected(argv):
        dep_raws = [chosen_raw(d) for d in job['deps']]
        if any(r is None for r in dep_raws):
            print(f'[skip] {job["id"]}: dependency {job["deps"]} has no chosen attempt', flush=True); continue
        while len(attempts(job['id'])) < n:
            k = max([int(p.stem.rsplit('-a', 1)[1]) for p in attempts(job['id'])] + [0]) + 1
            write_prompt(job, (NOTES.get(job['id'], '') if k >= 3 else '') + ((' ' + extra) if extra else ''))
            argv2 = [sys.executable, str(TOOLS / 'codex_still.py'), 'generate', '--workdir', str(RAW / job['id']), '--name', f'{job["id"]}-a{k}.png',
                     '--prompt-file', str(PROMPTS / f'{job["id"]}.txt')]
            for im in dep_raws + job['images']: argv2 += ['--image', str(im)]
            start = time.time()
            g = subprocess.run(argv2, cwd=REPO, capture_output=True, text=True, encoding='utf-8', errors='replace')
            print(f'[gen {job["id"]} a{k}] rc={g.returncode} {g.stdout.strip()[-200:]}', flush=True)
            fixed = recover(RAW / job['id'], f'{job["id"]}-a{k}.png', start, time.time())
            if fixed: print(f'[recovered {job["id"]} a{k}] codex saved {fixed}; the codex_still fallback copy was replaced', flush=True)
            if not (RAW / job['id'] / f'{job["id"]}-a{k}.png').exists():
                print(f'[no output] {job["id"]} a{k}; stopping this id', flush=True); break


def recover(workdir, name, since, until=None):
    """codex sometimes saves its copy under its own name (e.g. `<id>-20261017-single.png`); codex_still then falls back to
    the newest image in ~/.codex/generated_images, which with two lanes running can belong to the other lane. If codex
    left exactly one other new PNG in the workdir, that is the real output: put it in place, re-gate, and record it."""
    import codex_still as C
    workdir = Path(workdir); stem = Path(name).stem
    until = until or time.time()
    taken = {C._sha(p) for p in workdir.glob('*-a*.png') if p.name != name and re.fullmatch(r'.*-a\d+', p.stem)}
    stray = [p for p in workdir.glob('*.png') if since - 2 <= p.stat().st_mtime <= until + 2 and p.name != name and not p.stem.endswith('-magenta')
             and not re.fullmatch(r'.*-a\d+', p.stem) and C._sha(p) not in taken]
    if len(stray) != 1 or not (workdir / name).exists() or C._sha(stray[0]) == C._sha(workdir / name): return None
    wrong = C._sha(workdir / name)
    shutil.copyfile(stray[0], workdir / name)
    C.postprocess(workdir / name)
    rec_path = workdir / f'{stem}.gen.json'; rec = json.loads(rec_path.read_text(encoding='utf-8'))
    rec.update(output_sha256=C._sha(workdir / name), output_recovered_from=stray[0].name, fallback_sha256_discarded=wrong)
    rec_path.write_text(json.dumps(rec, indent=2, ensure_ascii=False), encoding='utf-8')
    return stray[0].name


def process_attempt(reg, job, raw, workdir):
    if job['kind'] == 'portrait' and 'allow_edge' not in reg.data['assets'].get(job['id'], {}):
        reg.set(job['id'], allow_edge=['bottom'])
    return A.process(reg, job['id'], raw, 'sprite', workdir=workdir, height=HEIGHT[job['kind']])


def cand(argv):
    for job in selected(argv):
        for raw in attempts(job['id']):
            k = raw.stem.rsplit('-a', 1)[1]; wd = AF / 'work' / job['id'] / 'cand' / f'a{k}'
            reg = A.Registry(wd / 'cand-registry.json')
            q = process_attempt(reg, job, raw, wd)[job['id']]
            print(f'[cand {job["id"]} a{k}] {"pass" if q["pass"] else q["reasons"]}{" " + str(q.get("warnings")) if q.get("warnings") else ""} holes={q.get("holes")} {q.get("size")}', flush=True)


def _arg(argv, name):
    return next((argv[i + 1] for i, a in enumerate(argv) if a == name and i + 1 < len(argv)), None)


def pick(argv):
    aid, k = _arg(argv, '--id'), _arg(argv, '--attempt')
    job = next(j for j in jobs() if j['id'] == aid)
    reg = A.Registry(AF / 'registry.json')
    reg.set(aid, kind='sprite')
    q = process_attempt(reg, job, RAW / aid / f'{aid}-a{k}.png', AF / 'work' / aid)[aid]
    reg.set(aid, chosen_attempt=f'a{k}', source_id=aid, batch=BATCH, runtime=runtime(aid), depends_on=job['deps'])
    print(json.dumps(q, ensure_ascii=False))


def note(argv):
    aid, k, reason = _arg(argv, '--id'), _arg(argv, '--attempt'), _arg(argv, '--reason')
    reg = A.Registry(AF / 'registry.json')
    e = reg.data['assets'].setdefault(aid, {}); rej = e.get('rejected_attempts', {}); rej[f'a{k}'] = reason
    reg.set(aid, rejected_attempts=rej)


def recover_cmd(argv):
    from datetime import datetime
    aid, k = _arg(argv, '--id'), _arg(argv, '--attempt')
    rec = json.loads((RAW / aid / f'{aid}-a{k}.gen.json').read_text(encoding='utf-8'))
    print(recover(RAW / aid, f'{aid}-a{k}.png', datetime.fromisoformat(rec['started']).timestamp(), datetime.fromisoformat(rec['finished']).timestamp()))


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    {'gen': gen, 'cand': cand, 'pick': pick, 'note': note, 'recover': recover_cmd}[cmd](sys.argv[2:])
