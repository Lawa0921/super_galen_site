"""faces.py: talking-face candidates for the eight companions (plan 5e; spec 2026-10-18 affinity-expressions section 10).

  (every command takes --wave=2 for the wave-2 jobs: Lorne, both Rin sets, and the four redos;
   --wave=3 for Safira's serious, Noel's pout and Selene's third wistful, each capped by its job's `max_attempts`)
  gen  [--only=prefix,...] [--n=N] [--model=M] [--backend=codex|gemini] generate codex attempts one at a time until each id has N raw attempts
  cand [--only=prefix,...]                  postprocess every raw attempt into work/<id>/cand/a<N>/ (scratch registry) + match QA
  pick --id ID --attempt N [--wave=2]       postprocess the chosen attempt into the real registry (qa_passed / qa_failed)
  note --id ID --attempt N --reason R       record why an attempt was not chosen (registry `rejected_attempts`)

Same chain as party.py's mood portraits: each face <- the character's published normal portrait (raw, first image) and
standee (raw, second image), with the sentence of spec 10.5. Differences from party.py:
- every attempt runs codex in its own new, empty folder `raw/<id>/a<N>/` (codex sometimes saves under its own name;
  an empty folder makes that stray file the only candidate for `party.recover`);
- the downscale uses the base portrait's own block, not `--height 115`, so a face has exactly the base's pixel scale,
  and `match_qa` checks the result against the base portrait (canvas size, scale, palette).
Nothing here approves or publishes.
"""
import json, subprocess, sys, time
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sl_art as A  # noqa: E402
import party as P  # noqa: E402

REPO, AF, RAW, PROMPTS, TOOLS = P.REPO, P.AF, P.RAW, P.PROMPTS, P.TOOLS
COMPANIONS = ['selene', 'chizuru', 'safira', 'sylvie', 'noel', 'bobby', 'liz', 'scarlet']
# Spec 10.5 sentences. `sad` was strengthened after the sample (user 2026-10-23): the spec's hero/Rin sentence read too
# faintly at game size, so it now asks for the cues that survive the downscale; `hushed` and `shaken` carry them too.
READ = 'the expression must stay clearly readable when the portrait is shown at small size'
FACES = {
    'serious': 'a firm, focused look, brows level and slightly lowered, lips pressed together, steady eyes looking straight ahead',
    'sad': ('quietly sad and downcast: the inner ends of the eyebrows raised and drawn together, eyes lowered and wet with a single small tear '
            f'on one cheek, the corners of the mouth clearly turned down, head tilted slightly down; {READ}'),
    'vow': 'formal and resolute, chin up, eyes steady, a gloved hand raised to her chest in an oath',
    'shaken': ('eyes wide and unsteady, the inner ends of the eyebrows raised and knitted together, lips parted, composure cracking; '
               f'{READ}'),
    'solemn': 'eyes closed, head slightly bowed, a composed prayerful calm',
    'wistful': 'a faint, distant smile with lowered eyes, as if holding back words',
    'hushed': ('suddenly quiet, a small still sadness: eyes lowered, the inner ends of the eyebrows raised a little, lips closed with the corners '
               f'turned down a little; {READ}'),
}
# Wave 1 (runs/expressions-proposal.md): the faces that give every hidden grave line a portrait, plus Liz's `hushed`.
WAVE1 = {
    'scarlet': ['serious', 'sad', 'vow', 'shaken'], 'chizuru': ['serious', 'sad', 'solemn'], 'sylvie': ['serious', 'sad'],
    'selene': ['sad', 'wistful'], 'safira': ['sad'], 'bobby': ['serious', 'sad'], 'liz': ['serious', 'sad', 'hushed'], 'noel': ['sad'],
}
# Wave 2 (user 2026-10-24): the grave faces Lorne and Rin use (story.ts: hero serious 15, distant 18; rin serious 16,
# guarded 7). Rin's two looks (`rin`, `rin-oath`: cracked vs flattened collar bell) each get their own, from their own
# normal portrait (spec 10.5). Lorne's normal smiles faintly, so his serious face says outright that the smile is gone.
WAVE2 = {'hero': ['serious', 'distant'], 'rin': ['serious', 'guarded'], 'rin-oath': ['serious', 'guarded']}
WAVE2_FACES = {
    ('hero', 'serious'): ('a serious, focused look with no smile at all: brows level and lowered a little, steady alert eyes looking straight ahead, '
                          f'lips pressed into a flat straight line, the face of someone about to act; {READ}'),
    ('hero', 'distant'): ('a distant look, as if hearing a faraway voice: eyes unfocused and soft, gazing slightly past the viewer into the distance, '
                          f'brows relaxed and raised a little, lips slightly parted, no smile; {READ}'),
    ('rin', 'serious'): ('dead serious and direct: brows lowered and drawn a little together, cool eyes fixed straight on the viewer without blinking, '
                         f'lips pressed thin, face turned more toward the viewer than in the first image; {READ}'),
    ('rin', 'guarded'): ('guarded and wary: eyes half-lidded and watchful, glancing sideways at the viewer, chin lowered, lips closed in a flat line, '
                         f'one hand risen to her chest gripping the hilt of a short dagger held close against her chest, below the collar bell; {READ}'),
}
WAVE2_FACES.update({('rin-oath', m): f for (c, m), f in WAVE2_FACES.items() if c == 'rin'})
WHO = {'hero': dict(who='young man', pron='him', extra=' He carries no sword in this portrait.')}
BELL = {'rin': ' Keep the small cracked bronze bell at her collar exactly as in the first image.',
        'rin-oath': ' Keep the bronze bell at her collar exactly as in the first image: hammered flattened into a smooth dented disc, with no crack.'}
# Redos of wave-1 faces that read weakly at game size (wave-1 notes; user 2026-10-24): one more attempt each.
SAD_HARD = ('clearly sad, close to tears: the inner ends of the eyebrows steeply raised and knitted together, eyes lowered and glistening with a '
            'visible tear running down one cheek, the corners of the mouth clearly turned down in a small frown, head bowed a little, '
            'no trace of a smile; exaggerate the brows, the tear and the mouth so the sadness reads at a glance when the portrait is shown at small size')
REDO = {
    'char-scarlet-portrait-vow': ('swearing a knight\'s oath: her right gauntleted hand pressed flat over her heart, the armoured hand large and clearly visible '
                                  'across the middle of her chest, chin raised, eyes wide open, bright and steady, brows firm but not frowning, '
                                  f'lips closed in a calm resolute line, solemn pride rather than anger; {READ}'),
    'char-selene-portrait-wistful': ('wistful and nostalgic: a soft, distant half-smile with one corner of the mouth gently raised, eyes half-lidded and '
                                     'gazing off to the side into the distance as if remembering something long ago, brows relaxed, no tears, '
                                     f'a quiet fondness tinged with longing, clearly different from a sad face and from a bright smile; {READ}'),
    'char-noel-portrait-sad': SAD_HARD,
    'char-bobby-portrait-sad': SAD_HARD,
}
# Appended from attempt 2 on, after looking at a1 (runs/2026-10-24-faces-wave2/notes.md), like party.NOTES.
WAVE2_NOTES = {
    'char-hero-portrait-distant': (' Revision: his eyes stay open and level, looking off past the viewer into the far distance (not downward), '
                                   'the pupils small and unfocused, brows raised a little, lips slightly parted, as if listening to a voice only he can hear; '
                                   'it must look clearly different from a sad face.'),
    'char-rin-oath-portrait-serious': (' Revision: make it unmistakably different from the calm first image: brows clearly lowered and angled down toward '
                                       'the nose, eyes narrowed a little and locked straight on the viewer, mouth a tight short line; readable at small size.'),
}
REDO_ATTEMPTS = 2    # a redo id ends at a2: its wave-1 a1 plus this one
# Wave 3 (2026-10-24; runs/2026-10-24-faces-wave3/notes.md): the five heavy lines that still showed no portrait, Safira's
# memory line (surprised, which a heavy scene maps to serious) and Noel's four pout lines (pout -> serious). Safira gets
# serious, the face a heavy scene falls back to; Noel gets her own pout, which the four lines (and her three light pout
# lines) ask for by name, sulky rather than cute so it holds in a grave scene.
WAVE3 = {'safira': ['serious'], 'noel': ['pout']}
WAVE3_FACES = {
    ('safira', 'serious'): ('a serious, grave look with no smile at all: brows level and lowered a little, steady eyes looking straight ahead, '
                            f'lips pressed into a flat straight line, the warmth of the first image gone from her face; {READ}'),
    ('noel', 'pout'): ('a sulky, stubborn pout with no smile: lips pushed out into a small pout with the corners turned down, cheeks puffed a little, '
                       'brows drawn together and lowered, eyes glancing sideways away from the viewer, no blush, proud and a little hurt; '
                       f'{READ}'),
}
# Selene's wistful, a third attempt (user 2026-10-24: one extra, after wave 2's a2 still read as sad): the cues that survive
# the downscale, a smile you can see and eyes that look down.
WAVE3_REDO = {
    'char-selene-portrait-wistful': ('wistful: a soft, gentle smile that is clearly visible, the corners of the mouth turned up in a small closed-mouth curve, '
                                     'eyelids lowered so the eyes are half closed and looking down and off to the side, brows relaxed and smooth, '
                                     'head tilted slightly down, no tears, a quiet fond memory; clearly different from the first image (open eyes looking '
                                     f'at the viewer) and from a sad face (no frown, no raised inner brows); {READ}'),
}
WAVE3_NOTES = {}      # revision sentences for a2, written after looking at a1 (as WAVE2_NOTES)
WAVE3_MAX = 2         # a new wave-3 face: a1, and a2 only if a1 is weak
WAVE3_REDO_MAX = 3    # Selene's wistful ends at a3
SIZE_TOL = 6         # art pixels the face's canvas may differ from the base portrait's on either axis
PALETTE_DIST = 24     # RGB distance under which a colour counts as one of the base portrait's
PALETTE_SHARE = 0.8   # below this share of base-palette pixels the face is flagged for the reviewer (warning only)


def _registry():
    return json.loads((AF / 'registry.json').read_text(encoding='utf-8'))['assets']


def _job(reg, c, m, face):
    pid, sid = f'char-{c}-portrait', f'char-{c}-standee'
    w = WHO.get(c, dict(who='girl', pron='her', extra=''))
    return dict(id=f'{pid}-{m}', cid=c, mood=m, base=pid, deps=[pid, sid], batch=f'faces-{c}',
                images=[Path(reg[pid]['raw']), Path(reg[sid]['raw'])], block=reg[pid]['qa']['block'], prompt=(
        f'Square bust portrait in pixel art of exactly the same {w["who"]} as the first attached portrait, same framing, head size, palette, hair and outfit '
        f'(the second attached image is the same character in full body, for reference only), but {face}. '
        f'Keep the face recognisably the same person.{w["extra"]}{BELL.get(c, "")} 16-bit JRPG dialogue portrait style, {P.PIX}. '
        f'Perfectly flat solid pure magenta #FF00FF background around {w["pron"]} with empty margin at the top and sides; the body is cut off by the bottom edge. No frame, no text.'))


def jobs(reg=None, cids=None, wave=1):
    """wave 1: the companions' 18 faces (FACES). wave 2: Lorne's and both Rin sets' grave faces, then the REDO prompts of
    four wave-1 ids (same ids, so a new attempt lands beside the approved a1)."""
    reg = _registry() if reg is None else reg
    has = lambda c: reg.get(f'char-{c}-portrait', {}).get('raw') and reg.get(f'char-{c}-standee', {}).get('raw')
    if wave == 1:
        return [_job(reg, c, m, FACES[m]) for c in (cids or COMPANIONS) if has(c) for m in WAVE1[c]]
    if wave == 3:
        out = [dict(_job(reg, c, m, WAVE3_FACES[(c, m)]), max_attempts=WAVE3_MAX) for c in WAVE3 if has(c) and (not cids or c in cids) for m in WAVE3[c]]
        for aid, face in WAVE3_REDO.items():
            c, m = aid[5:].rsplit('-portrait-', 1)
            if has(c) and (not cids or c in cids): out.append(dict(_job(reg, c, m, face), max_attempts=WAVE3_REDO_MAX))
        for j in out: j['prompt'] += WAVE3_NOTES.get(j['id'], '')
        return out
    out =[_job(reg, c, m, WAVE2_FACES[(c, m)]) for c in WAVE2 if has(c) and (not cids or c in cids) for m in WAVE2[c]]
    for j in out: j['prompt'] += WAVE2_NOTES.get(j['id'], '')
    for aid, face in REDO.items():
        c, m = aid[5:].rsplit('-portrait-', 1)
        if has(c) and (not cids or c in cids): out.append(_job(reg, c, m, face))
    return out


def attempt_dir(aid, k):
    d = RAW / aid / f'a{k}'
    if d.exists() and any(d.iterdir()): raise FileExistsError(f'{d} is not empty; every attempt needs a new, empty folder')
    return d


def next_attempt(aid):
    """The next attempt number: after every a<N> folder, including failed ones (their logs stay as evidence)."""
    ks = [int(d.name[1:]) for d in (RAW / aid).glob('a*') if d.is_dir() and d.name[1:].isdigit()]
    return max(ks + [0]) + 1


def attempts(aid):
    files = [p for p in (RAW / aid).glob(f'a*/{aid}-a*.png') if not p.stem.endswith('-magenta')]
    return sorted(files, key=lambda p: int(p.stem.rsplit('-a', 1)[1]))


def _opaque_rgb(png):
    a = np.asarray(Image.open(png).convert('RGBA')).reshape(-1, 4)
    return a[a[:, 3] == 255][:, :3].astype(np.int32)


def match_qa(final, base, base_block, block):
    """The face against its base portrait: same pixel scale, a canvas within SIZE_TOL, and (warning) the base palette."""
    fw, fh = Image.open(final).size; bw, bh = Image.open(base).size
    m = {'pass': True, 'reasons': [], 'warnings': [], 'base_size': [bw, bh], 'size_delta': [fw - bw, fh - bh],
         'block': block, 'base_block': base_block}
    if block != base_block:
        m['reasons'].append('pixel scale differs from the base portrait')
    if abs(fw - bw) > SIZE_TOL or abs(fh - bh) > SIZE_TOL:
        m['reasons'].append('canvas differs from the base portrait')
    new, pal = _opaque_rgb(final), np.unique(_opaque_rgb(base), axis=0)
    if len(new) and len(pal):
        near = np.zeros(len(new), bool)
        for i in range(0, len(new), 4096):
            d = np.abs(new[i:i + 4096, None, :] - pal[None, :, :]).sum(-1).min(1)
            near[i:i + 4096] = d <= PALETTE_DIST
        m['palette_share'] = round(float(near.mean()), 3)
    else:
        m['palette_share'] = 0.0
    if m['palette_share'] < PALETTE_SHARE: m['warnings'].append('palette far from the base portrait')
    m['pass'] = not m['reasons']
    return m


def prompt_text(job, backend='codex'):
    """One line. codex gets party.GEN (use its image tool once, no post-processing); gemini answers with the image itself."""
    return job['prompt'].strip() + (' ' + P.GEN if backend == 'codex' else ' Return only the image, a square picture.')


def write_prompt(job, backend='codex'):
    PROMPTS.mkdir(exist_ok=True)
    (PROMPTS / f'{job["id"]}.txt').write_text(prompt_text(job, backend) + '\n', encoding='utf-8')


def scaled_block(base_block, base_width, raw_width):
    """The base portrait's block in the new raw's pixels: same art-pixel scale when the generator's canvas size differs
    (codex raws are 1254 px; gemini returns its own size)."""
    return max(1, round(base_block * raw_width / base_width))


def postprocess_flags(generator):
    """Registry repair flags per generator: gemini outlines carry about 4x the key spill of the codex base portraits, which
    `defringe: strong` + `neutralize_tint` bring back to the base level (runs/2026-10-23-faces-sample/notes.md)."""
    return {'defringe': 'strong', 'neutralize_tint': True} if generator.startswith('gemini') else {}


def registry_fields(generator):
    """What a postprocess writes to the asset's entry: the generator, and the repair flags reset to that generator's own."""
    return {'generator': generator, 'defringe': None, 'neutralize_tint': None, **postprocess_flags(generator)}


def generator_of(raw):
    gen = Path(raw).with_name(f'{Path(raw).stem}.gen.json')
    rec = json.loads(gen.read_text(encoding='utf-8')) if gen.exists() else {}
    if rec.get('generator'): return rec['generator']
    model = rec.get('model')
    log = Path(raw).with_name(f'{Path(raw).stem}.codex.log')
    if not model and log.exists():   # the config default: codex prints the model it used in its log header
        model = next((l.split(':', 1)[1].strip() for l in log.read_text(encoding='utf-8', errors='replace').splitlines()[:12] if l.startswith('model:')), None)
    return 'codex' + (f'/{model}' if model else '')


def selected(argv):
    only = next((a.split('=', 1)[1].split(',') for a in argv if a.startswith('--only=')), None)
    wave = int(next((a.split('=', 1)[1] for a in argv if a.startswith('--wave=')), 1))
    return [j for j in jobs(wave=wave) if not only or any(j['id'].startswith(o) for o in only)]


def _model(argv):
    return next((a.split('=', 1)[1] for a in argv if a.startswith('--model=')), None)


def _backend(argv):
    return next((a.split('=', 1)[1] for a in argv if a.startswith('--backend=')), 'codex')


def target(job, n):
    """How many raw attempts an id may have: --n, but never past the job's own cap (wave 3)."""
    return min(n, job.get('max_attempts', n))


def gen(argv):
    """Strictly one codex call at a time (codex_still must not run in parallel). --model=NAME overrides the codex config
    model for these calls only (2026-10-23: the config default was refused by the account, see runs/ notes)."""
    model, backend = _model(argv), _backend(argv)
    n = int(next((a.split('=', 1)[1] for a in argv if a.startswith('--n=')), 2))
    for job in selected(argv):
        tries, want = 0, target(job, n)
        while len(attempts(job['id'])) < want and tries < want:   # never more calls than asked for, even when some fail
            tries += 1
            k = next_attempt(job['id'])
            wd, name = attempt_dir(job['id'], k), f'{job["id"]}-a{k}.png'
            write_prompt(job, backend)
            argv2 = [sys.executable, str(TOOLS / 'codex_still.py'), 'generate', '--workdir', str(wd), '--name', name,
                     '--prompt-file', str(PROMPTS / f'{job["id"]}.txt')]
            for im in job['images']: argv2 += ['--image', str(im)]
            if model: argv2 += ['--model', model]
            if backend != 'codex': argv2 += ['--backend', backend]
            start = time.time()
            g = subprocess.run(argv2, cwd=REPO, capture_output=True, text=True, encoding='utf-8', errors='replace')
            print(f'[gen {job["id"]} a{k}] rc={g.returncode} {g.stdout.strip()[-200:]}', flush=True)
            fixed = P.recover(wd, name, start, time.time()) if backend == 'codex' else None
            if fixed: print(f'[recovered {job["id"]} a{k}] codex saved {fixed}; the fallback copy was replaced', flush=True)
            if not (wd / name).exists():
                print(f'[no output] {job["id"]} a{k}; stopping this id', flush=True); break


def process_attempt(reg, job, raw, workdir):
    if 'allow_edge' not in reg.data['assets'].get(job['id'], {}):
        reg.set(job['id'], allow_edge=['bottom'])
    from PIL import Image as _I
    breg = _registry()[job['base']]
    block = scaled_block(job['block'], _I.open(breg['raw']).width, _I.open(raw).width)
    reg.set(job['id'], **registry_fields(generator_of(raw)))
    q = A.process(reg, job['id'], raw, 'sprite', workdir=workdir, block=block)[job['id']]
    m = match_qa(Path(workdir) / f'{job["id"]}.png', REPO / breg['final'], block, q['block'])
    (Path(workdir) / f'{job["id"]}.match.json').write_text(json.dumps(m, indent=2), encoding='utf-8')
    return q, m


def cand(argv):
    for job in selected(argv):
        for raw in attempts(job['id']):
            k = raw.stem.rsplit('-a', 1)[1]; wd = AF / 'work' / job['id'] / 'cand' / f'a{k}'
            q, m = process_attempt(A.Registry(wd / 'cand-registry.json'), job, raw, wd)
            print(f'[cand {job["id"]} a{k}] qa={"pass" if q["pass"] else q["reasons"]} warn={q.get("warnings")} holes={q.get("holes")} '
                  f'size={q.get("size")} match={"pass" if m["pass"] else m["reasons"]} delta={m["size_delta"]} palette={m["palette_share"]}', flush=True)


def pick(argv):
    aid, k = P._arg(argv, '--id'), P._arg(argv, '--attempt')
    job = next(j for j in selected(argv) if j['id'] == aid)
    reg = A.Registry(AF / 'registry.json')
    reg.set(aid, kind='sprite')
    raw = RAW / aid / f'a{k}' / f'{aid}-a{k}.png'
    q, m = process_attempt(reg, job, raw, AF / 'work' / aid)
    reg.set(aid, chosen_attempt=f'a{k}', source_id=aid, batch=job['batch'], runtime=P.runtime(aid), depends_on=job['deps'], match=m)
    if not m['pass']: reg.set(aid, status='qa_failed')
    print(json.dumps({'qa': q, 'match': m}, ensure_ascii=False))


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    {'gen': gen, 'cand': cand, 'pick': pick, 'note': P.note}[cmd](sys.argv[2:])
